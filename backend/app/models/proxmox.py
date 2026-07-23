from .base import *

class OSTemplateGroup(Base):
    """Group of OS templates"""
    __tablename__ = "os_template_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    icon = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, default=True, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<OSTemplateGroup(id={self.id}, name='{self.name}')>"

class OSTemplate(Base):
    """OS Template"""
    __tablename__ = "os_templates"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, nullable=False, index=True)
    server_id = Column(Integer, nullable=False, index=True)
    
    name = Column(String(100), nullable=False)
    vmid = Column(Integer, nullable=True)
    vm_type = Column(String(10), nullable=False, default="qemu", server_default="qemu")
    volid = Column(String(500), nullable=True)
    node = Column(String(100), nullable=True)
    
    source_node = Column(String(100), nullable=True)
    replicated_nodes = Column(JSON, nullable=True, default={})
    
    default_cores = Column(Integer, nullable=False, default=1)
    default_memory = Column(Integer, nullable=False, default=1024)
    default_disk = Column(Integer, nullable=False, default=10)
    min_cores = Column(Integer, nullable=False, default=1)
    min_memory = Column(Integer, nullable=False, default=512)
    min_disk = Column(Integer, nullable=False, default=5)
    
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index('idx_os_template_group', 'group_id'),
        Index('idx_os_template_server', 'server_id'),
        Index('idx_os_template_vmid', 'server_id', 'vmid'),
    )
    
    def get_source_node(self) -> str:
        return self.source_node or self.node
    
    def get_vmid_for_node(self, node_name: str) -> Optional[int]:
        source = self.get_source_node()
        if node_name == source:
            return self.vmid
        if self.replicated_nodes and node_name in self.replicated_nodes:
            return self.replicated_nodes[node_name]
        return None
    
    def add_replicated_node(self, node_name: str, vmid: int):
        if not self.replicated_nodes:
            self.replicated_nodes = {}
        self.replicated_nodes[node_name] = vmid

    def __repr__(self):
        return f"<OSTemplate(id={self.id}, name='{self.name}', vmid={self.vmid})>"

class ProxmoxServer(Base):
    """Proxmox VE server"""
    __tablename__ = "proxmox_servers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    hostname = Column(String(255), nullable=False, index=True)
    ip_address = Column(String(50), nullable=False, index=True)
    port = Column(Integer, nullable=False, default=8006)

    api_user = Column(String(100), nullable=False, default="root@pam")
    api_token_name = Column(String(100), nullable=True)
    # Encrypted like the password: with auto-provisioning the token becomes the
    # primary credential. EncryptedString stores as String and falls back to
    # plaintext on read, so existing rows keep working until they are rewritten.
    api_token_value = Column(EncryptedString(255), nullable=True)

    use_password = Column(Boolean, nullable=False, default=False)
    password = Column(EncryptedString(255), nullable=True)

    verify_ssl = Column(Boolean, nullable=False, default=True)
    cluster_name = Column(String(100), nullable=True, index=True)

    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    last_check = Column(DateTime(timezone=True), nullable=True)
    
    is_online = Column(Boolean, nullable=True, default=None)
    last_error = Column(Text, nullable=True)

    __table_args__ = (
        Index('idx_proxmox_status', 'is_online', 'last_check'),
    )

    def __repr__(self):
        return f"<ProxmoxServer(id={self.id}, name='{self.name}', ip='{self.ip_address}')>"

    @property
    def connection_info(self) -> dict:
        return {
            'id': self.id,
            'name': self.name,
            'hostname': self.hostname,
            'ip_address': self.ip_address,
            'port': self.port,
            'api_user': self.api_user,
            'verify_ssl': self.verify_ssl,
            'is_online': self.is_online,
            'last_check': self.last_check
        }

    def update_status(self, is_online: bool, error: str = None):
        self.is_online = is_online
        self.last_check = utcnow()
        if error:
            self.last_error = error
        elif is_online:
            self.last_error = None

    assigned_users = relationship("User", secondary="user_servers", back_populates="assigned_servers", lazy="select")

class VMInstance(Base):
    """VM/Container instance cache"""
    __tablename__ = "vm_instances"

    id = Column(Integer, primary_key=True, index=True)
    server_id = Column(Integer, nullable=False, index=True)
    vmid = Column(Integer, nullable=False, index=True)
    node = Column(String(100), nullable=False)
    vm_type = Column(String(20), nullable=False)
    name = Column(String(100), nullable=False)
    
    owner_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    owner = relationship("User", backref="instances", foreign_keys=[owner_id])
    
    status = Column(String(20), default='unknown')
    is_template = Column(Boolean, default=False)
    
    cores = Column(Integer, nullable=True)
    memory = Column(BigInteger, nullable=True)
    disk_size = Column(BigInteger, nullable=True)
    
    os_type = Column(String(50), nullable=True)
    
    ip_address = Column(String(50), nullable=True)
    ip_prefix = Column(Integer, nullable=True, default=24)
    gateway = Column(String(50), nullable=True)
    nameserver = Column(String(50), nullable=True)
    
    cloud_init_user = Column(String(100), nullable=True)
    cloud_init_password = Column(EncryptedString(255), nullable=True)
    ssh_keys = Column(Text, nullable=True)
    
    template_id = Column(Integer, nullable=True)
    template_name = Column(String(100), nullable=True)
    
    description = Column(Text, nullable=True)
    tags = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    
    extra_config = Column(JSON, nullable=True)

    __table_args__ = (
        Index('idx_vm_instance_server_vmid', 'server_id', 'vmid', unique=True),
        Index('idx_vm_instance_active', 'server_id', 'deleted_at'),
        Index('idx_vm_instance_owner', 'owner_id'),
    )

    def __repr__(self):
        return f"<VMInstance(id={self.id}, server_id={self.server_id}, vmid={self.vmid}, name='{self.name}')>"

class VMSnapshotArchive(Base):
    """Archive of VM/Container snapshots"""
    __tablename__ = "vm_snapshot_archives"

    id = Column(Integer, primary_key=True, index=True)
    
    server_id = Column(Integer, nullable=False, index=True)
    server_name = Column(String(100), nullable=True)
    vmid = Column(Integer, nullable=False, index=True)
    vm_name = Column(String(100), nullable=True)
    vm_type = Column(String(20), nullable=False)
    node = Column(String(100), nullable=False)
    
    snapname = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    snaptime = Column(BigInteger, nullable=True)
    parent = Column(String(100), nullable=True)
    
    vmstate = Column(Boolean, default=False, nullable=False)
    
    snapshot_config = Column(JSON, nullable=True)
    
    deleted_by = Column(String(100), nullable=True)
    deletion_reason = Column(Text, nullable=True)
    archived_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index('idx_snapshot_archive_server_vmid', 'server_id', 'vmid'),
        Index('idx_snapshot_archive_archived', 'archived_at'),
    )

    def __repr__(self):
        return f"<VMSnapshotArchive(id={self.id}, vmid={self.vmid}, snapname='{self.snapname}')>"
