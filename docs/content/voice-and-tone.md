# Voz e tom — Blue-Sentinel

Guia de escrita do portfólio. Serve para o `frontend/content/site.ts`, os `.mdx` em `frontend/content/pt/` e qualquer texto novo de interface. A versão em inglês deve seguir as mesmas regras, com um arquivo `docs/content/voice-and-tone-en.md`.

## Para quem escrevemos

Duas pessoas leem o mesmo texto: o recrutador que tem 30 segundos e o engenheiro que vai abrir o código. O texto precisa sobreviver ao primeiro e merecer o segundo.

- Recrutador: precisa entender o que é, o que está pronto e o que a pessoa faz em uma passada de olho.
- Engenheiro: abre o repositório e confere se a afirmação existe no código. Se não existe, o texto perde credibilidade.

## Princípios

1. **Frases curtas, voz ativa.** "O formulário descarta o envio do robô", não "o envio é descartado pelo formulário quando detectado um comportamento automatizado".
2. **Primeira pessoa.** É portfólio pessoal: "construí", "escolhi", "ainda não medi". Sem "nós" corporativo.
3. **Afirmação verificável.** Toda frase técnica precisa existir no repositório. Se o código não mostra, o texto não afirma. Use `[MÉTRICA MEDIDA]` em vez de número estimado.
4. **Sem clichê.** Proibidos: "apaixonado por tecnologia", "sempre em busca de desafios", "gamer de plantão", "salvando o mundo", "mindset de crescimento".
5. **Jargão só quando é nome padrão.** Mantenha em inglês: threat hunting, rate limiting, honeypot, Sigma rules, detection engineering, alert tuning, MITRE ATT&CK. Traduza o resto: "fluxo de eventos", "regra de detecção", "mensagem enviada".
6. **Estado real, não estado desejado.** Medida parcial se marca `Parcial`. Módulo vazio se marca `em construção`. fingir "implementado" custa mais caro que admitir "planejado".

## Tom

- Direto e técnico, sem ser seco.
- Confiança vem de detalhe concreto (arquivo, endpoint, limite numérico), não de adjetivo.
- Humor leve possível em microcopy; nunca em aviso de segurança ou erro.
- Em erro: diga o que falhou e o próximo passo. Sem "ops", sem culpabilizar o usuário.

## Placeholders

Marcador padrão entre colchetes, em caixa alta com underscores quando precisar de múltiplas palavras:

| Marcador | Uso |
|----------|-----|
| `[SEU NOME]` | nome do autor |
| `[SEU CARGO]` | cargo ou título profissional |
| `[SEU EMAIL]`, `[SEU TELEFONE]`, `[URL DO GITHUB]`, `[URL DO LINKEDIN]` | contato |
| `[MÉTRICA MEDIDA]` | qualquer número que você ainda não mediu |
| `[ANOS DE ESTUDO]` | tempo de estudo/prática |
| `[CERTIFICAÇÃO]`, `[EMISSOR]`, `[ANO]` | certificações |
| `[CARGO]`, `[EMPRESA]`, `[INSTITUIÇÃO]` | trajetória |
| `[ESCOLHA: ...]` | decisão pendente do autor |
| `[PRAZO DE RESPOSTA]`, `[PRAZO]` | compromissos de prazo |
| `[TEMA]` | tópico de estudo em andamento |

Regra: placeholder nunca vira frase incompleta na interface. Quando o texto depende inteiramente do placeholder, escreva a frase de forma que o placeholder seja o único trecho a trocar.

## Estrutura de texto

- Título de seção: 2 a 4 palavras, substantivo ou proposta ("Competências técnicas", "Projetos em destaque").
- Subtítulo de seção: uma frase, explica o que a seção entrega.
- Hero: título é a proposta de valor; subtítulo explica como ela se materializa. Nada de hierarquia de três linhas.
- Case study: seções sempre nesta ordem — Problema, Contexto, Solução, Arquitetura, Decisões técnicas e por quê, Desafios, Resultados, Aprendizados, Links.
- Botão: verbo no infinitivo ou nome do destino ("Ver projetos", "Enviar mensagem"). Sem pontuação.
- Erro: o que falhou + o que fazer ("E-mail inválido. Confira o endereço.").
- Estado vazio: o que não há + o próximo passo ("Nenhum artigo publicado ainda.").

## Limites de SEO

- Título de página: até 60 caracteres, começa pelo assunto, termina com `| Blue-Sentinel`.
- Descrição: até 160 caracteres, frase completa, sem clickbait, com a palavra-chave principal no começo.
- Todo texto de SEO vive em `site.ts` → `seo`, um objeto por página.

## Onde vive cada texto

| Texto | Arquivo |
|-------|---------|
| Hero, seções da home, nav, rodapé, microcopy, SEO, avisos | `frontend/content/site.ts` |
| Sobre (narrativa, foco, trajetória, certificações, filosofia) | `frontend/content/pt/about.mdx` |
| Perguntas frequentes | `frontend/content/pt/faq.mdx` |
| Case studies | `frontend/content/pt/projects/*.mdx` |
| Artigos | `frontend/content/pt/writeups/*.mdx` |
| Este guia | `docs/content/voice-and-tone.md` |

Componente não guarda texto. Se um string aparecer dentro de `.tsx`, ele deveria estar em `content/`.

## Checklist antes de publicar

- [ ] Nenhum lorem ipsum.
- [ ] Nenhum número, emprego ou certificação inventado — placeholder no lugar.
- [ ] Toda afirmação técnica confere com arquivo/código do repositório.
- [ ] Toda seção da home e toda página leem o texto de `content/`.
- [ ] Case studies seguem o formato completo.
- [ ] Título ≤ 60 caracteres e descrição ≤ 160.
- [ ] Termos padrão em inglês mantidos; o resto em pt-BR.
- [ ] Erro, estado vazio, loading e 404/500 sem texto fixo no componente.
