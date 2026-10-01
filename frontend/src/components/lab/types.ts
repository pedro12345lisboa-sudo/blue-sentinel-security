export type LabKind = 'sigma' | 'yara' | 'correlation';

export type LabSessionStatus = 'idle' | 'running' | 'paused' | 'completed';

export type LabConnection = 'idle' | 'connecting' | 'connected' | 'error';

/** Scenario metadata from `GET /api/v1/lab/scenarios`. */
export interface LabScenario {
  id: string;
  name: string;
  description: string;
  severity: string;
  event_count: number;
  expected_rules: string[];
  mitre: string[];
}

/** Scenario block from the WebSocket `started` message. */
export interface LabRunningScenario {
  id: string;
  name: string;
  description: string;
  event_count: number;
  expected_rules: string[];
  expected_severity: string;
  mitre: string[];
}

/** Normalised event (see backend `app/collectors/normalizer.py`). */
export interface LabEvent {
  id: string;
  timestamp: string;
  host: string;
  user: string;
  process: string;
  command_line: string;
  ip: string;
  category: string;
  action: string;
  event_id: string;
  product: string;
  hour: number;
  fields: Record<string, unknown>;
  text: string;
  raw: Record<string, unknown>;
}

/** One field comparison that evaluated to true (educational panel). */
export interface LabBinding {
  field: string;
  op: string;
  expected: unknown;
  actual: unknown;
  completed_at?: string;
}

export interface LabAlert {
  id: string;
  kind: LabKind;
  rule_id: string;
  title: string;
  description: string;
  severity: string;
  severity_label: string;
  mitre: string[];
  timestamp: string;
  host: string;
  user: string;
  event_id: string;
  count: number;
  matched_fields: LabBinding[];
  false_positives: string[];
  response: string[];
}

export interface LabTimelineEntry {
  ts: string;
  kind: string;
  ref: string;
  text: string;
  severity: string;
}

export interface LabIncident {
  id: string;
  title: string;
  description: string;
  scenario_id: string;
  scenario_name: string;
  opened_at: string;
  opened_by: string;
  severity: string;
  severity_label: string;
  status: 'open' | 'closed';
  alert_ids: string[];
  timeline: LabTimelineEntry[];
  mitre: string[];
  response: string[];
  false_positives: string[];
  expected_rules: string[];
  expected_severity: string;
}

export interface LabReport {
  scenario_id: string;
  scenario_name: string;
  events: number;
  alerts: number;
  suppressed: number;
  correlation_fires: number;
  rules_fired: string[];
  expected_rules: string[];
  missing_rules: string[];
  unexpected_rules: string[];
  final_severity: string;
  expected_severity: string;
  incident: LabIncident | null;
  yara_engine: string;
  rule_ms: Record<string, { evals: number; max_ms: number }>;
  slow_evaluations: number;
  max_process_ms: number;
}

export interface LabRuleSummary {
  id: string;
  title: string;
  level: string;
  mitre: string[];
  kind: LabKind;
  description: string;
  false_positives: string[];
  response: string[];
}

export interface LabRuleDetail extends LabRuleSummary {
  source: string;
  condition?: string | null;
  logsource?: Record<string, unknown> | null;
  strings?: { id: string; literal: string }[] | null;
  stages?: { id: string; min_events: number; rule_ids: string[] }[] | null;
  window_seconds?: number | null;
  group_by?: string[] | null;
}

/** Server -> client WebSocket messages (discriminated by `type`). */
export type LabServerMessage =
  | {
      type: 'connected';
      session_id: string;
      status: LabSessionStatus;
      speed: number;
      speed_options: number[];
      rules: LabRuleSummary[];
      server_time?: string;
    }
  | { type: 'started'; scenario: LabRunningScenario; total_events: number; speed: number; status: LabSessionStatus }
  | { type: 'event'; event: LabEvent }
  | { type: 'alert'; alert: LabAlert }
  | { type: 'incident'; incident: LabIncident }
  | { type: 'state'; status: LabSessionStatus; speed: number }
  | { type: 'rules'; rules: LabRuleSummary[]; errors: string[] }
  | { type: 'completed'; report: LabReport }
  | { type: 'error'; code: string; message?: string }
  | { type: 'ping' };
