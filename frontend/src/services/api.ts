import useSWR from 'swr';
import type { ProjectFrontmatter } from '@/lib/projects';
import type { WriteupFrontmatter } from '@/lib/writeups';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// O FastAPI devolve `detail` como texto (erros normais) ou lista (erros 422 de validação).
async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch {
    // resposta sem JSON: usa a mensagem padrão
  }
  return fallback;
}

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `HTTP ${response.status}`));
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
    throw new Error(await readErrorMessage(response, 'Failed to send message'));
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

// Lab
export interface LabEvent {
  id: number;
  type: 'process' | 'network' | 'file' | 'registry' | 'dns';
  name: string;
  detail: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  mitre: string;
  timestamp: number;
  alert: boolean;
}

export interface DetectionRule {
  id: number;
  name: string;
  mitre: string;
  status: 'active' | 'inactive';
  matches: number;
}

export interface LabStats {
  total: number;
  alerts: number;
  critical: number;
  high: number;
}

export function useLabEvents() {
  // A conexão WebSocket é feita dentro do componente do laboratório.
  return null;
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