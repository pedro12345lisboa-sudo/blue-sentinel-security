// Carga do laboratório — GET /api/v1/lab/{scenarios,rules} + POST /lab/sessions.
//
// Leituras não têm limite por IP, então carregam de verdade (p95 < 300 ms).
// A criação de sessão é limitada a 10/600 s por IP, então roda em cenário
// próprio e lento (0,05 req/s ≈ 3/min) para não mascarar a latência real
// com 429.
//
//   k6 run scripts/development/load/lab.js
//   k6 run -e BASE_URL=https://api.exemplo.com scripts/development/load/lab.js
//   k6 run -e TARGET_RATE=5 scripts/development/load/lab.js              # smoke
import http from 'k6/http';
import { check } from 'k6';

import { API, json, performanceThresholds } from './lib.js';

export const options = {
  scenarios: {
    lab_reads: {
      executor: 'ramping-arrival-rate',
      startRate: Number(__ENV.START_RATE || 5),
      timeUnit: '1s',
      stages: [
        { target: Number(__ENV.TARGET_RATE || 20), duration: '30s' },
        { target: Number(__ENV.TARGET_RATE || 20), duration: '1m' },
        { target: 0, duration: '15s' },
      ],
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
    lab_session: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.SESSION_RATE || 0.05),
      timeUnit: '1s',
      duration: __ENV.DURATION || '2m',
      preAllocatedVUs: 5,
      maxVUs: 20,
    },
  },
  thresholds: {
    ...performanceThresholds,
    'http_req_duration{endpoint:scenarios}': ['p(95)<300'],
    'http_req_duration{endpoint:rules}': ['p(95)<300'],
    'http_req_duration{endpoint:session}': ['p(95)<300'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const response = http.get(`${API}/lab/rules`, {
    tags: { name: 'GET /lab/rules', endpoint: 'rules' },
    timeout: '10s',
  });
  const rules = response.json() || [];
  return {
    ruleIds: rules.map((rule) => rule.rule_id || rule.id).filter(Boolean),
  };
}

export default function (data) {
  const scenarios = http.get(`${API}/lab/scenarios`, {
    tags: { name: 'GET /lab/scenarios', endpoint: 'scenarios' },
    timeout: '10s',
  });
  json(scenarios, 'GET /lab/scenarios');
  check(scenarios, { 'cenários carregados': (r) => r.status === 200 });

  const ruleIds = (data && data.ruleIds) || [];
  if (ruleIds.length > 0) {
    const ruleId = ruleIds[__ITER % ruleIds.length];
    const rule = http.get(`${API}/lab/rules/${ruleId}`, {
      tags: { name: 'GET /lab/rules/{rule_id}', endpoint: 'rules' },
      timeout: '10s',
    });
    json(rule, 'GET /lab/rules/{rule_id}');
    check(rule, { 'regra encontrada (200)': (r) => r.status === 200 });
  }

  const session = http.post(`${API}/lab/sessions`, '', {
    tags: { name: 'POST /lab/sessions', endpoint: 'session' },
    timeout: '10s',
  });
  check(session, {
    'sessão criada (201)': (r) => r.status === 201,
    'sem erro interno': (r) => r.status !== 500,
  });
}
