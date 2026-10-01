"""Synthetic (defensive-only) event collection for the detection lab."""

from app.collectors.base import BaseCollector, Record, Scenario, ScenarioStep
from app.collectors.normalizer import NormalizationError, normalize, parse_timestamp, sigma_view
from app.collectors.scenario_generator import ALL_SCENARIOS, SCENARIOS, ScenarioGenerator, get_scenario

__all__ = [
    "ALL_SCENARIOS",
    "BaseCollector",
    "NormalizationError",
    "Record",
    "SCENARIOS",
    "Scenario",
    "ScenarioGenerator",
    "ScenarioStep",
    "get_scenario",
    "normalize",
    "parse_timestamp",
    "sigma_view",
]
