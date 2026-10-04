import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';

const SCENARIOS_API = '**/api/v1/lab/scenarios';
const SESSIONS_API = '**/api/v1/lab/sessions';
const WS_PATTERN = '**/api/v1/ws/lab/*';

const SCENARIOS = [
  {
    id: 'brute-force',
    name: 'Credential brute force',
    description: 'Repeated failed logons followed by a success',
    severity: 'critical',
    event_count: 9,
    expected_rules: ['bs-auth-failed-logons', 'corr-brute-force-sequence'],
    mitre: ['T1110.001', 'T1078'],
  },
  {
    id: 'after-hours-login',
    name: 'After-hours login',
    description: 'Logon at 03:14 from a never-seen country',
    severity: 'high',
    event_count: 5,
    expected_rules: ['bs-cloud-login-new-country'],
    mitre: ['T1078'],
  },
  {
    id: 'temp-process',
    name: 'Temp folder process',
    description: 'Encoded PowerShell from Temp with outbound connection',
    severity: 'critical',
    event_count: 4,
    expected_rules: ['bs-proc-powershell-encoded-command', 'bs-net-suspicious-outbound'],
    mitre: ['T1059.001', 'T1071.001'],
  },
  {
    id: 'log-clearing',
    name: 'Audit log clearing',
    description: 'Audit disabled and evtx deleted',
    severity: 'critical',
    event_count: 4,
    expected_rules: ['bs-audit-log-cleared'],
    mitre: ['T1070.001'],
  },
  {
    id: 'sqli-web',
    name: 'SQL Injection in web logs',
    description: 'Classic SQLi probes in access logs',
    severity: 'critical',
    event_count: 5,
    expected_rules: ['bs-web-sql-injection'],
    mitre: ['T1190'],
  },
];

const RULES = [
  {
    id: 'bs-proc-powershell-encoded-command',
    title: 'Encoded PowerShell command',
    level: 'high',
    mitre: ['T1059.001'],
    kind: 'sigma',
    description: 'PowerShell with -enc or base64 command',
    false_positives: ['Admin scripts with encoded commands'],
    response: ['Review the command line', 'Check parent process'],
  },
  {
    id: 'bs-net-suspicious-outbound',
    title: 'Suspicious outbound connection',
    level: 'medium',
    mitre: ['T1071.001'],
    kind: 'sigma',
    description: 'Outbound connection to unusual port',
    false_positives: ['Legitimate update services'],
    response: ['Verify destination', 'Check process hash'],
  },
];

const EVENT = {
  id: 'evt-1',
  timestamp: '2026-03-10T12:00:00Z',
  host: 'HOST-1',
  user: 'user1',
  process: 'powershell.exe',
  command_line: 'powershell -enc SQBFAFgA...',
  ip: '10.0.0.5',
  category: 'process',
  action: 'process_start',
  event_id: '1',
  product: 'windows',
  hour: 12,
  fields: { path: 'C:\\Temp\\x.ps1' },
  text: 'powershell.exe C:\\Temp\\x.ps1',
  raw: {},
};

const ALERT = {
  id: 'alert-1',
  kind: 'sigma',
  rule_id: 'bs-proc-powershell-encoded-command',
  title: 'Encoded PowerShell command',
  description: 'PowerShell with -enc or base64 command',
  severity: 'high',
  severity_label: 'Alta',
  mitre: ['T1059.001'],
  timestamp: '2026-03-10T12:00:01Z',
  host: 'HOST-1',
  user: 'user1',
  event_id: 'evt-1',
  count: 1,
  matched_fields: [{ field: 'command_line', op: 'contains', expected: '-enc', actual: 'powershell -enc SQBFAFgA...' }],
  false_positives: ['Admin scripts with encoded commands'],
  response: ['Review the command line', 'Check parent process'],
};

async function mockLabBackend(page: Page) {
  await page.route(SCENARIOS_API, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCENARIOS) });
  });
  await page.route(SESSIONS_API, async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        session_id: 'sess-e2e',
        ticket: 'tk-e2e',
        expires_at: '2099-01-01T00:00:00Z',
      }),
    });
  });
}

async function mockLabSocket(
  page: Page,
  handler: (msg: { type: string; [k: string]: unknown }, ws: WebSocketRoute) => void,
) {
  return page.routeWebSocket(WS_PATTERN, (ws) => {
    ws.onMessage((data) => {
      handler(JSON.parse(String(data)), ws);
    });
    ws.send(
      JSON.stringify({
        type: 'connected',
        session_id: 'sess-e2e',
        status: 'idle',
        speed: 2,
        speed_options: [1, 2, 4],
        rules: RULES,
        server_time: '2026-03-10T12:00:00Z',
      }),
    );
  });
}

test.describe('Laboratório (REST + WebSocket mockados)', () => {
  test('scenario catalog renders from REST', async ({ page }) => {
    await mockLabBackend(page);
    await mockLabSocket(page, () => {});

    await page.goto('/pt-BR/lab');
    const tempCard = page.getByRole('button', { name: /Processo em pasta temporária/ });
    await expect(tempCard).toBeVisible();
    await expect(tempCard).toContainText('4 eventos');
    await expect(page.getByRole('button', { name: /SQL Injection em logs web/ })).toBeVisible();
  });

  test('start scenario streams events and shows alert', async ({ page }) => {
    await mockLabBackend(page);
    await mockLabSocket(page, (msg, ws) => {
      if (msg.type === 'start') {
        ws.send(
          JSON.stringify({
            type: 'started',
            scenario: {
              id: 'temp-process',
              name: 'Temp folder process',
              description: 'Encoded PowerShell from Temp',
              event_count: 4,
              expected_rules: ['bs-proc-powershell-encoded-command'],
              expected_severity: 'critical',
              mitre: ['T1059.001'],
            },
            total_events: 4,
            speed: 2,
            status: 'running',
          }),
        );
        ws.send(JSON.stringify({ type: 'event', event: EVENT }));
        ws.send(JSON.stringify({ type: 'alert', alert: ALERT }));
      }
    });

    await page.goto('/pt-BR/lab');
    await page.getByRole('button', { name: 'Processo em pasta temporária' }).click();
    await page.getByRole('button', { name: 'Executar cenário' }).click();

    await expect(page.getByText('Ao vivo')).toHaveCount(2);
    await expect(page.getByText('Painel de alertas')).toBeVisible();
    await expect(page.getByText('1 alerto')).toBeVisible();
    await expect(page.locator('aside').getByText('Encoded PowerShell command')).toBeVisible();
  });

  test('clicking an alert opens the explanation panel', async ({ page }) => {
    await mockLabBackend(page);
    await mockLabSocket(page, (msg, ws) => {
      if (msg.type === 'start') {
        ws.send(JSON.stringify({ type: 'started', scenario: { id: 'temp-process' }, total_events: 4, speed: 2, status: 'running' }));
        ws.send(JSON.stringify({ type: 'alert', alert: ALERT }));
      }
    });

    await page.goto('/pt-BR/lab');
    await page.getByRole('button', { name: 'Processo em pasta temporária' }).click();
    await page.getByRole('button', { name: 'Executar cenário' }).click();

    await page.getByRole('button', { name: /Encoded PowerShell command/ }).click();
    await expect(page.getByText('Explicação do alerta')).toBeVisible();
    await expect(page.getByText('Selecionado')).toBeVisible();
    await expect(page.getByText('powershell -enc SQBFAFgA...')).toBeVisible();
  });

  test('pause and resume update status badge', async ({ page }) => {
    await mockLabBackend(page);
    await mockLabSocket(page, (msg, ws) => {
      if (msg.type === 'start') {
        ws.send(JSON.stringify({ type: 'started', scenario: { id: 'temp-process' }, total_events: 4, speed: 2, status: 'running' }));
      }
      if (msg.type === 'pause') {
        ws.send(JSON.stringify({ type: 'state', status: 'paused', speed: 2 }));
      }
      if (msg.type === 'resume') {
        ws.send(JSON.stringify({ type: 'state', status: 'running', speed: 2 }));
      }
    });

    await page.goto('/pt-BR/lab');
    await page.getByRole('button', { name: 'Processo em pasta temporária' }).click();
    await page.getByRole('button', { name: 'Executar cenário' }).click();
    await expect(page.getByText('Ao vivo')).toHaveCount(2);

    await page.getByRole('button', { name: 'Pausar' }).click();
    await expect(page.getByText('Pausado')).toHaveCount(2);

    await page.getByRole('button', { name: 'Retomar' }).click();
    await expect(page.getByText('Ao vivo')).toHaveCount(2);
  });

  test('server error message is shown and dismissible', async ({ page }) => {
    await mockLabBackend(page);
    await mockLabSocket(page, (msg, ws) => {
      if (msg.type === 'start') {
        ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_SCENARIO', message: 'nope' }));
      }
    });

    await page.goto('/pt-BR/lab');
    await page.getByRole('button', { name: 'Processo em pasta temporária' }).click();
    await page.getByRole('button', { name: 'Executar cenário' }).click();

    await expect(page.getByText('Cenário desconhecido.')).toBeVisible();
    await page
      .getByRole('alert')
      .filter({ hasText: 'Cenário desconhecido.' })
      .getByRole('button', { name: 'Fechar' })
      .click();
    await expect(page.getByText('Cenário desconhecido.')).toHaveCount(0);
  });

  test('speed buttons are sent to the server', async ({ page }) => {
    const sent: string[] = [];
    await mockLabBackend(page);
    await mockLabSocket(page, (msg, ws) => {
      sent.push(JSON.stringify(msg));
      if (msg.type === 'start') {
        ws.send(JSON.stringify({ type: 'started', scenario: { id: 'temp-process' }, total_events: 4, speed: 2, status: 'running' }));
      }
    });

    await page.goto('/pt-BR/lab');
    await page.getByRole('button', { name: 'Processo em pasta temporária' }).click();
    await page.getByRole('button', { name: 'Executar cenário' }).click();
    await expect(page.getByText('Ao vivo')).toHaveCount(2);

    await page.getByRole('button', { name: '4x' }).click();
    await page.getByRole('button', { name: '1x' }).click();

    expect(sent.some((m) => m.includes('"type":"speed","value":4'))).toBe(true);
    expect(sent.some((m) => m.includes('"type":"speed","value":1'))).toBe(true);
  });

  test('reload rules shows confirmation notice', async ({ page }) => {
    await mockLabBackend(page);
    await mockLabSocket(page, (msg, ws) => {
      if (msg.type === 'reload_rules') {
        ws.send(JSON.stringify({ type: 'rules', rules: RULES, errors: [] }));
      }
    });

    await page.goto('/pt-BR/lab');
    await page.getByRole('button', { name: 'Recarregar regras' }).click();
    await expect(page.getByText('Regras recarregadas do disco.')).toBeVisible();
  });
});
