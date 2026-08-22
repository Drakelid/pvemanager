"""
Встроенный curated-каталог cloud-образов ВМ (qcow2).

amd64-образы берутся с собственного GitHub-зеркала (markmorado/pvemanager-images)
с предустановленным qemu-guest-agent и фиксированным sha256; у RHEL-семейства
там же снято штатное ограничение RPC, иначе агент отказывает в guest-exec (см.
patch-cloud-images.sh). arm64-образы идут напрямую с upstream-серверов
дистрибутивов (патченых arm64-версий нет).

LXC-шаблоны (vztmpl) здесь НЕ хардкодятся: их список берётся динамически из
репозитория Proxmox (aplinfo), плюс произвольные vztmpl-зеркала из ImageMirror.

Каждая запись разворачивается по архитектурам amd64/arm64. arm64-образ —
гость для ARM-ноды; UI фильтрует по arch выбранной ноды.
"""

from typing import Dict, List, Optional, Tuple

_GH = 'https://github.com/markmorado/pvemanager-images/releases/download/2026-08-14'
_GH2 = 'https://github.com/markmorado/pvemanager-images/releases/download/2026-08-18'
_GH3 = 'https://github.com/markmorado/pvemanager-images/releases/download/2026-08-22'

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
            'amd64': (f'{_GH3}/Rocky-9-GenericCloud.latest.x86_64.qcow2',
                      'c15042de9805e2b9581715d46361484a2c94187a15608344f85e775fb34081f5'),
            'arm64': ('https://download.rockylinux.org/pub/rocky/9/images/aarch64/Rocky-9-GenericCloud.latest.aarch64.qcow2', None),
        },
    ),
    (
        'alma-9-cloud', 'almalinux', '9', 'AlmaLinux 9 GenericCloud', 'almalinux',
        {
            'amd64': (f'{_GH3}/AlmaLinux-9-GenericCloud-latest.x86_64.qcow2',
                      'c3a21566c92c520c5ab9fa68e6ce38190ff173c531fbe0eea00573955d0b5131'),
            'arm64': ('https://repo.almalinux.org/almalinux/9/cloud/aarch64/images/AlmaLinux-9-GenericCloud-latest.aarch64.qcow2', None),
        },
    ),
    (
        'alma-10-cloud', 'almalinux', '10', 'AlmaLinux 10 GenericCloud', 'almalinux',
        {
            'amd64': (f'{_GH3}/AlmaLinux-10-GenericCloud-latest.x86_64.qcow2',
                      '7b91f6ad87aeac7193ece070e06e25406a76a7084d1628d89a5bb1ddd9d1642e'),
            'arm64': ('https://repo.almalinux.org/almalinux/10/cloud/aarch64/images/AlmaLinux-10-GenericCloud-latest.aarch64.qcow2', None),
        },
    ),
    (
        'centos-stream-9-cloud', 'centos', '9-stream', 'CentOS Stream 9 GenericCloud', 'centos',
        {
            'amd64': (f'{_GH3}/CentOS-Stream-GenericCloud-9-latest.x86_64.qcow2',
                      'd9818217c2ad20809973013f32094c2d82cbb74c08709afb4bef3d426b06dd37'),
            'arm64': ('https://cloud.centos.org/centos/9-stream/aarch64/images/CentOS-Stream-GenericCloud-9-latest.aarch64.qcow2', None),
        },
    ),
    (
        'debian-13-cloud', 'debian', '13', 'Debian 13 (Trixie) GenericCloud', 'debian',
        {
            'amd64': (f'{_GH2}/debian-13-genericcloud-amd64.qcow2',
                      '42a4931fc94840d75c9a58ba4cde0bc98365d3998645872c9f4c7244f682198e'),
            'arm64': ('https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-arm64.qcow2', None),
        },
    ),
    (
        'fedora-41-cloud', 'fedora', '41', 'Fedora 41 Cloud', 'fedora',
        {
            'amd64': (f'{_GH3}/Fedora-Cloud-Base-Generic-41-1.4.x86_64.qcow2',
                      '40f101f44a83f714a1f586e6285f14a90e570c874a4bee2399873582b20dea80'),
            'arm64': ('https://download.fedoraproject.org/pub/fedora/linux/releases/41/Cloud/aarch64/images/Fedora-Cloud-Base-Generic-41-1.4.aarch64.qcow2', None),
        },
    ),
    (
        'ubuntu-26.04-cloud', 'ubuntu', '26.04', 'Ubuntu 26.04 LTS (Resolute) Cloud', 'ubuntu',
        {
            'amd64': (f'{_GH2}/resolute-server-cloudimg-amd64.img',
                      'b9cd03eb2b9b2ddd59c68c7d577a56835ba7da3d713e085336f493290daec9c8'),
            'arm64': ('https://cloud-images.ubuntu.com/resolute/current/resolute-server-cloudimg-arm64.img', None),
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
