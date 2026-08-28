from .base import *


class CoolifyConnection(Base):
    __tablename__ = "coolify_connections"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, default="Coolify")
    base_url = Column(String(500), nullable=False)
    api_token = Column(EncryptedString(2000), nullable=False)
    verify_ssl = Column(Boolean, nullable=False, default=True)
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class CoolifyInstanceMapping(Base):
    __tablename__ = "coolify_instance_mappings"

    id = Column(Integer, primary_key=True)
    proxmox_server_id = Column(Integer, ForeignKey("proxmox_servers.id", ondelete="CASCADE"), nullable=False)
    vmid = Column(Integer, nullable=False)
    coolify_server_uuid = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (
        Index("uq_coolify_instance_mapping", "proxmox_server_id", "vmid", unique=True),
    )
