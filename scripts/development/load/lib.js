// Funções compartilhadas pelos scripts de carga (k6).
//
// Uso:
//   k6 run scripts/development/load/contact.js
//   k6 run -e BASE_URL=https://api.exemplo.com scripts/development/load/lab.js
import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
export const API = `${BASE_URL}/api/v1`;

// Contrato de performance do portfólio: p95 < 300 ms e taxa de erro < 1 %.
export const performanceThresholds = {
  http_req_duration: ['p(95)<300'],
  http_req_failed: ['rate<0.01'],
};

export function json(response, name) {
  return check(
    response,
    {
      [`${name}: status esperado`]: (r) => r.status >= 200 && r.status < 300,
      [`${name}: é JSON`]: (r) => {
        const contentType = r.headers['Content-Type'] || r.headers['content-type'] || '';
        return contentType.includes('json');
      },
    },
    { name: `${name} contract` },
  );
}

export function contactPayload(iteration) {
  // Um e-mail por iteração: o limite é 5/hora por e-mail e 10/min por IP.
  return {
    name: `Load test ${iteration}`,
    email: `load-${__ENV.K6_SCENARIO || 'contact'}-${iteration}@example.com`,
    subject: 'general',
    message: 'Mensagem sintética gerada pelo k6 para medir latência do endpoint.',
  };
}
