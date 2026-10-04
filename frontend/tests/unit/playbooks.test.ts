import { describe, expect, it } from 'vitest';

import {
  getAllHypotheses,
  getAllPlaybooks,
  getHypothesisBySlug,
  getPlaybookBySlug,
  labScenarioTitle,
  ruleFileUrl,
} from '@/lib/playbooks';

describe('getAllPlaybooks', () => {
  it('lists playbooks ordered by frontmatter order', () => {
    const playbooks = getAllPlaybooks();

    expect(playbooks.length).toBeGreaterThan(0);
    expect(playbooks[0].title).toBeTruthy();
    expect(playbooks[0].slug).toBeTruthy();

    const orders = playbooks.map((p) => p.order ?? 0);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

describe('getPlaybookBySlug', () => {
  it('returns the playbook with the slug injected', () => {
    const [first] = getAllPlaybooks();
    const doc = getPlaybookBySlug('pt-BR', first.slug);

    expect(doc).not.toBeNull();
    expect(doc?.frontmatter.slug).toBe(first.slug);
    expect(doc?.content.length).toBeGreaterThan(0);
    expect(doc?.untranslated).toBe(false);
  });

  it('returns null for unknown slugs', () => {
    expect(getPlaybookBySlug('pt-BR', 'nao-existe')).toBeNull();
  });
});

describe('getAllHypotheses / getHypothesisBySlug', () => {
  it('lists hunting hypotheses and resolves one by slug', () => {
    const hypotheses = getAllHypotheses();

    expect(hypotheses.length).toBeGreaterThan(0);
    expect(hypotheses[0].hypothesis).toBeTruthy();

    const doc = getHypothesisBySlug('pt-BR', hypotheses[0].slug);
    expect(doc?.frontmatter.slug).toBe(hypotheses[0].slug);
    expect(doc?.content.length).toBeGreaterThan(0);
  });

  it('returns null for unknown slugs', () => {
    expect(getHypothesisBySlug('pt-BR', 'nao-existe')).toBeNull();
  });
});

describe('ruleFileUrl', () => {
  it('builds a GitHub blob URL without duplicating slashes', () => {
    expect(ruleFileUrl('https://github.com/blue-sentinel/repo', 'rules/exfil.yml')).toBe(
      'https://github.com/blue-sentinel/repo/blob/main/rules/exfil.yml'
    );
    expect(ruleFileUrl('https://github.com/blue-sentinel/repo/', '/rules/exfil.yml')).toBe(
      'https://github.com/blue-sentinel/repo/blob/main/rules/exfil.yml'
    );
  });
});

describe('labScenarioTitle', () => {
  it('reads the title of a known scenario', () => {
    const scenarios = { 'proc-temp': { title: 'Processo em pasta temporária' } };

    expect(labScenarioTitle(scenarios, 'proc-temp')).toBe('Processo em pasta temporária');
  });

  it('returns null for missing or malformed input', () => {
    expect(labScenarioTitle(undefined, 'x')).toBeNull();
    expect(labScenarioTitle(null, 'x')).toBeNull();
    expect(labScenarioTitle('string', 'x')).toBeNull();
    expect(labScenarioTitle({ x: 'texto' }, 'x')).toBeNull();
    expect(labScenarioTitle({ x: { title: 42 } }, 'x')).toBeNull();
    expect(labScenarioTitle({ x: {} }, 'nao-existe')).toBeNull();
  });
});
