from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class LabSession(Base):
    __tablename__ = "lab_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    session_token: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)
    user_agent: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=True, default="active")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())