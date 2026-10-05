"""Compressão de respostas HTTP e de arquivos (logs rotacionados).

Dois caminhos:

* :func:`compress_bytes` — usado pelo middleware de resposta *e* pela rotação
  de logs; prefere Brotli (``br``) quando o cliente aceita e a biblioteca está
  instalada, senão gzip (stdlib, sempre disponível).
* :class:`ResponseCompressionMiddleware` — aplica a escolha por ``Accept-Encoding``
  com limite mínimo de tamanho, então respostas pequenas não pagam o custo.
"""

from __future__ import annotations

import gzip
import logging
from pathlib import Path

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

try:  # opcional: a wheel nem sempre existe em todas as plataformas
    import brotli  # type: ignore

    BROTLI_AVAILABLE = True
except Exception:  # pragma: no cover - depende da plataforma
    brotli = None
    BROTLI_AVAILABLE = False

GZIP_LEVEL = 6


def gzip_bytes(data: bytes, level: int = GZIP_LEVEL) -> bytes:
    return gzip.compress(data, compresslevel=level)


def brotli_bytes(data: bytes, quality: int = 5) -> bytes:
    if not BROTLI_AVAILABLE:
        raise RuntimeError("brotli indisponível")
    return brotli.compress(data, quality=quality)  # type: ignore[union-attr]


def compress_bytes(data: bytes, accept_encoding: str = "") -> tuple[bytes, str]:
    """Comprime ``data`` conforme o ``Accept-Encoding``.

    Retorna ``(payload, content_encoding)``; quando nenhuma codificação é
    aplicada devolve o payload original com ``content_encoding=""``.
    """
    accepted = {token.strip().split(";")[0] for token in accept_encoding.split(",")}
    if "br" in accepted and BROTLI_AVAILABLE and len(data) > 0:
        compressed = brotli_bytes(data)
        # Brotli só compensa se realmente reduzir (sempre deveria).
        if len(compressed) < len(data):
            return compressed, "br"
    if "gzip" in accepted and len(data) > 0:
        return gzip_bytes(data), "gzip"
    return data, ""


def compress_file(path: Path | str, *, delete_source: bool = True) -> Path | None:
    """Gzip em disco para arquivos rotacionados; devolve o arquivo ``.gz``."""
    source = Path(path)
    if not source.is_file():
        return None
    target = source.with_suffix(source.suffix + ".gz")
    try:
        with source.open("rb") as fh, gzip.open(target, "wb", compresslevel=GZIP_LEVEL) as out:
            while chunk := fh.read(1024 * 256):
                out.write(chunk)
        if delete_source:
            source.unlink(missing_ok=True)
        return target
    except OSError:
        logger.warning("Falha ao comprimir %s", source, exc_info=True)
        return None


class ResponseCompressionMiddleware(BaseHTTPMiddleware):
    """gzip/Brotli nas respostas (``Accept-Encoding`` + limite mínimo)."""

    def __init__(self, app, min_size: int = 500) -> None:
        super().__init__(app)
        self.min_size = min_size

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        if request.method == "HEAD":
            return response
        if "content-encoding" in response.headers:
            return response
        if response.headers.get("content-type", "").startswith("text/event-stream"):
            return response

        accept = request.headers.get("accept-encoding", "")
        try:
            body = b"".join([chunk async for chunk in response.body_iterator])
        except Exception:
            logger.warning("Falha ao ler corpo para compressão", exc_info=True)
            return response

        if len(body) < self.min_size:
            return _rebuild(response, body)

        payload, encoding = compress_bytes(body, accept)
        if not encoding:
            return _rebuild(response, body)

        headers = {k: v for k, v in response.headers.items()}
        headers.pop("content-length", None)
        headers["content-encoding"] = encoding
        headers["vary"] = "Accept-Encoding"
        headers["x-compressed-bytes"] = str(len(payload))
        return Response(
            content=payload,
            status_code=response.status_code,
            headers=headers,
            background=response.background,
        )


def _rebuild(response: Response, body: bytes) -> Response:
    """Reconstrói a resposta original após consumir o ``body_iterator``."""
    headers = {k: v for k, v in response.headers.items()}
    headers.pop("content-length", None)
    headers["content-length"] = str(len(body))
    return Response(
        content=body,
        status_code=response.status_code,
        headers=headers,
        background=response.background,
    )


def gzip_available() -> bool:
    return True


def brotli_available() -> bool:
    return BROTLI_AVAILABLE


__all__ = [
    "BROTLI_AVAILABLE",
    "ResponseCompressionMiddleware",
    "brotli_available",
    "compress_bytes",
    "compress_file",
    "gzip_available",
    "gzip_bytes",
]
