from .base import *

class Notification(Base):
    """User notifications"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(50), nullable=False)
    level = Column(String(20), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text)
    data = Column(JSON)
    link = Column(String(500))
    source = Column(String(50))
    source_id = Column(String(100))
    read = Column(Boolean, default=False)
    read_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True))

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "type": self.type,
            "level": self.level,
            "title": self.title,
            "message": self.message,
            "data": self.data,
            "link": self.link,
            "source": self.source,
            "source_id": self.source_id,
            "read": self.read,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }

class NotificationPreference(Base):
    """User notification preferences"""
    __tablename__ = "notification_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    enabled = Column(Boolean, default=True)
    email_enabled = Column(Boolean, default=False)
    email_critical_only = Column(Boolean, default=True)
    telegram_enabled = Column(Boolean, default=False)
    telegram_chat_id = Column(String(100))
    webhook_url = Column(String(500))
    notification_levels = Column(JSON, default=["critical", "warning", "info", "success"])
    notification_types = Column(JSON, default=["vm_status", "resource_alert", "system"])
    quiet_hours_start = Column(String(5))
    quiet_hours_end = Column(String(5))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "enabled": self.enabled,
            "email_enabled": self.email_enabled,
            "email_critical_only": self.email_critical_only,
            "telegram_enabled": self.telegram_enabled,
            "telegram_chat_id": self.telegram_chat_id,
            "webhook_url": self.webhook_url,
            "notification_levels": self.notification_levels,
            "notification_types": self.notification_types,
            "quiet_hours_start": self.quiet_hours_start,
            "quiet_hours_end": self.quiet_hours_end,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

class BackupJob(Base):
    """Scheduled backup job"""
    __tablename__ = "backup_jobs"

    id = Column(Integer, primary_key=True, index=True)
    server_id = Column(Integer, ForeignKey("proxmox_servers.id", ondelete="CASCADE"), nullable=False)
    node = Column(String(100), nullable=False)
    vmids = Column(JSON, nullable=False, default=[])
    storage = Column(String(100), nullable=False)

    mode = Column(String(20), default="snapshot", nullable=False)
    compress = Column(String(20), default="zstd", nullable=False)
    notes = Column(String(500), nullable=True)

    keep_last = Column(Integer, default=3, nullable=False)
    keep_daily = Column(Integer, default=7, nullable=False)
    keep_weekly = Column(Integer, default=4, nullable=False)
    keep_monthly = Column(Integer, default=6, nullable=False)

    cron_expression = Column(String(100), nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)

    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_status = Column(String(20), nullable=True)
    last_error = Column(Text, nullable=True)
    last_upid = Column(String(200), nullable=True)

    server = relationship("ProxmoxServer", backref="backup_jobs")
    owner = relationship("User", foreign_keys=[owner_id])

    __table_args__ = (
        Index('idx_backup_jobs_server', 'server_id'),
        Index('idx_backup_jobs_enabled', 'enabled'),
        Index('idx_backup_jobs_owner', 'owner_id'),
    )

    def __repr__(self):
        return f"<BackupJob(id={self.id}, server_id={self.server_id}, cron='{self.cron_expression}')>"

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'server_id': self.server_id,
            'node': self.node,
            'vmids': self.vmids,
            'storage': self.storage,
            'mode': self.mode,
            'compress': self.compress,
            'notes': self.notes,
            'keep_last': self.keep_last,
            'keep_daily': self.keep_daily,
            'keep_weekly': self.keep_weekly,
            'keep_monthly': self.keep_monthly,
            'cron_expression': self.cron_expression,
            'enabled': self.enabled,
            'owner_id': self.owner_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'last_run_at': self.last_run_at.isoformat() if self.last_run_at else None,
            'last_status': self.last_status,
            'last_error': self.last_error,
            'last_upid': self.last_upid,
        }

class AuditLog(Base):
    """Логи аудита системы"""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    
    level = Column(String(20), nullable=False, index=True)
    category = Column(String(50), nullable=False, index=True)
    
    action = Column(String(100), nullable=False, index=True)
    message = Column(Text, nullable=False)
    
    request_id = Column(String(36), nullable=True, index=True)
    session_id = Column(String(64), nullable=True, index=True)
    
    user_id = Column(Integer, nullable=True, index=True)
    username = Column(String(100), nullable=True, index=True)
    ip_address = Column(String(45), nullable=True, index=True)
    user_agent = Column(String(500), nullable=True)
    geo_location = Column(String(100), nullable=True)
    
    resource_type = Column(String(50), nullable=True, index=True)
    resource_id = Column(String(100), nullable=True)
    resource_name = Column(String(200), nullable=True)
    server_id = Column(Integer, nullable=True, index=True)
    server_name = Column(String(100), nullable=True)
    node_name = Column(String(100), nullable=True)
    
    details = Column(JSON, nullable=True)
    request_body = Column(JSON, nullable=True)
    response_body = Column(JSON, nullable=True)
    
    request_method = Column(String(10), nullable=True)
    request_path = Column(String(500), nullable=True)
    query_params = Column(String(1000), nullable=True)
    response_status = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    
    success = Column(Boolean, default=True, nullable=False)
    error_message = Column(Text, nullable=True)
    error_traceback = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    __table_args__ = (
        Index('idx_audit_level_category', 'level', 'category'),
        Index('idx_audit_user_time', 'username', 'created_at'),
        Index('idx_audit_resource', 'resource_type', 'resource_id'),
        Index('idx_audit_created', 'created_at'),
        Index('idx_audit_request_id', 'request_id'),
        Index('idx_audit_ip', 'ip_address'),
        Index('idx_audit_server', 'server_id'),
    )

    def __repr__(self):
        return f"<AuditLog(id={self.id}, level='{self.level}', action='{self.action}')>"
