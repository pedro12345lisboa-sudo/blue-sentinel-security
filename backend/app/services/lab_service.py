"""Lab session lifecycle, scenario catalog and rule documents.

The service keeps two module-level resources shared across requests:

* ``SCENARIOS`` - the five synthetic scenarios from
  ``app.collectors.scenario_generator`` exposed as API models;
* a lazily built :class:`DetectionEngine` used only as a **rule catalog**
  (summaries for the WebSocket ``connected`` message and full documents for
  the educational panel). It hot-reloads on disk changes; each lab session
  still owns its own engine instance in ``ws_lab``.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.collectors.scenario_generator import ALL_SCENARIOS, get_scenario
from app.core.errors import NotFoundError, RateLimitError
from app.detection.engine import DetectionEngine, default_rules_dir
from app.models.lab_session import LabSession
from app.schemas.lab import LabRuleDetail, LabRuleSummary, LabScenario, LabSessionResponse

logger = logging.getLogger(__name__)

SESSION_TTL_MINUTES = 30
# In-memory rate limit for POST /lab/sessions (per client IP).
SESSION_RATE_LIMIT = 10
SESSION_RATE_WINDOW_SECONDS = 600

SCENARIOS: list[LabScenario] = [
    LabScenario(
        id=scenario.id,
        name=scenario.name,
        description=scenario.description,
        severity=scenario.expected_severity,
        event_count=scenario.event_count,
        expected_rules=list(scenario.expected_rules),
        mitre=list(scenario.mitre),
    )
    for scenario in ALL_SCENARIOS
]

_session_creations: dict[str, deque[float]] = {}
_rate_lock = threading.Lock()

_catalog: DetectionEngine | None = None
_catalog_lock = threading.Lock()


def _get_catalog() -> DetectionEngine:
    """Shared rule catalog; hot-reloads when files change on disk."""
    global _catalog
    with _catalog_lock:
        if _catalog is None:
            _catalog = DetectionEngine(default_rules_dir())
        else:
            try:
                _catalog.reload_if_changed()
            except Exception:  # pragma: no cover - defensive; keep last good set
                logger.warning("Rule catalog reload failed", exc_info=True)
        return _catalog


def _check_session_rate(ip_address: str) -> None:
    now = time.monotonic()
    with _rate_lock:
        bucket = _session_creations.get(ip_address)
        if bucket is None:
            bucket = deque()
            _session_creations[ip_address] = bucket
        cutoff = now - SESSION_RATE_WINDOW_SECONDS
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= SESSION_RATE_LIMIT:
            retry_after = max(1, int(SESSION_RATE_WINDOW_SECONDS - (now - bucket[0])) + 1)
            raise RateLimitError(retry_after)
        bucket.append(now)


class LabService:
    """Lab session lifecycle, scenarios and rule documents."""

    @staticmethod
    def list_scenarios() -> list[LabScenario]:
        return SCENARIOS

    @staticmethod
    def get_scenario(scenario_id: str):
        return get_scenario(scenario_id)

    @staticmethod
    async def create_session(
        db: AsyncSession,
        ip_address: str,
    ) -> LabSessionResponse:
        _check_session_rate(ip_address)

        session_id = f"sess-{uuid.uuid4().hex[:12]}"
        ticket = f"tk-{uuid.uuid4().hex[:16]}"
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=SESSION_TTL_MINUTES)

        row = LabSession(
            session_token=ticket,
            ip_address=ip_address,
            status="active",
            expires_at=expires_at,
        )
        db.add(row)
        await db.commit()

        logger.info("Lab session created id=%s ip=%s", session_id, ip_address)
        return LabSessionResponse(
            session_id=session_id,
            ticket=ticket,
            expires_at=expires_at,
        )

    @staticmethod
    async def get_session(
        db: AsyncSession,
        ticket: str,
    ) -> LabSession | None:
        result = await db.execute(
            select(LabSession).where(
                LabSession.session_token == ticket,
                LabSession.status == "active",
                LabSession.expires_at > datetime.now(timezone.utc),
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    def list_rules() -> list[LabRuleSummary]:
        catalog = _get_catalog()
        return [LabRuleSummary(**entry) for entry in catalog.rule_catalog()]

    @staticmethod
    def get_rule(rule_id: str) -> LabRuleDetail:
        catalog = _get_catalog()
        document = catalog.get_rule(rule_id)
        if document is None:
            raise NotFoundError("rule", rule_id)
        return LabRuleDetail(**document)
