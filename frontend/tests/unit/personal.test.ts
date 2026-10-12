import { describe, expect, it } from 'vitest';

import { applyPersonalOverrides, personalOverrides } from '@/lib/personal';

const site = {
  contacts: {
    general: 'contact@blue-sentinel.local',
    security: 'security@blue-sentinel.local',
    issues: 'https://github.com/example/repo/issues',
    repository: 'https://github.com/example/repo',
    linkedin: '[URL DO LINKEDIN]',
    github: '[URL DO GITHUB]',
    phone: '[SEU TELEFONE]',
  },
  profile: { name: '[SEU NOME]' },
};

describe('personalOverrides', () => {
  it('returns empty overrides when no env var is set', () => {
    const overrides = personalOverrides();
    expect(overrides.name).toBeUndefined();
    expect(overrides.linkedin).toBeUndefined();
    expect(overrides.repository).toBeUndefined();
  });
});

describe('applyPersonalOverrides', () => {
  it('keeps placeholders when env is unset', () => {
    const result = applyPersonalOverrides(site);
    expect(result.profile.name).toBe('[SEU NOME]');
    expect(result.contacts.linkedin).toBe('[URL DO LINKEDIN]');
  });

  it('does not mutate the input object', () => {
    applyPersonalOverrides(site);
    expect(site.contacts.general).toBe('contact@blue-sentinel.local');
    expect(site.profile.name).toBe('[SEU NOME]');
  });
});
