"""
Update Service - Check for updates and perform system updates
"""
import os
import subprocess
import asyncio
import logging
from typing import Optional, Dict, Any
from datetime import datetime
import httpx

logger = logging.getLogger(__name__)

# Путь к корню проекта (монтируется через volume или хост)
# В Docker это /project, на хосте - определяется через переменную окружения
PROJECT_ROOT = os.environ.get('PROJECT_ROOT', '/project')
VERSION_FILE = os.path.join(PROJECT_ROOT, "VERSION")

# Для fallback - путь внутри контейнера где может быть VERSION
CONTAINER_VERSION_FILE = "/app/VERSION"

# GitHub token для доступа к приватным репозиториям (опционально)
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', None)

# Отключить проверку обновлений (для приватных репозиториев без токена)
DISABLE_UPDATE_CHECK = os.environ.get('DISABLE_UPDATE_CHECK', 'false').lower() == 'true'

# Статус обновления (in-memory)
update_status = {
    "is_updating": False,
    "started_at": None,
    "stage": None,
    "progress": 0,
    "error": None,
    "completed": False
}


def get_current_version() -> str:
    """Получить текущую версию из файла VERSION"""
    # Сначала пробуем файл из проекта (если монтирован)
    if os.path.exists(VERSION_FILE):
        try:
            with open(VERSION_FILE, "r") as f:
                return f.read().strip()
        except Exception as e:
            logger.error(f"Error reading VERSION file from project: {e}")
    
    # Fallback - читаем из контейнера
    if os.path.exists(CONTAINER_VERSION_FILE):
        try:
            with open(CONTAINER_VERSION_FILE, "r") as f:
                return f.read().strip()
        except Exception as e:
            logger.error(f"Error reading VERSION file from container: {e}")
    
    return "unknown"


def is_git_available() -> bool:
    """Проверить, доступен ли git"""
    try:
        result = subprocess.run(
            ["git", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False


def is_project_mounted() -> bool:
    """Проверить, смонтирован ли проект с .git"""
    git_dir = os.path.join(PROJECT_ROOT, ".git")
    return os.path.exists(git_dir)


def ensure_safe_directory():
    """Добавить PROJECT_ROOT в git safe.directory"""
    try:
        subprocess.run(
            ["git", "config", "--global", "--add", "safe.directory", PROJECT_ROOT],
            capture_output=True,
            timeout=5
        )
    except Exception:
        pass


def configure_git_for_public_access():
    """Настроить git для работы без аутентификации с публичным репозиторием"""
    try:
        # Отключить запросы пароля
        subprocess.run(
            ["git", "config", "--global", "credential.helper", ""],
            cwd=PROJECT_ROOT,
            capture_output=True,
            timeout=5
        )
        
        # Получить текущий remote URL
        remote_result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if remote_result.returncode == 0:
            current_url = remote_result.stdout.strip()
            
            # Если URL использует https с credentials, очистить их
            if "https://" in current_url and "@" in current_url:
                # Убрать credentials из URL
                clean_url = current_url.split("@")[-1]
                clean_url = "https://" + clean_url
                
                subprocess.run(
                    ["git", "remote", "set-url", "origin", clean_url],
                    cwd=PROJECT_ROOT,
                    capture_output=True,
                    timeout=5
                )
        
        return True
    except Exception as e:
        logger.warning(f"Could not configure git: {e}")
        return False


CORRECT_REPO_URL = "https://git.tzim.uz/markmorado/pvemanager"
_LEGACY_URLS = {"https://git.tzim.uz/dilshod/pve_manager", "https://github.com/markmorado/pvemanager"}


def get_repository_url_from_settings():
    """Get configured repository URL from database settings"""
    try:
        from ..db import SessionLocal
        from ..models import PanelSettings

        db = SessionLocal()
        try:
            setting = db.query(PanelSettings).filter(PanelSettings.key == "git_repository_url").first()
            if setting and setting.value and setting.value not in _LEGACY_URLS:
                return setting.value
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Could not get repository URL from settings: {e}")

    return CORRECT_REPO_URL


def parse_repo_url(url: str) -> tuple:
    """Parse repository URL to extract owner and repo name"""
    # Remove .git suffix
    url = url.replace(".git", "")
    
    # GitHub: https://github.com/owner/repo
    if "github.com" in url:
        parts = url.split("github.com/")
        if len(parts) == 2:
            owner_repo = parts[1].split("/")
            if len(owner_repo) >= 2:
                return owner_repo[0], owner_repo[1], "github"
    
    # GitLab or other Git hosting (Gitea, etc.)
    # https://git.tzim.uz/markmorado/pvemanager
    parts = url.split("://")
    if len(parts) == 2:
        path_parts = parts[1].split("/")
        if len(path_parts) >= 3:
            domain = path_parts[0]
            owner = path_parts[1]
            repo = path_parts[2]
            return owner, repo, domain
    
    return None, None, None


def _parse_version(v: str) -> tuple:
    """Parse version string into a tuple of ints for comparison, e.g. '1.0.3' -> (1, 0, 3)"""
    try:
        return tuple(int(x) for x in v.strip().split("."))
    except Exception:
        return (0,)


def _is_newer(remote: str, local: str) -> bool:
    """Return True only if remote version is strictly greater than local"""
    return _parse_version(remote) > _parse_version(local)


async def check_for_updates() -> Dict[str, Any]:
    """
    Проверить наличие обновлений через GitHub API
    Сравнивает локальную версию с удалённой
    """
    current_version = get_current_version()
    
    result = {
        "current_version": current_version,
        "latest_version": None,
        "update_available": False,
        "changelog": None,
        "error": None,
        "git_available": is_git_available(),
        "project_mounted": is_project_mounted(),
        "disabled": DISABLE_UPDATE_CHECK
    }
    
    # Если проверка обновлений отключена
    if DISABLE_UPDATE_CHECK:
        result["error"] = "Update check is disabled"
        result["latest_version"] = current_version
        return result
    
    # Получаем URL репозитория из настроек БД
    repo_url = get_repository_url_from_settings()
    result["repository_url"] = repo_url
    
    # Парсим owner/repo из URL
    owner, repo, host = parse_repo_url(repo_url)
    
    if not owner or not repo:
        result["error"] = "Could not parse repository URL"
        result["latest_version"] = current_version
        return result
    
    try:
        # Подготавливаем заголовки для запроса
        headers = {}
        if GITHUB_TOKEN:
            headers["Authorization"] = f"token {GITHUB_TOKEN}"
        
        # Используем raw URL для получения файлов
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Пробуем оба варианта: main и master
            version_url = None
            version_response = None
            last_response = None

            for branch in ["main", "master"]:
                # Формируем URL в зависимости от хостинга
                if host == "github":
                    test_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/VERSION"
                else:
                    # Для Gitea, GitLab и других (формат: https://domain/owner/repo/raw/branch/file)
                    test_url = f"https://{host}/{owner}/{repo}/raw/branch/{branch}/VERSION"

                test_response = await client.get(test_url, headers=headers)
                last_response = test_response

                if test_response.status_code == 200:
                    version_url = test_url
                    version_response = test_response
                    break

            if version_response:
                result["latest_version"] = version_response.text.strip()
            elif last_response and last_response.status_code in (401, 403, 404):
                result["error"] = (
                    f"Repository is private or not accessible (HTTP {last_response.status_code}). "
                    "Set DISABLE_UPDATE_CHECK=true to hide this error."
                )
                result["latest_version"] = current_version
                return result
            else:
                status_code = last_response.status_code if last_response else "unknown"
                result["error"] = f"Failed to fetch VERSION file: HTTP {status_code}"
                result["latest_version"] = current_version
                return result
            
            # Сравнить версии
            if _is_newer(result["latest_version"], current_version):
                result["update_available"] = True
                
                # Получить CHANGELOG.md (используем ту же ветку, что и для VERSION)
                branch = version_url.split("/")[-2] if version_url else "main"
                
                if host == "github":
                    changelog_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/CHANGELOG.md"
                else:
                    changelog_url = f"https://{host}/{owner}/{repo}/raw/branch/{branch}/CHANGELOG.md"
                
                changelog_response = await client.get(changelog_url, headers=headers)
                
                if changelog_response.status_code == 200:
                    # Извлекаем только последнюю версию из changelog
                    changelog_lines = changelog_response.text.split('\n')
                    latest_changelog = []
                    in_latest_version = False
                    version_count = 0
                    
                    for line in changelog_lines:
                        if line.startswith('## [v'):
                            version_count += 1
                            if version_count == 1:
                                in_latest_version = True
                            elif version_count == 2:
                                break
                        
                        if in_latest_version:
                            latest_changelog.append(line)
                    
                    result["changelog"] = '\n'.join(latest_changelog)
            
            # Получить информацию о коммитах через API
            if result["project_mounted"]:
                try:
                    # Получить локальный commit hash
                    local_commit_result = subprocess.run(
                        ["git", "rev-parse", "HEAD"],
                        cwd=PROJECT_ROOT,
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    
                    if local_commit_result.returncode == 0:
                        local_commit = local_commit_result.stdout.strip()
                        
                        # Получить удаленный commit через API
                        commits_url = f"https://api.github.com/repos/{owner}/{repo}/commits/main"
                        commits_response = await client.get(commits_url)
                        
                        if commits_response.status_code == 200:
                            remote_commit = commits_response.json()["sha"]
                            
                            # Сравнить хеши
                            if local_commit != remote_commit:
                                result["commits_behind"] = 1  # Упрощенно
                except Exception as e:
                    logger.warning(f"Could not check commits: {e}")
        
    except httpx.TimeoutException:
        result["error"] = "Timeout while checking for updates"
    except httpx.HTTPError as e:
        result["error"] = f"HTTP error: {str(e)}"
        logger.error(f"HTTP error checking for updates: {e}")
    except Exception as e:
        result["error"] = str(e)
        logger.error(f"Error checking for updates: {e}")
    
    return result


def get_update_status() -> Dict[str, Any]:
    """Получить текущий статус обновления"""
    return update_status.copy()


async def perform_update() -> Dict[str, Any]:
    """
    Выполнить обновление системы.

    Записывает файл-триггер .update_trigger в PROJECT_ROOT.
    Watchdog-сервис на хосте (pvemanager-update.service / update_host.sh)
    обнаруживает триггер и выполняет:
        git pull → docker compose down → docker compose build --no-cache app → docker compose up -d

    Такой подход необходим, потому что «docker compose down» убивает сам контейнер
    (и любой nohup-процесс внутри него) прежде, чем успевает завершиться rebuild.
    """
    global update_status

    if update_status["is_updating"]:
        return {"success": False, "error": "Update already in progress"}

    if not is_project_mounted():
        return {
            "success": False,
            "error": (
                "Project directory not mounted. "
                "Make sure the compose volume '.:/project:rw' is present "
                "and pvemanager-update.service is running on the host."
            ),
        }

    trigger_path = os.path.join(PROJECT_ROOT, ".update_trigger")

    try:
        with open(trigger_path, "w") as f:
            f.write(datetime.now().isoformat())
        logger.info(f"Update trigger written to {trigger_path}")
    except OSError as e:
        logger.error(f"Failed to write update trigger: {e}")
        return {"success": False, "error": f"Cannot write update trigger: {e}"}

    # Обновляем in-memory статус — UI-баннер будет показан сразу
    update_status = {
        "is_updating": True,
        "started_at": datetime.now().isoformat(),
        "stage": "restarting",
        "progress": 80,
        "error": None,
        "completed": False,
    }

    return {
        "success": True,
        "message": (
            "Update triggered. The host watchdog (pvemanager-update.service) "
            "will now run git pull, rebuild and restart the panel."
        ),
    }


def reset_update_status():
    """Сбросить статус обновления"""
    global update_status
    update_status = {
        "is_updating": False,
        "started_at": None,
        "stage": None,
        "progress": 0,
        "error": None,
        "completed": False
    }

