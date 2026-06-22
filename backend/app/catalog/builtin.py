"""
Встроенный curated-каталог cloud-образов ВМ (qcow2).

URL-ы ведут на «latest»/«current» зеркала дистрибутивов — образ всегда свежий
актуального point-релиза. checksum опционален (фиксированную сумму к плавающему
latest-URL прибить нельзя), поэтому проверка включается только если она задана.

LXC-шаблоны (vztmpl) здесь НЕ хардкодятся: их список берётся динамически из
репозитория Proxmox (aplinfo), плюс произвольные vztmpl-зеркала из ImageMirror.

Каждая запись разворачивается по архитектурам amd64/arm64. arm64-образ —
гость для ARM-ноды; UI фильтрует по arch выбранной ноды.
"""

from typing import Dict, List, Optional

# (id_base, os, version, name, icon, {arch: url})
_CLOUD_IMAGES = [
    (
        'ubuntu-22.04-cloud', 'ubuntu', '22.04', 'Ubuntu 22.04 LTS (Jammy) Cloud', 'ubuntu',
        {
            'amd64': 'https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img',
            'arm64': 'https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-arm64.img',
        },
    ),
    (
        'ubuntu-24.04-cloud', 'ubuntu', '24.04', 'Ubuntu 24.04 LTS (Noble) Cloud', 'ubuntu',
        {
            'amd64': 'https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img',
            'arm64': 'https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-arm64.img',
        },
    ),
    (
        'debian-11-cloud', 'debian', '11', 'Debian 11 (Bullseye) GenericCloud', 'debian',
        {
            'amd64': 'https://cloud.debian.org/images/cloud/bullseye/latest/debian-11-genericcloud-amd64.qcow2',
            'arm64': 'https://cloud.debian.org/images/cloud/bullseye/latest/debian-11-genericcloud-arm64.qcow2',
        },
    ),
    (
        'debian-12-cloud', 'debian', '12', 'Debian 12 (Bookworm) GenericCloud', 'debian',
        {
            'amd64': 'https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2',
            'arm64': 'https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-arm64.qcow2',
        },
    ),
    (
        'rocky-9-cloud', 'rocky', '9', 'Rocky Linux 9 GenericCloud', 'rocky',
        {
            'amd64': 'https://download.rockylinux.org/pub/rocky/9/images/x86_64/Rocky-9-GenericCloud.latest.x86_64.qcow2',
            'arm64': 'https://download.rockylinux.org/pub/rocky/9/images/aarch64/Rocky-9-GenericCloud.latest.aarch64.qcow2',
        },
    ),
    (
        'alma-9-cloud', 'almalinux', '9', 'AlmaLinux 9 GenericCloud', 'almalinux',
        {
            'amd64': 'https://repo.almalinux.org/almalinux/9/cloud/x86_64/images/AlmaLinux-9-GenericCloud-latest.x86_64.qcow2',
            'arm64': 'https://repo.almalinux.org/almalinux/9/cloud/aarch64/images/AlmaLinux-9-GenericCloud-latest.aarch64.qcow2',
        },
    ),
]


def _filename_for(url: str) -> str:
    """Имя файла, под которым образ ляжет в хранилище (из хвоста URL)."""
    return url.rsplit('/', 1)[-1]


def _build() -> List[Dict]:
    items: List[Dict] = []
    for id_base, os_name, version, name, icon, urls in _CLOUD_IMAGES:
        for arch, url in urls.items():
            items.append({
                'id': f'{id_base}-{arch}',
                'source': 'builtin',
                'kind': 'qcow2',
                'os': os_name,
                'version': version,
                'arch': arch,
                'name': name,
                'url': url,
                'filename': _filename_for(url),
                'checksum': None,
                'checksum_algorithm': None,
                'icon': icon,
            })
    return items


CATALOG: List[Dict] = _build()

_BY_ID = {item['id']: item for item in CATALOG}


def get_catalog_image(image_id: str) -> Optional[Dict]:
    """Найти запись встроенного каталога по id."""
    return _BY_ID.get(image_id)
