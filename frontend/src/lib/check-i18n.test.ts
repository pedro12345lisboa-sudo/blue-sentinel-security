import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = path.resolve(process.cwd(), '../scripts/development/check_i18n.mjs');

let fixtures: string;
let messagesDir: string;
let componentsDir: string;

function run(extraEnv: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      I18N_MESSAGES_DIR: messagesDir,
      I18N_SCAN_DIR: componentsDir,
      I18N_SCAN: '1',
      ...extraEnv,
    },
  });
}

function writeMessages(pt: object, en: object) {
  writeFileSync(path.join(messagesDir, 'pt-BR.json'), JSON.stringify(pt));
  writeFileSync(path.join(messagesDir, 'en.json'), JSON.stringify(en));
}

beforeAll(() => {
  fixtures = mkdtempSync(path.join(tmpdir(), 'check-i18n-'));
  messagesDir = path.join(fixtures, 'messages');
  componentsDir = path.join(fixtures, 'components');
  mkdirSync(messagesDir, { recursive: true });
  mkdirSync(componentsDir, { recursive: true });
});

afterAll(() => {
  rmSync(fixtures, { recursive: true, force: true });
});

describe('check_i18n script', () => {
  it('passes when messages have full key/type parity and components are clean', () => {
    writeMessages(
      { nav: { home: 'Início' }, items: [{ label: 'Um' }, { label: 'Dois' }] },
      { nav: { home: 'Home' }, items: [{ label: 'One' }, { label: 'Two' }] }
    );
    writeFileSync(
      path.join(componentsDir, 'clean.tsx'),
      'export function Clean() {\n  return <p>OK</p>;\n}\n'
    );

    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('check_i18n: OK');
  });

  it('fails on missing keys and array length mismatches', () => {
    writeMessages(
      { nav: { home: 'Início', about: 'Sobre' }, items: [{ label: 'Um' }, { label: 'Dois' }] },
      { nav: { home: 'Home' }, items: [{ label: 'One' }] }
    );

    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('chave ausente em en.json: "nav.about"');
    expect(result.stderr).toContain('tamanho de array divergente em "items"');
  });

  it('fails on different value types', () => {
    writeMessages({ count: 3 }, { count: 'três' });

    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('tipo divergente em "count"');
  });

  it('fails on hardcoded Portuguese text in components', () => {
    writeMessages({ a: 'x' }, { a: 'y' });
    writeFileSync(
      path.join(componentsDir, 'hardcoded.tsx'),
      'export function Bad() {\n  return <p aria-label="Enviar mensagem">Olá você</p>;\n}\n'
    );

    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('texto hardcoded pt-BR');
  });

  it('allows skipping the component scan with I18N_SCAN=0', () => {
    writeMessages({ a: 'x' }, { a: 'y' });
    writeFileSync(
      path.join(componentsDir, 'hardcoded.tsx'),
      'export function Bad() {\n  return <p>Enviar mensagem</p>;\n}\n'
    );

    const result = run({ I18N_SCAN: '0' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('varredura de componentes desabilitada');
  });
});
