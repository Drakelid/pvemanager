from sqlalchemy import Float
from .base import Base, Column, Integer, BigInteger, String, DateTime, Index, func


class InstanceMetric(Base):
    __tablename__ = "instance_metric"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    server_id = Column(Integer, nullable=False)
    vmid = Column(Integer, nullable=False)
    vm_type = Column(String(10), nullable=True)
    ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    cpu = Column(Float, nullable=True)
    mem = Column(BigInteger, nullable=True)
    maxmem = Column(BigInteger, nullable=True)
    disk_used = Column(BigInteger, nullable=True)
    disk_total = Column(BigInteger, nullable=True)
    netin_rate = Column(Float, nullable=True)
    netout_rate = Column(Float, nullable=True)
    diskread_rate = Column(Float, nullable=True)
    diskwrite_rate = Column(Float, nullable=True)
    iops_read = Column(Float, nullable=True)
    iops_write = Column(Float, nullable=True)

    __table_args__ = (Index("ix_instance_metric_lookup", "server_id", "vmid", "ts"),)


class InstanceNicMetric(Base):
    __tablename__ = "instance_nic_metric"

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    server_id = Column(Integer, nullable=False)
    vmid = Column(Integer, nullable=False)
    ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    dev = Column(String(64), nullable=False)
    in_rate = Column(Float, nullable=True)
    out_rate = Column(Float, nullable=True)

    __table_args__ = (Index("ix_instance_nic_metric_lookup", "server_id", "vmid", "ts"),)
