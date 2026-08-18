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
_GH2 = 'https://github.com/markmorado/pvemanager-images/releases/download/2026-08-18'

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
    (
        'alma-10-cloud', 'almalinux', '10', 'AlmaLinux 10 GenericCloud', 'almalinux',
        {
            'amd64': (f'{_GH2}/AlmaLinux-10-GenericCloud-latest.x86_64.qcow2',
                      'd0bdbc4fabb365b27e8d4a77118c1100ebdab42341312338e63724a2f9ee217f'),
            'arm64': ('https://repo.almalinux.org/almalinux/10/cloud/aarch64/images/AlmaLinux-10-GenericCloud-latest.aarch64.qcow2', None),
        },
    ),
    (
        'centos-stream-9-cloud', 'centos', '9-stream', 'CentOS Stream 9 GenericCloud', 'centos',
        {
            'amd64': (f'{_GH2}/CentOS-Stream-GenericCloud-9-latest.x86_64.qcow2',
                      '63c13542e94678b0a41d318e7758f1cf23609564b1cbaa9051616457ce771903'),
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
            'amd64': (f'{_GH2}/Fedora-Cloud-Base-Generic-41-1.4.x86_64.qcow2',
                      '6c12ad70a8b5058f032de10d463bda8c93391162e5a72a90c79dd548ecc8e378'),
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
