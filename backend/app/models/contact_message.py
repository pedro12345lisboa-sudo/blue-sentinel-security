from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Integer, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class ContactMessage(Base):
    """Mensagem do formulário de contato — dado pessoal mínimo (LGPD).

    Coletamos **apenas** nome, e-mail, assunto e mensagem (mais o honeypot
    para armadilha contra bots). Nada de IP, user-agent ou fingerprint:
    ver docs/security/data-inventory.md.
    """

    __tablename__ = "contact_messages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    honeypot: Mapped[str] = mapped_column(String(255), nullable=True, default="")
    status: Mapped[str] = mapped_column(String(50), nullable=True, default="new")
    read: Mapped[bool] = mapped_column(Boolean, nullable=True, default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())