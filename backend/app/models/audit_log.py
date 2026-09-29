from datetime import datetime

from sqlalchemy import String, Integer, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=True)
    resource_id: Mapped[int] = mapped_column(Integer, nullable=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=True)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)
    details: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())