from .base import *


class ImageMirror(Base):
    """
    Кастомный источник образов (зеркало), добавленный администратором.
    Дополняет встроенный curated-каталог (app/catalog/builtin.py).

    kind:
        'qcow2'  — cloud-образ ВМ (url обязателен)
        'vztmpl' — LXC-шаблон (url ИЛИ template — имя файла из репозитория)
    """
    __tablename__ = "image_mirrors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    kind = Column(String(20), nullable=False, default='qcow2', index=True)
    os = Column(String(50), nullable=True)
    version = Column(String(50), nullable=True)
    arch = Column(String(20), nullable=False, default='amd64')

    url = Column(String(1000), nullable=True)
    template = Column(String(255), nullable=True)

    checksum = Column(String(150), nullable=True)
    checksum_algorithm = Column(String(20), nullable=True)

    description = Column(Text, nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)

    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def to_dict(self) -> dict:
        return {
            'id': f'mirror-{self.id}',
            'mirror_id': self.id,
            'source': 'mirror',
            'kind': self.kind,
            'os': self.os,
            'version': self.version,
            'arch': self.arch,
            'name': self.name,
            'url': self.url,
            'template': self.template,
            'checksum': self.checksum,
            'checksum_algorithm': self.checksum_algorithm,
            'description': self.description,
            'enabled': self.enabled,
        }

    def __repr__(self):
        return f"<ImageMirror(id={self.id}, name='{self.name}', kind='{self.kind}')>"
