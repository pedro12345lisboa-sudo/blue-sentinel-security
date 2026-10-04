#!/usr/bin/env node
/**
 * Valida os artigos técnicos de frontend/content/pt/writeups.
 *
 * Checa:
 *  - frontmatter obrigatório (title, description, date, tags para todos;
 *    updated, readingTime, cover e series para os artigos da série)
 *  - faixa de 1200-1800 palavras (série) e seções obrigatórias
 *  - capa OG existente em frontend/public
 *  - links internos resolvem para conteúdo/rota existente
 *  - links do GitHub apontam para arquivos que existem no repositório
 *  - links externos (--external) respondem com status < 400
 *
 * Uso:
 *   node scripts/development/validate_writeups.mjs
 *   node scripts/development/validate_writeups.mjs --external
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const WRITEUPS_DIR = path.join(ROOT, 'frontend', 'content', 'pt', 'writeups');
const PUBLIC_DIR = path.join(ROOT, 'frontend', 'public');
const APP_DIR = path.join(ROOT, 'frontend', 'src', 'app', '[locale]');

const SERIES_PREFIX = 'Blue-Sentinel na prática';
const BASE_KEYS = ['title', 'description', 'date', 'tags'];
const SERIES_KEYS = [...BASE_KEYS, 'updated', 'readingTime', 'cover', 'series'];
const REQUIRED_SECTIONS = [
  'O problema',
  'Decisão',
  'Implementação',
  'Testes',
  'Resultado',
  'Limitações',
  'Próximos passos',
  'Referências',
];
const MIN_WORDS = 1200;
const MAX_WORDS = 1800;
const GITHUB_BLOB =
  /https:\/\/github\.com\/pedro12345lisboa-sudo\/blue-sentinel-security\/blob\/main\/([^)\s#]+)/g;

const checkExternal = process.argv.includes('--external');
const failures = [];
const warnings = [];

const fail = (where, message) => failures.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([A-Za-z_]+):\s*(.+)$/.exec(line);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    let value = rawValue.trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      value = value.replace(/^['"]|['"]$/g, '');
    }
    data[key] = value;
  }
  return data;
}

function bodyWithoutCode(raw) {
  return raw
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

function extractLinks(raw) {
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const links = [];
  for (const match of body.matchAll(/\]\(([^)\s]+)\)/g)) {
    links.push(match[1]);
  }
  for (const match of body.matchAll(GITHUB_BLOB)) {
    links.push(`github:${match[1]}`);
  }
  return [...new Set(links)];
}

function routeExists(internalPath) {
  const clean = internalPath.split('#')[0].split('?')[0];
  if (clean === '/' || clean === '') return true;
  const segments = clean.replace(/^\//, '').split('/');
  const first = segments[0];

  if (first === 'writeups' && segments.length === 2) {
    for (const locale of ['pt', 'en']) {
      const candidate = path.join(ROOT, 'frontend', 'content', locale, 'writeups', `${segments[1]}.mdx`);
      if (fs.existsSync(candidate)) return true;
    }
    return false;
  }
  if (first === 'projects' && segments.length === 2) {
    for (const locale of ['pt', 'en']) {
      const candidate = path.join(ROOT, 'frontend', 'content', locale, 'projects', `${segments[1]}.mdx`);
      if (fs.existsSync(candidate)) return true;
    }
    return false;
  }
  // Rota da aplicação: basta o diretório da rota existir (raiz ou um nível)
  const candidates = segments.length === 1
    ? [path.join(APP_DIR, first)]
    : [path.join(APP_DIR, first, segments[1])];
  if (candidates.some((candidate) => fs.existsSync(candidate))) return true;
  // Conteúdo (ex.: /playbooks/hunting/<slug> vive em content/)
  const contentCandidate = path.join(ROOT, 'frontend', 'content', 'pt', ...segments);
  if (fs.existsSync(`${contentCandidate}.mdx`) || fs.existsSync(contentCandidate)) return true;
  return false;
}

const { compile } = await import(
  pathToFileURL(path.join(ROOT, 'frontend', 'node_modules', '@mdx-js', 'mdx', 'index.js')).href
);

async function compileMdx(raw, where) {
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '');
  try {
    await compile(body, { format: 'mdx', outputFormat: 'program' });
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    fail(where, `MDX não compila (quebra a página em runtime): ${message}`);
  }
}

async function checkExternalUrl(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'blue-sentinel-writeup-validator/1.0' },
    });
    clearTimeout(timer);
    if (response.status >= 400 && response.status !== 405) {
      return `HTTP ${response.status}`;
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function main() {
  const files = fs.readdirSync(WRITEUPS_DIR).filter((name) => name.endsWith('.mdx')).sort();
  if (files.length === 0) {
    fail('writeups', 'nenhum arquivo .mdx encontrado');
  }

  const externalUrls = new Map();
  const seriesParts = new Map();

  let pushedFiles = null;
  try {
    pushedFiles = new Set(
      execFileSync('git', ['ls-tree', '-r', '--name-only', 'origin/main'], {
        cwd: ROOT,
        encoding: 'utf8',
      })
        .split('\n')
        .filter(Boolean)
    );
  } catch {
    // sem origin/main (ex.: clone novo): pulamos o check de push
  }

  for (const name of files) {
    const where = name;
    const raw = fs.readFileSync(path.join(WRITEUPS_DIR, name), 'utf8');
    const frontmatter = parseFrontmatter(raw);

    if (!frontmatter) {
      fail(where, 'frontmatter ausente ou inválido');
      continue;
    }

    await compileMdx(raw, where);

    const isSeries = typeof frontmatter.series === 'string' && frontmatter.series.startsWith(SERIES_PREFIX);
    const requiredKeys = isSeries ? SERIES_KEYS : BASE_KEYS;

    for (const key of requiredKeys) {
      if (frontmatter[key] === undefined || frontmatter[key] === '') {
        fail(where, `frontmatter sem a chave obrigatória "${key}"`);
      }
    }
    if (!isSeries) {
      warn(where, 'fora da série: exige apenas title/description/date/tags');
    }

    if (frontmatter.date && !/^\d{4}-\d{2}-\d{2}$/.test(frontmatter.date)) {
      fail(where, `date inválida: ${frontmatter.date}`);
    }
    if (frontmatter.updated && frontmatter.date && frontmatter.updated < frontmatter.date) {
      fail(where, `updated (${frontmatter.updated}) anterior a date (${frontmatter.date})`);
    }
    if (Array.isArray(frontmatter.tags) && frontmatter.tags.length === 0) {
      fail(where, 'tags vazias');
    }
    if (typeof frontmatter.description === 'string' && frontmatter.description.length > 170) {
      warn(where, `description com ${frontmatter.description.length} caracteres (ideal ≤ 160)`);
    }

    if (isSeries) {
      const words = bodyWithoutCode(raw).split(/\s+/).filter(Boolean).length;
      console.log(`WORDS ${name}: ${words} (readingTime ${frontmatter.readingTime ?? '?'})`);
      const expectedReadingTime = Math.ceil(words / 200);
      if (Number(frontmatter.readingTime) !== expectedReadingTime) {
        fail(where, `readingTime ${frontmatter.readingTime} ≠ ceil(${words}/200) = ${expectedReadingTime}`);
      }
      if (words < MIN_WORDS || words > MAX_WORDS) {
        fail(where, `${words} palavras (fora da faixa ${MIN_WORDS}-${MAX_WORDS})`);
      }

      const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '');
      const headings = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
      for (const section of REQUIRED_SECTIONS) {
        if (!headings.some((heading) => heading.startsWith(section))) {
          fail(where, `seção obrigatória ausente: "## ${section}"`);
        }
      }

      if (!raw.includes('<Mermaid')) {
        fail(where, 'sem diagrama Mermaid');
      }

      const part = /Parte (\d) de 4/.exec(frontmatter.series ?? '');
      if (part) {
        if (seriesParts.has(part[1])) {
          fail(where, `parte ${part[1]} duplicada com ${seriesParts.get(part[1])}`);
        }
        seriesParts.set(part[1], name);
      } else {
        fail(where, `série sem numeração "Parte N de 4": ${frontmatter.series}`);
      }

      if (frontmatter.cover) {
        const coverPath = path.join(PUBLIC_DIR, frontmatter.cover.replace(/^\//, ''));
        if (!fs.existsSync(coverPath)) {
          fail(where, `capa OG inexistente: frontend/public${frontmatter.cover}`);
        }
      }
    }

    for (const link of extractLinks(raw)) {
      if (link.startsWith('github:')) {
        const repoPath = link.slice('github:'.length);
        if (!fs.existsSync(path.join(ROOT, repoPath))) {
          fail(where, `link do GitHub aponta para arquivo inexistente: ${repoPath}`);
        } else if (pushedFiles && !pushedFiles.has(repoPath)) {
          warn(where, `link do GitHub ainda não publicado (push pendente): ${repoPath}`);
        }
      } else if (link.startsWith('http')) {
        if (!externalUrls.has(link)) externalUrls.set(link, where);
      } else if (link.startsWith('/')) {
        if (!routeExists(link)) {
          fail(where, `link interno sem destino: ${link}`);
        }
      }
    }
  }

  for (const [part, name] of [...seriesParts.entries()].sort()) {
    if (!['1', '2', '3', '4'].includes(part)) {
      fail(name, `parte fora do intervalo 1-4: ${part}`);
    }
  }
  if (seriesParts.size > 0 && seriesParts.size !== 4) {
    fail('série', `esperadas 4 partes, encontradas ${seriesParts.size}`);
  }

  for (const [url, where] of externalUrls) {
    if (!checkExternal) continue;
    if (/^https:\/\/github\.com\/pedro12345lisboa-sudo\/blue-sentinel-security\//.test(url)) {
      continue; // links do próprio repositório: validados via git/local, não HTTP
    }
    const problem = await checkExternalUrl(url);
    if (problem) fail(where, `link externo indisponível (${problem}): ${url}`);
  }

  if (!checkExternal && externalUrls.size > 0) {
    warnings.push(
      `geral: ${externalUrls.size} link(s) externo(s) não verificados (use --external)`
    );
  }

  for (const message of warnings) console.log(`WARN  ${message}`);
  for (const message of failures) console.log(`FAIL  ${message}`);

  const seriesCount = [...seriesParts.keys()].length;
  console.log(
    `\nvalidate_writeups: ${files.length} artigo(s), ${seriesParts.size}/4 partes da série, ` +
      `${failures.length} falha(s), ${warnings.length} aviso(s)`
  );
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('validate_writeups: erro inesperado', error);
  process.exit(1);
});
