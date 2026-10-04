#!/usr/bin/env node
/**
 * check_i18n.mjs — guard de consistência de i18n (pt-BR / en).
 *
 * Verifica:
 *   1. Paridade de chaves entre os arquivos de mensagens (recursivo, incluindo
 *      elementos de array e tipos de valor).
 *   2. Texto hardcoded em componentes React (nós JSX e atributos legíveis por
 *      usuário) que pareça português — todo texto de UI deve vir das mensagens.
 *
 * Uso:
 *   node scripts/development/check_i18n.mjs
 *
 * Variáveis de ambiente (usadas também pelos testes com fixtures):
 *   I18N_MESSAGES_DIR  diretório das mensagens (padrão: frontend/messages)
 *   I18N_MESSAGES_A    nome do arquivo da língua base (padrão: pt-BR.json)
 *   I18N_MESSAGES_B    nome do arquivo da língua alvo (padrão: en.json)
 *   I18N_SCAN_DIR      diretório de componentes a varrer (padrão: frontend/src/components)
 *   I18N_SCAN          "0" desabilita a varredura de texto hardcoded
 *
 * Saída: imprime os problemas encontrados; exit code 1 se houver, 0 caso contrário.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const MESSAGES_DIR = process.env.I18N_MESSAGES_DIR ?? path.join(repoRoot, 'frontend', 'messages');
const FILE_A = process.env.I18N_MESSAGES_A ?? 'pt-BR.json';
const FILE_B = process.env.I18N_MESSAGES_B ?? 'en.json';
const SCAN_DIR = process.env.I18N_SCAN_DIR ?? path.join(repoRoot, 'frontend', 'src', 'components');
const SCAN_ENABLED = process.env.I18N_SCAN !== '0';

const problems = [];

function loadJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    problems.push(`não foi possível ler ${file}: ${error.message}`);
    return null;
  }
}

function childPath(at, key) {
  return at ? `${at}.${key}` : key;
}

function indexPath(at, index) {
  return at ? `${at}[${index}]` : `[${index}]`;
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Paridade recursiva: chaves, tamanhos de array e tipos de valor. */
function compareNodes(a, b, at, source) {
  const ta = typeOf(a);
  const tb = typeOf(b);

  if (ta !== tb) {
    problems.push(`[${source}] tipo divergente em "${at}": ${FILE_A}=${ta}, ${FILE_B}=${tb}`);
    return;
  }

  if (ta === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    for (const key of keysA) {
      if (!(key in b)) problems.push(`[${source}] chave ausente em ${FILE_B}: "${childPath(at, key)}"`);
    }
    for (const key of keysB) {
      if (!(key in a)) problems.push(`[${source}] chave ausente em ${FILE_A}: "${childPath(at, key)}"`);
    }
    for (const key of keysA) {
      if (key in b) compareNodes(a[key], b[key], childPath(at, key), source);
    }
    return;
  }

  if (ta === 'array') {
    if (a.length !== b.length) {
      problems.push(
        `[${source}] tamanho de array divergente em "${at}": ${FILE_A}=${a.length}, ${FILE_B}=${b.length}`
      );
    }
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      compareNodes(a[i], b[i], indexPath(at, i), source);
    }
    return;
  }

  if (ta === 'string' && a.trim() === b.trim() && a !== b) {
    problems.push(`[${source}] valor não traduzido (apenas espaços diferem) em "${at}"`);
  }
}

function checkMessages() {
  const fileA = path.join(MESSAGES_DIR, FILE_A);
  const fileB = path.join(MESSAGES_DIR, FILE_B);
  const a = loadJson(fileA);
  const b = loadJson(fileB);
  if (!a || !b) return;
  compareNodes(a, b, '', 'mensagens');
}

// --- Varredura de texto hardcoded -------------------------------------------

const PT_ACCENTS = /[áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇüÜ]/;
const PT_WORDS =
  /\b(ção|ções|não|você|voce|mais|também|tambem|muito|quando|porque|através|atraves|disponível|disponivel|necessário|necessario|mensagem|mensagens|projeto|projetos|artigo|artigos|fale|sobre|enviar|carregando|carregue|voltar|início|inicio|buscar|pesquisar|tente|novamente|permissão|permissao|acesso|encontrado|encontrada|correção|correcao|campos|verifique|tentar|sucesso|falha|erro|erros)\b/i;

/** Trecho de texto legível por usuário em JSX: nós de texto e atributos comuns. */
function findHardcodedText(source, file) {
  const found = [];

  // Nós de texto JSX: '>' ... '<' (sem tags no meio)
  for (const match of source.matchAll(/>([^<>{}]+)</g)) {
    const text = match[1].trim();
    if (text && (PT_ACCENTS.test(text) || PT_WORDS.test(text))) {
      found.push({ text, line: lineOf(source, match.index + 1) });
    }
  }

  // Atributos legíveis por usuário: placeholder, title, aria-label, alt, label
  for (const match of source.matchAll(
    /\b(placeholder|title|aria-label|alt|label)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  )) {
    const text = (match[2] ?? match[3] ?? '').trim();
    if (text && (PT_ACCENTS.test(text) || PT_WORDS.test(text))) {
      found.push({ text: `${match[1]}="${text}"`, line: lineOf(source, match.index) });
    }
  }

  for (const { text, line } of found) {
    problems.push(`[componentes] texto hardcoded pt-BR em ${file}:${line}: "${text.trim()}"`);
  }
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function checkComponents() {
  if (!SCAN_ENABLED) return;
  if (!existsSync(SCAN_DIR)) return;
  for (const file of walk(SCAN_DIR)) {
    findHardcodedText(readFileSync(file, 'utf8'), path.relative(repoRoot, file));
  }
}

checkMessages();
checkComponents();

if (problems.length > 0) {
  console.error(`check_i18n: ${problems.length} problema(s) encontrado(s):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log(
    `check_i18n: OK (${path.relative(repoRoot, MESSAGES_DIR)}/${FILE_A} vs ${FILE_B}${
      SCAN_ENABLED ? `, componentes em ${path.relative(repoRoot, SCAN_DIR)}` : ', varredura de componentes desabilitada'
    })`
  );
}
