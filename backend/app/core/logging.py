"""Logs estruturados (JSON) com redação de dados sensíveis.

Contrato de privacidade (docs/security/data-inventory.md):

* cada linha de log é um objeto JSON com ``timestamp``, ``level``,
  ``logger`` e ``message``; quando o log acontece dentro de uma requisição
  herda ``request_id``, ``route``, ``status`` e ``duration_ms``;
* nunca sai daqui corpo de requisição, senha, token, cookie ou e-mail
  completo — o :class:`RedactionFilter` mascara o valor **antes** da
  escrita, então até um ``logger.info("... %s", email)`` legado é seguro;
* ``request_id`` vive num ``ContextVar``: qualquer log emitido durante o
  request (qualquer camada) carrega o mesmo identificador.
"""

from __future__ import annotations

import json
import logging
import re
import sys
import traceback
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings

# --------------------------------------------------------------------------- #
# Contexto de requisição                                                       #
# --------------------------------------------------------------------------- #

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


def current_request_id() -> str | None:
    """``request_id`` do request em curso (ou ``None`` fora de um)."""
    return request_id_var.get()


# --------------------------------------------------------------------------- #
# Redação                                                                      #
# --------------------------------------------------------------------------- #

REDACTED = "[REDACTED]"

# Chaves cujo valor é trocado por inteiro (nada de mascarar "por dentro").
SENSITIVE_KEYS = frozenset(
    {
        "password",
        "passwd",
        "pwd",
        "token",
        "access_token",
        "refresh_token",
        "id_token",
        "jwt",
        "secret",
        "secret_key",
        "api_key",
        "apikey",
        "authorization",
        "cookie",
        "set-cookie",
        "session",
        "session_token",
        "credentials",
        "private_key",
        "metrics_token",
        "agent_api_key",
        "smtp_password",
    }
)

# Chaves que nunca deveriam aparecer num log de todo jeito (são PII).
PII_KEYS = frozenset({"email", "e-mail", "ip", "ip_address", "user_agent", "cpf", "phone"})

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b")
BEARER_RE = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}")
ASSIGN_RE = re.compile(
    r"(?i)\b(password|passwd|pwd|token|api[_-]?key|secret|authorization|cookie)"
    r"(\s*[=:]\s*)([^\s,;\"']+)"
)


def mask_email(value: str) -> str:
    """``joao.silva@example.com`` -> ``j***@example.com`` (nunca o e-mail completo)."""
    local, _, domain = value.partition("@")
    if not domain:
        return REDACTED
    head = local[:1] if local else ""
    return f"{head}***@{domain}"


def redact_text(text: str) -> str:
    """Mascara e-mail, JWT, ``Bearer <token>`` e pares chave=segredo."""
    if not text:
        return text
    text = EMAIL_RE.sub(lambda m: mask_email(m.group(0)), text)
    text = JWT_RE.sub(REDACTED, text)
    text = BEARER_RE.sub(lambda m: f"{m.group(1)} {REDACTED}", text)
    text = ASSIGN_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}{REDACTED}", text)
    return text


def is_sensitive_key(key: str) -> bool:
    lowered = key.lower()
    if lowered in SENSITIVE_KEYS:
        return True
    return any(
        token in lowered
        for token in ("password", "secret", "token", "api_key", "apikey", "credential")
    )


def is_pii_key(key: str) -> bool:
    """Chave cujo valor string é PII (e-mail, IP, user-agent...)."""
    lowered = key.lower()
    # Cobrem nomes compostos comuns: client_ip, source_ip, user_email...
    return lowered in PII_KEYS or lowered.endswith(("_ip", "_email"))


def redact_value(key: str, value: Any) -> Any:
    """Redige um campo extra de log antes de ele chegar ao handler."""
    if is_sensitive_key(key):
        return REDACTED
    if is_pii_key(key):
        # IP/e-mail/user-agent: o valor inteiro não deve ser persistido.
        if isinstance(value, str):
            return REDACTED
        return value
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, dict):
        return {str(k): redact_value(str(k), v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact_value(key, item) for item in value]
    return value


# Atributos padrão de ``LogRecord`` — o resto é campo extra do usuário.
_STANDARD_ATTRS = frozenset(
    logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys()
) | {"message", "asctime", "taskName"}


class RedactionFilter(logging.Filter):
    """Redige mensagem e campos extras de todo registro que passa por aqui."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        try:
            message = record.getMessage()
        except Exception:  # pragma: no cover - defensivo
            message = str(record.msg)
        record.msg = redact_text(message)
        record.args = ()
        for key, value in list(record.__dict__.items()):
            if key in _STANDARD_ATTRS:
                continue
            record.__dict__[key] = redact_value(key, value)
        return True


# --------------------------------------------------------------------------- #
# Handler JSON                                                                 #
# --------------------------------------------------------------------------- #


class InterceptHandler(logging.Handler):
    """Emite cada registro como uma linha JSON no stderr (coletável por Loki)."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            payload: dict[str, Any] = {
                "timestamp": self._format_time(record.created),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
                "module": record.module,
                "line": record.lineno,
            }
            request_id = getattr(record, "request_id", None) or request_id_var.get()
            if request_id:
                payload["request_id"] = request_id
            for key, value in record.__dict__.items():
                if key in _STANDARD_ATTRS or key == "request_id":
                    continue
                payload[key] = value
            if record.exc_info:
                payload["exception"] = redact_text(
                    "".join(traceback.format_exception(*record.exc_info)).strip()
                )
            print(json.dumps(payload, default=str), file=sys.stderr)
        except Exception:  # pragma: no cover - logging nunca pode derrubar a app
            self.handleError(record)

    @staticmethod
    def _format_time(timestamp: float) -> str:
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


def setup_logging() -> None:
    """Configura o logging da aplicação (JSON + redação)."""
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    handler = InterceptHandler()
    handler.addFilter(RedactionFilter())
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.handlers = []
    logger.addHandler(handler)

    # O filtro também fica no logger raiz para que *qualquer* handler que
    # herde o registro (caplog, coletor de arquivo, etc.) receba o dado já
    # redigido — a redação acontece uma única vez, antes de todos.
    if not any(isinstance(f, RedactionFilter) for f in logger.filters):
        logger.addFilter(RedactionFilter())

    # Ruído de bibliotecas de terceiros
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.WARNING if not settings.debug else logging.INFO
    )
    logging.getLogger("asyncio").setLevel(logging.WARNING)
