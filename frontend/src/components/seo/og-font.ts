import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Fonte Noto Sans (OFL) usada nas imagens Open Graph.
 *
 * O `ImageResponse` carrega uma fonte padrão via `file://` interno, o que
 * quebra no Windows (`ERR_INVALID_URL`) e é indesejável em produção. Ler o
 * arquivo de `public/fonts/` funciona em `next dev`, `next start` e no
 * container (o Dockerfile copia `public/` para `/app/public`).
 */
let cached: Buffer | null = null;

export function ogFont(): Buffer {
  if (!cached) {
    cached = readFileSync(join(process.cwd(), 'public/fonts/noto-sans-regular.ttf'));
  }
  return cached;
}

/** Opções `fonts` do `ImageResponse` (regular + bold com o mesmo arquivo). */
export function ogFonts() {
  const data = ogFont();
  return [
    { name: 'Noto Sans', data, weight: 400 as const, style: 'normal' as const },
    { name: 'Noto Sans', data, weight: 700 as const, style: 'normal' as const },
  ];
}
