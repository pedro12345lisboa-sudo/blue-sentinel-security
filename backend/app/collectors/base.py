"""Base abstractions for synthetic (defensive-only) event collection.

Everything in this package produces **fabricated** logs for the educational
lab. No real user data, payloads or exploits are ever generated here.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Iterator

Record = dict[str, Any]


@dataclass(frozen=True)
class ScenarioStep:
    """One synthetic log record plus the simulated delay before it occurs.

    `delay_seconds` is relative to the previous step and is measured on the
    **simulated timeline** (the record timestamp). The WebSocket runner maps it
    to wall-clock time divided by the session speed factor.
    """

    delay_seconds: float
    record: Record


@dataclass(frozen=True)
class Scenario:
    """A scripted timeline of synthetic events with didactic metadata."""

    id: str
    name: str
    description: str
    steps: tuple[ScenarioStep, ...]
    expected_rules: tuple[str, ...] = ()
    expected_severity: str = "informational"
    mitre: tuple[str, ...] = ()

    @property
    def event_count(self) -> int:
        return len(self.steps)

    @property
    def simulated_duration(self) -> float:
        return sum(step.delay_seconds for step in self.steps)

    def iter_steps(self) -> Iterator[ScenarioStep]:
        yield from self.steps


class BaseCollector(ABC):
    """Interface for anything that can produce a scripted scenario."""

    @abstractmethod
    def scenario(self) -> Scenario:
        """Return the fully materialised scenario."""
