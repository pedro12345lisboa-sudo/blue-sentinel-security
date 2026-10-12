/**
 * Patch de compatibilidade Windows para o `@vercel/og` compilado do Next 14.
 *
 * Bug: `fileURLToPath(join(import.meta.url, '../arquivo'))` quebra no Windows,
 * porque `path.join` num URL vira `.\file:\C:\...` e o `fileURLToPath` lança
 * `TypeError: Invalid URL` — derrubando toda rota que usa `next/og`
 * (`opengraph-image.tsx`).
 *
 * A substituição usa `new URL('./arquivo', import.meta.url)`: `join` tratava o
 * próprio arquivo como diretório, então `../x` junto ao arquivo é o mesmo que
 * `./x` em `new URL` — o arquivo fica ao lado de `index.node.js`.
 *
 * Idempotente, só roda em win32 e não faz nada se o padrão já foi corrigido
 * (próxima versão do Next) ou se o arquivo não existe (Docker/Linux).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(
  root,
  'node_modules',
  'next',
  'dist',
  'compiled',
  '@vercel',
  'og',
  'index.node.js'
);

if (process.platform !== 'win32' || !existsSync(target)) {
  process.exit(0);
}

const source = readFileSync(target, 'utf8');
const broken = /fileURLToPath\(join\(import\.meta\.url, "([^"]+)"\)\)/g;

if (!broken.test(source)) {
  process.exit(0);
}

const patched = source.replace(
  broken,
  (_match, rel) => `fileURLToPath(new URL(${JSON.stringify(`./${rel.replace(/^(\.\.\/)+/, '')}`)}, import.meta.url))`
);
writeFileSync(target, patched, 'utf8');
console.log('[og-windows-patch] next/dist/compiled/@vercel/og corrigido para Windows.');
