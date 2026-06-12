from .base import *

class PanelSettings(Base):
    """Panel settings"""
    __tablename__ = "panel_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<PanelSettings(id={self.id}, key='{self.key}', value='{self.value}')>"

class SecuritySetting(Base):
    """Security settings"""
    __tablename__ = "security_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<SecuritySetting(key='{self.key}', value='{self.value}')>"

class Workspace(Base):
    """Workspace — named group of Proxmox servers"""
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    color = Column(String(20), nullable=True, default="#667eea")
    is_default = Column(Boolean, default=False, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    creator = relationship("User", foreign_keys=[created_by])
    workspace_servers = relationship("WorkspaceServer", back_populates="workspace", cascade="all, delete-orphan")
    workspace_users = relationship("WorkspaceUser", back_populates="workspace", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Workspace(id={self.id}, name='{self.name}')>"

class WorkspaceServer(Base):
    """Junction table: servers belonging to a workspace"""
    __tablename__ = "workspace_servers"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    server_id = Column(Integer, ForeignKey("proxmox_servers.id", ondelete="CASCADE"), nullable=False)

    workspace = relationship("Workspace", back_populates="workspace_servers")
    server = relationship("ProxmoxServer")

    __table_args__ = (
        Index('idx_ws_servers_workspace', 'workspace_id'),
        Index('idx_ws_servers_server', 'server_id'),
        Index('idx_ws_servers_unique', 'workspace_id', 'server_id', unique=True),
    )

    def __repr__(self):
        return f"<WorkspaceServer(workspace_id={self.workspace_id}, server_id={self.server_id})>"

class WorkspaceUser(Base):
    """Junction table: users with access to a workspace"""
    __tablename__ = "workspace_users"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    workspace = relationship("Workspace", back_populates="workspace_users")
    user = relationship("User")

    __table_args__ = (
        Index('idx_ws_users_workspace', 'workspace_id'),
        Index('idx_ws_users_user', 'user_id'),
        Index('idx_ws_users_unique', 'workspace_id', 'user_id', unique=True),
    )
