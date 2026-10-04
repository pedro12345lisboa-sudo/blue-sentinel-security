import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { readMdx, resolveContentPath } from './content';
import { defaultLocale, type Locale } from '@/i18n';

/** Severidade do incidente (mesmos níveis do modelo de severidade do SOC). */
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Tipo de incidente coberto por um playbook (usado no filtro da listagem). */
export type IncidentType =
  | 'credentials'
  | 'phishing'
  | 'malware'
  | 'ransomware'
  | 'privileged-account'
  | 'exfiltration';

/** Fases do ciclo de resposta do NIST SP 800-61. */
export type PhaseKey = 'containment' | 'eradication' | 'recovery';

/** Aponta para um arquivo da biblioteca de regras (`rules/`). */
export interface RuleRef {
  id: string;
  path: string;
}

export interface ChecklistSection {
  title?: string;
  items: string[];
}

export interface PhaseSummary {
  key: PhaseKey;
  summary: string;
}

export interface CommsRow {
  when: string;
  who: string;
}

export interface PlaybookFrontmatter {
  title: string;
  description: string;
  severity: IncidentSeverity;
  type: IncidentType;
  order: number;
  trigger: { description: string; rules: RuleRef[] };
  dataSources: string[];
  triage: string[];
  decisionTree: string;
  phases: PhaseSummary[];
  checklist: ChecklistSection[];
  evidence: string[];
  comms: CommsRow[];
  metrics: { mttd: string; mttr: string };
  lessons: string[];
  labScenario?: string;
  references: string[];
  updated?: string;
  slug: string;
}

export interface HuntingFrontmatter {
  title: string;
  description: string;
  severity: IncidentSeverity;
  order: number;
  hypothesis: string;
  technique: string;
  techniqueName: string;
  dataSource: string;
  query: string;
  normal: string;
  escalation: string;
  sigma: string;
  labScenario?: string;
  references: string[];
  updated?: string;
  slug: string;
}

export interface ContentDocument<T> {
  frontmatter: T;
  content: string;
  untranslated: boolean;
}

function readCollection<T extends { slug: string; order?: number }>(
  locale: Locale,
  dirName: string
): Array<T & { slug: string }> {
  const { dir } = resolveContentPath(locale, dirName);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((fileName) => fileName.endsWith('.mdx'))
    .map((fileName) => {
      const fullPath = path.join(dir, fileName);
      const { data } = matter(fs.readFileSync(fullPath, 'utf8'));
      return { ...(data as T), slug: fileName.replace(/\.mdx$/, '') };
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function readDocument<T>(
  locale: Locale,
  dirName: string,
  slug: string
): ContentDocument<T> | null {
  const doc = readMdx<T & { slug: string }>(locale, dirName, `${slug}.mdx`);
  if (!doc) return null;
  return { ...doc, frontmatter: { ...doc.frontmatter, slug } };
}

export function getAllPlaybooks(locale: Locale = defaultLocale): PlaybookFrontmatter[] {
  return readCollection<PlaybookFrontmatter>(locale, 'playbooks');
}

export function getPlaybookBySlug(
  locale: Locale,
  slug: string
): ContentDocument<PlaybookFrontmatter> | null {
  return readDocument<PlaybookFrontmatter>(locale, 'playbooks', slug);
}

export function getAllHypotheses(locale: Locale = defaultLocale): HuntingFrontmatter[] {
  return readCollection<HuntingFrontmatter>(locale, 'hunting');
}

export function getHypothesisBySlug(
  locale: Locale,
  slug: string
): ContentDocument<HuntingFrontmatter> | null {
  return readDocument<HuntingFrontmatter>(locale, 'hunting', slug);
}

/** URL absoluta de um arquivo da biblioteca de regras no GitHub. */
export function ruleFileUrl(repository: string, rulePath: string): string {
  const base = repository.replace(/\/$/, '');
  return `${base}/blob/main/${rulePath.replace(/^\//, '')}`;
}

/**
 * Título de um cenário do laboratório (`site.pages.lab.scenarios`).
 * O objeto mistura chaves de metadados com os ids dos cenários, por isso o
 * checagem de tipo antes de ler.
 */
export function labScenarioTitle(scenarios: unknown, id: string): string | null {
  if (!scenarios || typeof scenarios !== 'object') return null;
  const entry = (scenarios as Record<string, unknown>)[id];
  if (!entry || typeof entry !== 'object') return null;
  const title = (entry as { title?: unknown }).title;
  return typeof title === 'string' ? title : null;
}
