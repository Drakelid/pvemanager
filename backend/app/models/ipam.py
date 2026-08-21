from .base import *

class IPAMNetwork(Base):
    """Networks/subnets for IPAM"""
    __tablename__ = "ipam_networks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    
    network = Column(String(18), nullable=False, index=True)
    gateway = Column(String(45), nullable=True)
    vlan_id = Column(Integer, nullable=True)
    
    dns_primary = Column(String(45), nullable=True)
    dns_secondary = Column(String(45), nullable=True)
    dns_domain = Column(String(255), nullable=True)
    
    proxmox_server_id = Column(Integer, nullable=True, index=True)
    proxmox_node = Column(String(100), nullable=True)
    proxmox_bridge = Column(String(20), nullable=True)

    # Привязка сети к рабочей области (workspace). Одна общая подсеть на область:
    # сеть/пул выдаются любому узлу области, без привязки к конкретной ноде.
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True, index=True)
    # Сеть по умолчанию внутри области — автоматически выбирается в мастерах.
    is_default = Column(Boolean, default=False, nullable=False)

    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index('idx_ipam_network_name', 'name'),
        Index('idx_ipam_network_active', 'is_active'),
    )

    def __repr__(self):
        return f"<IPAMNetwork(id={self.id}, name='{self.name}', network='{self.network}')>"

class IPAMPool(Base):
    """IP pools inside a network"""
    __tablename__ = "ipam_pools"

    id = Column(Integer, primary_key=True, index=True)
    network_id = Column(Integer, nullable=False, index=True)
    
    name = Column(String(100), nullable=False)
    pool_type = Column(String(20), default="static", nullable=False)
    
    range_start = Column(String(45), nullable=False)
    range_end = Column(String(45), nullable=False)
    
    auto_assign = Column(Boolean, default=True, nullable=False)
    
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index('idx_ipam_pool_network', 'network_id'),
        Index('idx_ipam_pool_type', 'pool_type'),
    )

    def __repr__(self):
        return f"<IPAMPool(id={self.id}, name='{self.name}', range='{self.range_start}-{self.range_end}')>"

class IPAMAllocation(Base):
    """Allocated IP addresses"""
    __tablename__ = "ipam_allocations"

    id = Column(Integer, primary_key=True, index=True)
    network_id = Column(Integer, nullable=False, index=True)
    pool_id = Column(Integer, nullable=True, index=True)
    
    ip_address = Column(String(45), nullable=False, unique=True, index=True)
    mac_address = Column(String(17), nullable=True)
    
    resource_type = Column(String(20), nullable=True)
    resource_id = Column(Integer, nullable=True)
    resource_name = Column(String(100), nullable=True)
    
    proxmox_server_id = Column(Integer, nullable=True, index=True)
    proxmox_vmid = Column(Integer, nullable=True)
    proxmox_node = Column(String(100), nullable=True)
    
    status = Column(String(20), default="allocated", nullable=False)
    allocation_type = Column(String(20), default="static", nullable=False)

    # Гость может держать несколько адресов: ровно один из них основной
    # (живёт в net0/ipconfig0 и показывается в колонке IP), остальные
    # навешиваются алиасами на интерфейс уже внутри гостя.
    is_primary = Column(Boolean, default=False, nullable=False)
    assignment_kind = Column(String(10), default="primary", nullable=False)  # primary | alias
    target_interface = Column(String(20), nullable=True)  # eth0, ens18, ...

    # Состояние применения алиаса к живому гостю.
    # applied — поднят и закреплён в конфиге ОС; runtime_only — поднят, но
    # стек не распознан и ребут его не переживёт; pending — гость был
    # недоступен; failed — скрипт вернул ошибку.
    apply_status = Column(String(20), nullable=True)
    apply_error = Column(Text, nullable=True)
    applied_at = Column(DateTime(timezone=True), nullable=True)
    
    hostname = Column(String(255), nullable=True, index=True)
    fqdn = Column(String(255), nullable=True)
    dns_ptr_record = Column(Boolean, default=False, nullable=False)
    
    allocated_by = Column(String(100), nullable=True)
    allocated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    
    notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index('idx_ipam_alloc_network', 'network_id'),
        Index('idx_ipam_alloc_resource', 'resource_type', 'resource_id'),
        Index('idx_ipam_alloc_proxmox', 'proxmox_server_id', 'proxmox_vmid'),
        Index('idx_ipam_alloc_primary', 'proxmox_server_id', 'proxmox_vmid', 'is_primary'),
        Index('idx_ipam_alloc_status', 'status'),
    )

    def __repr__(self):
        return f"<IPAMAllocation(id={self.id}, ip='{self.ip_address}', resource='{self.resource_name}')>"

class IPAMHistory(Base):
    """History of IPAM changes"""
    __tablename__ = "ipam_history"

    id = Column(Integer, primary_key=True, index=True)
    
    ip_address = Column(String(45), nullable=False, index=True)
    network_id = Column(Integer, nullable=True, index=True)
    
    action = Column(String(50), nullable=False)
    
    old_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    
    resource_type = Column(String(20), nullable=True)
    resource_id = Column(Integer, nullable=True)
    resource_name = Column(String(100), nullable=True)
    
    performed_by = Column(String(100), nullable=True)
    performed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    notes = Column(Text, nullable=True)

    __table_args__ = (
        Index('idx_ipam_history_ip', 'ip_address'),
        Index('idx_ipam_history_action', 'action'),
        Index('idx_ipam_history_date', 'performed_at'),
    )

    def __repr__(self):
        return f"<IPAMHistory(id={self.id}, ip='{self.ip_address}', action='{self.action}')>"
