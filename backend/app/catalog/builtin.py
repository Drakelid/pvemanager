"""
Встроенный curated-каталог cloud-образов ВМ (qcow2).

amd64-образы берутся с собственного GitHub-зеркала (markmorado/pvemanager-images)
с предустановленным qemu-guest-agent и фиксированным sha256. arm64-образы идут
напрямую с upstream-серверов дистрибутивов (патченых arm64-версий нет).

LXC-шаблоны (vztmpl) здесь НЕ хардкодятся: их список берётся динамически из
репозитория Proxmox (aplinfo), плюс произвольные vztmpl-зеркала из ImageMirror.

Каждая запись разворачивается по архитектурам amd64/arm64. arm64-образ —
гость для ARM-ноды; UI фильтрует по arch выбранной ноды.
"""

from typing import Dict, List, Optional, Tuple

_GH = 'https://github.com/markmorado/pvemanager-images/releases/download/2026-08-14'

# (id_base, os, version, name, icon, {arch: (url, checksum_or_None)})
# amd64 → собственное GitHub-зеркало + sha256; arm64 → upstream без checksum
_CLOUD_IMAGES = [
    (
        'ubuntu-22.04-cloud', 'ubuntu', '22.04', 'Ubuntu 22.04 LTS (Jammy) Cloud', 'ubuntu',
        {
            'amd64': (f'{_GH}/jammy-server-cloudimg-amd64.img',
                      'a5aa63f38e689bf043cfb2789a86057ee47131d21c21b611f05639313df2f3d9'),
            'arm64': ('https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-arm64.img', None),
        },
    ),
    (
        'ubuntu-24.04-cloud', 'ubuntu', '24.04', 'Ubuntu 24.04 LTS (Noble) Cloud', 'ubuntu',
        {
            'amd64': (f'{_GH}/noble-server-cloudimg-amd64.img',
                      'd2490b42be04a1a69ad4809aff8bf1e9385d506f482468d494dc2a3916f843fb'),
            'arm64': ('https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-arm64.img', None),
        },
    ),
    (
        'debian-11-cloud', 'debian', '11', 'Debian 11 (Bullseye) GenericCloud', 'debian',
        {
            'amd64': (f'{_GH}/debian-11-genericcloud-amd64.qcow2',
                      'be2d0545e37252a4296323264196156acaba37602ad4a7817a9cd95a300a2632'),
            'arm64': ('https://cloud.debian.org/images/cloud/bullseye/latest/debian-11-genericcloud-arm64.qcow2', None),
        },
    ),
    (
        'debian-12-cloud', 'debian', '12', 'Debian 12 (Bookworm) GenericCloud', 'debian',
        {
            'amd64': (f'{_GH}/debian-12-genericcloud-amd64.qcow2',
                      '0a3ca928e28b2544df03afb057b5512762b22e325b7640845bade651903dd490'),
            'arm64': ('https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-arm64.qcow2', None),
        },
    ),
    (
        'rocky-9-cloud', 'rocky', '9', 'Rocky Linux 9 GenericCloud', 'rocky',
        {
            'amd64': (f'{_GH}/Rocky-9-GenericCloud.latest.x86_64.qcow2',
                      'a01fbfa6750c2a7f1c290f7e2ab51bfdbb564e95413f8f52ab27175a7646e30b'),
            'arm64': ('https://download.rockylinux.org/pub/rocky/9/images/aarch64/Rocky-9-GenericCloud.latest.aarch64.qcow2', None),
        },
    ),
    (
        'alma-9-cloud', 'almalinux', '9', 'AlmaLinux 9 GenericCloud', 'almalinux',
        {
            'amd64': (f'{_GH}/AlmaLinux-9-GenericCloud-latest.x86_64.qcow2',
                      '49c75c0b49d9831338d06288e7f751f98302144218b462e5d9b2b6fe25c66f5e'),
            'arm64': ('https://repo.almalinux.org/almalinux/9/cloud/aarch64/images/AlmaLinux-9-GenericCloud-latest.aarch64.qcow2', None),
        },
    ),
]


def _filename_for(url: str) -> str:
    """Имя файла, под которым образ ляжет в хранилище (из хвоста URL)."""
    return url.rsplit('/', 1)[-1]


def _build() -> List[Dict]:
    items: List[Dict] = []
    for id_base, os_name, version, name, icon, urls in _CLOUD_IMAGES:
        for arch, (url, checksum) in urls.items():
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
                'checksum': checksum,
                'checksum_algorithm': 'sha256' if checksum else None,
                'icon': icon,
            })
    return items


CATALOG: List[Dict] = _build()

_BY_ID = {item['id']: item for item in CATALOG}


def get_catalog_image(image_id: str) -> Optional[Dict]:
    """Найти запись встроенного каталога по id."""
    return _BY_ID.get(image_id)
