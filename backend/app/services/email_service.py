import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    """Send contact notifications via configurable SMTP."""

    @staticmethod
    async def send_contact_notification(
        name: str,
        email: str,
        subject: str,
        message: str,
    ) -> bool:
        if not settings.smtp_host:
            logger.info(
                "SMTP not configured, logging email instead: from=%s subject=%s",
                email,
                subject,
            )
            return True

        try:
            import aiosmtplib
            from email.message import EmailMessage

            msg = EmailMessage()
            msg["From"] = settings.smtp_from
            msg["To"] = settings.email_to
            msg["Subject"] = f"[Blue-Sentinel] {subject}"
            msg.set_content(
                f"De: {name} <{email}>\n"
                f"Assunto: {subject}\n\n"
                f"{message}"
            )

            await aiosmtplib.send(
                msg,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_user or None,
                password=settings.smtp_password or None,
                use_tls=settings.smtp_port in (465, 587),
            )
            logger.info("Email sent to=%s", settings.email_to)
            return True
        except Exception:
            logger.error("Email send failed", exc_info=True)
            return False
