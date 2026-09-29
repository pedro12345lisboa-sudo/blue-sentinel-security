from datetime import datetime

from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=True, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, nullable=True, default=False)
    last_login: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now)