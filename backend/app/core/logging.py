import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any


class JsonFormatter(logging.Formatter):
    """Custom JSON log formatter for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Add extra fields if present
        if hasattr(record, "request_id"):
            log_entry["request_id"] = record.request_id
        if hasattr(record, "event_id"):
            log_entry["event_id"] = record.event_id

        # Include exception info if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Include stack info if present
        if record.stack_info:
            log_entry["stack"] = self.formatStack(record.stack_info)

        return json.dumps(log_entry, ensure_ascii=False)


def setup_logging() -> None:
    """Configure application logging with JSON format."""
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Handler para stdout (JSON lines)
 handler = logging.StreamHandler(sys.stdout)
 handler.setFormatter(JsonFormatter())

 # Evitar duplicated handlers
 if not root_logger.handlers:
    root_logger.addHandler(handler)

 # Reduzer ruido de bibliotecas third-party
 for _name in ["uvicorn", "fastapi", "asyncio"]:
    logging.getLogger(_name).setLevel(logging.WARNING)