import json
import logging
import sys
from typing import Any

from app.core.config import settings


class InterceptHandler(logging.Handler):
    """Intercept standard logging to structlog / uvicorn."""
    def emit(self, record: logging.LogRecord) -> None:
        # Default to stderr; can be replaced with structlog configuration
        print(
            json.dumps({
                "timestamp": self._format_time(record.created),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
                "module": record.module,
                "line": record.lineno,
                "trace_id": getattr(record, "trace_id", None),
            }, default=str),
            file=sys.stderr,
        )

    @staticmethod
    def _format_time(timestamp: float) -> str:
        from datetime import datetime, timezone
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


def setup_logging() -> None:
    """Configure application logging."""
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    handler = InterceptHandler()
    formatter = logging.Formatter("%(message)s")
    handler.setFormatter(formatter)
    logger.handlers = []
    logger.addHandler(handler)

    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING if not settings.debug else logging.INFO)
    logging.getLogger("asyncio").setLevel(logging.WARNING)