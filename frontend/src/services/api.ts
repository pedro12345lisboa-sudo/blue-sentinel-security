import useSWR from 'swr';
import type { ProjectFrontmatter } from '@/lib/projects';
import type { WriteupFrontmatter } from '@/lib/writeups';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Erros da API chegam como CÓDIGO (`error.code` / `code` / `error`), nunca
 * como texto pronto em português — a tradução acontece no frontend via
 * `site.errors[code]` (`translateApiError`).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Extrai o código de erro de problem+json / envelope do backend. */
export function extractErrorCode(body: unknown): string {
  if (!isRecord(body)) return '';
  const { error, code } = body;
  if (isRecord(error) && typeof error.code === 'string') return error.code;
  if (typeof error === 'string' && error) return error;
  if (typeof code === 'string' && code) return code;
  return '';
}

/** Mapeia status HTTP para código quando a resposta não traz `code`. */
const STATUS_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  408: 'TIMEOUT',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMIT',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

/** Código padrão para um status HTTP (sem `code` no corpo). */
export function statusCodeToErrorCode(status: number): string {
  return STATUS_CODES[status] || 'UNKNOWN';
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = '';
  try {
    code = extractErrorCode(await response.json());
  } catch {
    // resposta sem JSON: cai para o mapeamento de status
  }
  const resolved = code || statusCodeToErrorCode(response.status);
  return new ApiError(resolved, response.status);
}

/** Mensagem localizada para um erro da API (chave `errors.<CODE>`). */
export function translateApiError(error: unknown, site: { errors: Record<string, string> }): string {
  if (error instanceof ApiError) {
    return site.errors[error.code] ?? site.errors.UNKNOWN;
  }
  if (error instanceof TypeError) {
    return site.errors.NETWORK ?? site.errors.UNKNOWN;
  }
  return site.errors.UNKNOWN;
}

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json();
}

// Contact
export interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface ContactResponse {
  success: boolean;
  message: string;
}

export async function submitContact(data: ContactFormData): Promise<ContactResponse> {
  const response = await fetch(`${API_BASE}/api/v1/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json();
}

// Health
export interface HealthCheck {
  status: 'alive' | 'ready' | 'not_ready';
  checks?: Record<string, string>;
}

export function useHealth() {
  return useSWR<HealthCheck>('/api/v1/health/ready', fetcher, {
    refreshInterval: 30000,
    fallbackData: { status: 'not_ready' },
  });
}

// GitHub Stats
export interface GitHubStats {
  repos: number;
  stars: number;
  forks: number;
  commits: number;
  languages: Record<string, number>;
  topRepos: Array<{
    name: string;
    stars: number;
    description: string | null;
    url: string;
  }>;
  lastUpdated: string;
}

export function useGitHubStats() {
  return useSWR<GitHubStats>('/api/v1/github/stats', fetcher, {
    refreshInterval: 3600000, // 1 hora
    dedupingInterval: 300000, // 5 min
  });
}

// Status
export interface SystemMetrics {
  cpu: number;
  memory: { used: number; total: number; percentage: number };
  disk: { used: number; total: number; percentage: number };
  network: { rx: number; tx: number };
  uptime: number;
  timestamp: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    postgres: 'healthy' | 'unhealthy';
    redis: 'healthy' | 'unhealthy';
  };
  latency: {
    postgres: number;
    redis: number;
  };
}

export interface ApiEndpointHealth {
  path: string;
  status: 'healthy' | 'unhealthy';
  latency: string;
  errors: string;
  rpm: string;
}

export interface SystemStatus {
  metrics: SystemMetrics;
  health: HealthStatus;
  endpoints: ApiEndpointHealth[];
  version: {
    frontend: string;
    backend: string;
    buildDate: string;
    node: string;
    python: string;
    dockerCompose: string;
  };
}

export function useSystemStatus() {
  return useSWR<SystemStatus>('/api/v1/status', fetcher, {
    refreshInterval: 10000,
    dedupingInterval: 5000,
  });
}

// Projects
export function useProjects() {
  return useSWR<ProjectFrontmatter[]>('/api/v1/projects', fetcher);
}

export function useProject(slug: string) {
  return useSWR<ProjectFrontmatter>(`/api/v1/projects/${slug}`, fetcher);
}

// Writeups
export function useWriteups() {
  return useSWR<WriteupFrontmatter[]>('/api/v1/writeups', fetcher);
}

export function useWriteup(slug: string) {
  return useSWR<WriteupFrontmatter>(`/api/v1/writeups/${slug}`, fetcher);
}