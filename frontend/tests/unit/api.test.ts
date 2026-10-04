import { describe, expect, it } from 'vitest';

import {
  ApiError,
  extractErrorCode,
  statusCodeToErrorCode,
  translateApiError,
} from '@/services/api';

describe('extractErrorCode', () => {
  it('reads code from problem+json body', () => {
    expect(extractErrorCode({ code: 'RATE_LIMIT' })).toBe('RATE_LIMIT');
  });

  it('reads error string from envelope body', () => {
    expect(extractErrorCode({ error: 'NOT_FOUND' })).toBe('NOT_FOUND');
  });

  it('reads nested error.code', () => {
    expect(extractErrorCode({ error: { code: 'FORBIDDEN' } })).toBe('FORBIDDEN');
  });

  it('returns empty string for non-record bodies', () => {
    expect(extractErrorCode(null)).toBe('');
    expect(extractErrorCode('text')).toBe('');
    expect(extractErrorCode(42)).toBe('');
    expect(extractErrorCode({})).toBe('');
  });
});

describe('statusCodeToErrorCode', () => {
  it('maps known statuses', () => {
    expect(statusCodeToErrorCode(400)).toBe('VALIDATION_ERROR');
    expect(statusCodeToErrorCode(401)).toBe('UNAUTHORIZED');
    expect(statusCodeToErrorCode(403)).toBe('FORBIDDEN');
    expect(statusCodeToErrorCode(404)).toBe('NOT_FOUND');
    expect(statusCodeToErrorCode(422)).toBe('VALIDATION_ERROR');
    expect(statusCodeToErrorCode(429)).toBe('RATE_LIMIT');
    expect(statusCodeToErrorCode(500)).toBe('INTERNAL_ERROR');
    expect(statusCodeToErrorCode(503)).toBe('SERVICE_UNAVAILABLE');
  });

  it('falls back to UNKNOWN for unmapped statuses', () => {
    expect(statusCodeToErrorCode(418)).toBe('UNKNOWN');
  });
});

describe('translateApiError', () => {
  const site = {
    errors: {
      RATE_LIMIT: 'Limite atingido.',
      UNKNOWN: 'Erro desconhecido.',
      NETWORK: 'Falha de rede.',
    },
  };

  it('translates ApiError codes', () => {
    expect(translateApiError(new ApiError('RATE_LIMIT', 429), site)).toBe('Limite atingido.');
  });

  it('falls back to UNKNOWN for unmapped codes', () => {
    expect(translateApiError(new ApiError('SOMETHING_NEW', 500), site)).toBe('Erro desconhecido.');
  });

  it('translates TypeError (network failure)', () => {
    expect(translateApiError(new TypeError('Failed to fetch'), site)).toBe('Falha de rede.');
  });

  it('falls back to UNKNOWN for anything else', () => {
    expect(translateApiError('boom', site)).toBe('Erro desconhecido.');
  });
});
