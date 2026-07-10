"""
Синхронизация каталога скриптов из git-репозитория (аналог appstore_catalog.py
sync_catalog(), но проще: bash-файлы с метаданными в заголовочных комментариях
вместо отдельных манифестов).

Конвенция метаданных (первые строки файла, до первой не-комментарной строки
после shebang):

    #!/bin/bash
    # name: Очистка старых логов
    # description: Удаляет журналы старше 30 дней в /var/log
    # target: node
    # category: maintenance
    # param: DAYS|Дней хранить|number|false|30

Файлы без `# name:` каталогизируются по имени файла.
"""

from __future__ import annotations

import glob as _glob
import os
import re
import shutil
import subprocess
import tempfile
from typing import Dict, List, Optional

from loguru import logger
from sqlalchemy.orm import Session

from ..config import utcnow
from ..models import ScriptCatalog, ScriptGitRepo

_META_RE = re.compile(r"^#\s*(name|description|target|category)\s*:\s*(.*)$", re.IGNORECASE)
_PARAM_RE = re.compile(r"^#\s*param\s*:\s*(.*)$", re.IGNORECASE)


def _parse_script_metadata(text: str, fallback_name: str) -> dict:
    name = fallback_name
    description = None
    target = "guest"
    category = None
    params: List[dict] = []

    for line in text.splitlines()[:60]:
        stripped = line.strip()
        if not stripped.startswith("#"):
            if stripped and not stripped.startswith("#!"):
                break
            continue
        m = _META_RE.match(stripped)
        if m:
            key, val = m.group(1).lower(), m.group(2).strip()
            if key == "name":
                name = val
            elif key == "description":
                description = val
            elif key == "target":
                target = val if val in ("node", "guest") else "guest"
            elif key == "category":
                category = val
            continue
        pm = _PARAM_RE.match(stripped)
        if pm:
            parts = [p.strip() for p in pm.group(1).split("|")]
            # name|label|type|required|default
            p_name = parts[0] if len(parts) > 0 else None
            if not p_name:
                continue
            params.append({
                "name": p_name,
                "label": parts[1] if len(parts) > 1 and parts[1] else p_name,
                "type": parts[2] if len(parts) > 2 and parts[2] else "string",
                "required": (parts[3].lower() == "true") if len(parts) > 3 else False,
                "default": parts[4] if len(parts) > 4 else None,
            })

    return {
        "name": name,
        "description": description,
        "target_type": target,
        "category": category,
        "params_schema": params,
    }


def _clone_repo(repo: ScriptGitRepo, dest: str) -> None:
    subprocess.run(
        ["git", "clone", "--depth", "1", "--branch", repo.branch, repo.url, dest],
        check=True, capture_output=True, timeout=120, text=True,
    )


def sync_git_repo(db: Session, repo: ScriptGitRepo) -> dict:
    """Синхронизировать один git-источник. Идемпотентно (upsert по slug)."""
    created = updated = skipped = errors = disappeared = 0
    tmp_dir = tempfile.mkdtemp(prefix="pve_script_repo_")
    try:
        try:
            _clone_repo(repo, tmp_dir)
        except subprocess.CalledProcessError as e:
            err = (e.stderr or str(e))[:1000]
            repo.last_sync_error = err
            db.commit()
            return {"error": err, "created": 0, "updated": 0, "skipped": 0, "errors": 1}
        except subprocess.TimeoutExpired:
            repo.last_sync_error = "git clone timeout (>120s)"
            db.commit()
            return {"error": repo.last_sync_error, "created": 0, "updated": 0, "skipped": 0, "errors": 1}

        pattern = os.path.join(tmp_dir, repo.path_glob)
        files = _glob.glob(pattern, recursive=True)

        seen_slugs: List[str] = []
        for path in files:
            rel_path = os.path.relpath(path, tmp_dir)
            slug = f"git-{repo.id}-{rel_path}".replace("/", "-").replace("\\", "-")
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
            except Exception as e:
                errors += 1
                logger.warning(f"[script-sync] read {rel_path} failed: {e}")
                continue

            meta = _parse_script_metadata(content, fallback_name=os.path.basename(rel_path))

            existing = db.query(ScriptCatalog).filter(ScriptCatalog.slug == slug).first()
            if existing:
                existing.name = meta["name"]
                existing.description = meta["description"]
                existing.target_type = meta["target_type"]
                existing.category = meta["category"]
                existing.params_schema = meta["params_schema"]
                existing.content = content
                existing.git_path = rel_path
                updated += 1
            else:
                db.add(ScriptCatalog(
                    slug=slug, name=meta["name"], description=meta["description"],
                    target_type=meta["target_type"], category=meta["category"],
                    params_schema=meta["params_schema"], content=content,
                    source="git", git_repo_id=repo.id, git_path=rel_path,
                ))
                created += 1
            seen_slugs.append(slug)
            db.commit()

        # Удалить из этого источника то, что исчезло из репозитория.
        stale = db.query(ScriptCatalog).filter(
            ScriptCatalog.git_repo_id == repo.id,
            ~ScriptCatalog.slug.in_(seen_slugs) if seen_slugs else True,
        ).all()
        for s in stale:
            db.delete(s)
            disappeared += 1
        db.commit()

        repo.last_synced_at = utcnow()
        repo.last_sync_error = None
        db.commit()

        return {"created": created, "updated": updated, "skipped": skipped,
                "errors": errors, "disappeared": disappeared}
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
