"""Defensive detection stack for the BLUE-SENTINEL lab (Sigma/YARA/correlation)."""

from app.detection.correlation import (
    CorrelationEngine,
    MemoryWindowStore,
    Pattern,
    PatternError,
    RedisWindowStore,
    load_pattern,
)
from app.detection.engine import Alert, DetectionEngine, Incident, ProcessingResult
from app.detection.mitre import title as mitre_title, validate as mitre_validate
from app.detection.severity import SEVERITIES, rank, max_severity, normalize as normalize_severity
from app.detection.sigma_loader import SigmaError, SigmaParseError, SigmaRuleSet, load_sigma_rule
from app.detection.yara_scanner import YaraError, YaraScanner, load_yara_rule

__all__ = [
    "Alert",
    "CorrelationEngine",
    "DetectionEngine",
    "Incident",
    "MemoryWindowStore",
    "Pattern",
    "PatternError",
    "ProcessingResult",
    "RedisWindowStore",
    "SEVERITIES",
    "SigmaError",
    "SigmaParseError",
    "SigmaRuleSet",
    "YaraError",
    "YaraScanner",
    "load_pattern",
    "load_sigma_rule",
    "load_yara_rule",
    "max_severity",
    "mitre_title",
    "mitre_validate",
    "normalize_severity",
    "rank",
]
