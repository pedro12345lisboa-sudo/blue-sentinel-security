# Checklist editorial — artigos técnicos (writeups)

Guia de revisão para qualquer artigo novo em `frontend/content/pt/writeups/`.
Aplicável à série **"Blue-Sentinel na prática"** (partes 1–4) e aos próximos.

## Como validar

```bash
# Frontmatter, palavras, seções, capa, links internos/GitHub (+ links externos via HTTP)
node scripts/development/validate_writeups.mjs
node scripts/development/validate_writeups.mjs --external

# i18n (mensagens pt-BR/en coerentes)
node scripts/development/check_i18n.mjs

# TypeScript, testes e lint do frontend
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node node_modules/eslint/bin/eslint.js "src/**/*.{ts,tsx}" --max-warnings=999

# Build completo (compila MDX, pré-renderiza os artigos, gera JSON-LD)
node node_modules/next/dist/bin/next build

# Testes do backend (os números citados nos artigos)
# workdir=backend
& ".venv\Scripts\python.exe" -m pytest
```

## Por artigo

### Frontmatter obrigatório

- [ ] `title`, `description` (≤ 160 caracteres), `date`, `updated` (≥ `date`), `tags` (não vazio)
- [ ] `readingTime` = `ceil(palavras totais / 200)`
- [ ] `cover` aponta para `frontend/public/images/writeups/<slug>.png` (arquivo existe)
- [ ] `series` no formato `Blue-Sentinel na prática · Parte N de 4` (único entre os 4)

### Estrutura e conteúdo

- [ ] 1200–1800 palavras (contador do validador, sem código)
- [ ] Seções: `O problema` → `Decisão` (com alternativas descartadas) → `Implementação` →
      `Testes` → `Resultado` → `Limitações` → `Próximos passos` → `Referências`
- [ ] Diagrama Mermaid (≥ 1) usando o componente `<Mermaid>`
- [ ] Código citado **existe no repositório** (link `blob/main` bate com o arquivo)
- [ ] Nenhum número inventado: valores medidos citam a fonte (teste/arquivo);
      o que não foi medido usa `[MÉTRICA MEDIDA]` **dentro de um `<Callout type="warning">`**
- [ ] Tabelas de testes batem com a suíte real (contagens conferidas rodando o comando)
- [ ] Referências principais: RFC/OWASP/MITRE/vendor docs com URL viva (ver `--external`)

### Série e navegação

- [ ] Links internos entre as 4 partes (`/writeups/<slug>` do mesmo artigo da série)
- [ ] Links internos para projetos (`/projects/sentinel-agent`) e playbooks (`/playbooks`)
- [ ] Último parágrafo aponta o próximo passo concreto (próximo artigo ou melhoria real)

### Imagem social (OG)

- [ ] PNG gerado por `scripts/build_writeup_covers.py` (Pillow) e revisado visualmente
- [ ] `cover` no frontmatter → `opengraphImage`/`twitter image` via JSON-LD `Article`

### Página (autoconteúdo do site)

- [ ] JSON-LD `Article` com `datePublished`, `dateModified` (`updated`), `wordCount`
- [ ] TOC lateral com âncoras dos `h2`/`h3` (`extractHeadings` + ids do MDX)
- [ ] Linha "Atualizado em …" no card do artigo
- [ ] Lighthouse a11y ≥ 95 na página do artigo

### Validação de links

- [ ] `validate_writeups.mjs --external` → **0 falhas**
- [ ] Warnings "push pendente" do GitHub: **zerados após `git push`** (bloqueia publicação:
      link quebrado no ar)
- [ ] Warnings "fora da série" nos artigos legados são informativos

## Estado atual da série (2026-10-03)

| # | Arquivo | Palavras | readingTime | Capa | Validador | Observação |
|---|---------|----------|-------------|------|-----------|------------|
| 1 | `sql-injection-fastapi.mdx` | 1262 | 7 | ✓ | ✓ | push pendente: 2 links GitHub |
| 2 | `da-hipotese-a-regra-sigma.mdx` | 1333 | 7 | ✓ | ✓ | push pendente: 8 links GitHub |
| 3 | `rate-limiting-redis-janela-deslizante.mdx` | 1237 | 7 | ✓ | ✓ | push pendente: 1 link GitHub |
| 4 | `agente-cpp-coleta-endpoint.mdx` | 1333 | 7 | ✓ | ✓ | push pendente: 5 links GitHub |

- Validações desta sessão (todas verdes):
  `validate_writeups.mjs --external` (0 falhas; inclui compilação MDX de cada artigo),
  `check_i18n.mjs`, `tsc --noEmit`, `vitest run` (48/48),
  eslint (0 erros, 641 warnings pré-existentes), `next build`.
- Lighthouse a11y: **100/100** nas 4 páginas de artigo (Edge headless,
  `--only-categories=accessibility`).
- Backend: 206 testes verdes (`pytest` em `backend/`).
- Bloqueio único de publicação: commits locais ainda não enviados a `origin/main`
  (artigos + código citado). Após o push, rodar `validate_writeups.mjs --external`
  e confirmar **0 falhas e 0 avisos de push pendente**.
