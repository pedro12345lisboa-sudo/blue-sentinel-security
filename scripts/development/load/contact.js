// Carga do formulário de contato — POST /api/v1/contact.
//
// O endpoint tem limite de 10 requisições/min por IP (janela deslizante) e
// 5/hora por e-mail. Por isso o cenário roda a 0,15 req/s (~9/min): qualquer
// requisição extra viraria 429 e estouraria a taxa de erro de 1 % — que é
// exatamente o sinal de que o teste saiu do envelope contratado.
//
//   k6 run scripts/development/load/contact.js
//   k6 run -e BASE_URL=https://api.exemplo.com scripts/development/load/contact.js
//   k6 run --vus 10 --duration 2m scripts/development/load/contact.js   # smoke
import http from 'k6/http';
import { check } from 'k6';

import { API, contactPayload, json, performanceThresholds } from './lib.js';

export const options = {
  scenarios: {
    contact_steady: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 0.15),
      timeUnit: '1s',
      duration: __ENV.DURATION || '2m',
      preAllocatedVUs: 5,
      maxVUs: 20,
    },
  },
  thresholds: {
    ...performanceThresholds,
    // Todo 202 conta como sucesso; 422/429/5xx derrubam a taxa de checks.
    checks: ['rate>0.99'],
  },
};

export default function () {
  const iteration = `${__ITER}`;
  const response = http.post(
    `${API}/contact`,
    JSON.stringify(contactPayload(iteration)),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'POST /contact' },
      timeout: '10s',
    },
  );

  json(response, 'POST /contact');
  check(response, {
    'aceito (202)': (r) => r.status === 202,
    'sem erro interno': (r) => r.status !== 500,
  });
}
