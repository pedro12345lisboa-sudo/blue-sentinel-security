import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  API_BASE,
  ApiError,
  submitContact,
  useGitHubStats,
  useHealth,
  useProject,
  useProjects,
  useSystemStatus,
  useWriteup,
  useWriteups,
} from '@/services/api';

type FetchInit = RequestInit & { method?: string };

function mockFetch(impl: (url: string, init?: FetchInit) => Promise<unknown> | unknown) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: FetchInit) => impl(String(input), init));
  vi.stubGlobal('fetch', spy);
  return spy;
}

const contact = {
  name: 'Playwright',
  email: 'playwright@example.com',
  subject: 'general',
  message: 'Mensagem de teste enviada pelo Playwright e2e.',
};

describe('submitContact', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs JSON to the contact endpoint and returns the payload', async () => {
    const spy = mockFetch(() => ({ ok: true, status: 202, json: async () => ({ success: true, message: 'ok' }) }));

    await expect(submitContact(contact)).resolves.toEqual({ success: true, message: 'ok' });

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(`${API_BASE}/api/v1/contact`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual(contact);
  });

  it('throws ApiError with the code from a problem+json body', async () => {
    mockFetch(() => ({ ok: false, status: 429, json: async () => ({ code: 'RATE_LIMIT' }) }));

    const error = await submitContact(contact).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ name: 'ApiError', code: 'RATE_LIMIT', status: 429 });
    expect((error as Error).message).toBe('RATE_LIMIT');
  });

  it('reads nested error.code from the envelope', async () => {
    mockFetch(() => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'FORBIDDEN' } }),
    }));

    await expect(submitContact(contact)).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('falls back to the status mapping when the body is not JSON', async () => {
    mockFetch(() => ({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('não é JSON');
      },
    }));

    await expect(submitContact(contact)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
    });
  });

  it('falls back to UNKNOWN for unmapped statuses', async () => {
    mockFetch(() => ({ ok: false, status: 418, json: async () => ({}) }));

    await expect(submitContact(contact)).rejects.toMatchObject({ code: 'UNKNOWN', status: 418 });
  });
});

describe('hooks de dados', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('useHealth expõe o fallback enquanto não há resposta', () => {
    mockFetch(() => ({ ok: true, status: 200, json: async () => ({ status: 'ready' }) }));

    const { result } = renderHook(() => useHealth());
    expect(result.current.data).toEqual({ status: 'not_ready' });
  });

  it('demais hooks entregam uma resposta SWR', () => {
    mockFetch(() => ({ ok: true, status: 200, json: async () => ({}) }));

    const results = [
      renderHook(() => useGitHubStats()),
      renderHook(() => useSystemStatus()),
      renderHook(() => useProjects()),
      renderHook(() => useProject('blue-sentinel')),
      renderHook(() => useWriteups()),
      renderHook(() => useWriteup('sigma-rules-101')),
    ];

    for (const { result } of results) {
      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('isLoading');
    }
  });
});
