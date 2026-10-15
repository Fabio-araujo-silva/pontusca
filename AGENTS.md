# AGENTS.md — guia pra agentes de IA no PONTUSCA

Leia isto antes de editar. Uso humano está em `COMO-USAR.md`; visão geral em `README.md`.

## O que é

Placar ao vivo de jogos universitários (TUSCA, InterUSP). Três frentes: **público** (sem login, `/`), **mesa** (mesário registra o jogo, `/mesa`), **bastidores** (admin escondido, `/bastidores`, configurável por `VITE_ADMIN_PATH`). O nome do produto é **PONTUSCA**; pastas e pacotes ainda se chamam `arquibancada` — não renomeie sem pedido explícito.

## Stack e layout

```
arquibancada/                 npm workspaces (api, web)
  api/  NestJS 10 + Prisma 6 + SQLite (WAL) + Socket.IO
    prisma/schema.prisma
    src/shared/               ← compartilhado com o web (alias @shared). TS PURO: nada de Nest/Prisma/Node.
      types.ts                DTOs, SportConfig, MatchSummary/Detail, comandos
      sports-catalog.ts       42 modalidades padrão (seed + "restaurar catálogo")
      engine/                 motores de placar: score, sets, tennis, baseball, ranking (+ engine.spec.ts)
    src/live/                 LiveService (fila por jogo, cache, publish), gateway WS, MesaController
    src/public/               feed público em memória (FeedService) + rotas públicas
    src/standings/            classificação geral e tabelas por modalidade
    src/admin/                CRUDs do painel
    src/sandbox/              gerador + simulador
    src/seed/seed.ts          seed idempotente
  web/  React 18 + Vite 5 + Tailwind 3 + framer-motion + TanStack Query
    src/lib/                  api, socket, data (feed ao vivo), feed.ts (regras do feed, testadas), profile.ts (localStorage)
    src/components/match/     MatchCard, MatchDetailPanel, ShareSheet (print), Celebration (tela cheia)
    src/components/ui/        primitives, TeamFlag, SportIcon, Logo, Ticker, Chip
    src/pages/public|mesa|admin
```

## Comandos

```bash
npm run setup        # install + prisma db push + seed (primeira vez)
npm run dev          # api (nest --watch, :3000) + web (vite --host, :5173)
npm test             # jest (motor, api) + vitest (regras do feed, web)
npm run typecheck    # tsc nos dois
npm run build        # build de produção (web/dist servido pelo Nest)
```

Rode `npm test` e `npm run typecheck` antes de considerar algo pronto. Mudou regra do motor ou do feed → adicione caso de teste.

## Invariantes (não quebre)

1. **Placar = reduce(eventos).** Nunca grave placar "na mão". Todo lance vira `MatchEvent` (via `LiveService.command` → `buildEvent` valida → `runEngine` recalcula). Desfazer = `voided: true`. Resultado manual do admin é `Match.manualResult` (sobrepõe o motor).
2. **`api/src/shared` roda nos dois lados.** O console do mesário usa o mesmo motor pra atualização otimista. Não importe nada de Node/Nest/Prisma ali.
3. **Idempotência.** Comandos têm `clientId`; retry do mesário offline não pode duplicar. A atribuição de autor ("marca agora, autor depois") é `PATCH /api/mesa/matches/:id/events/:eventId` e também passa pela fila offline (`web/src/pages/mesa/useConsole.ts`).
4. **Um processo só.** Cache ao vivo e barramento (`LiveBus`) são em memória e o banco é SQLite: deploy com **uma** instância. Escalar = trocar pra Postgres (schema já evita enums/Json nativos) + adapter Redis do Socket.IO.
5. **Público só vê o torneio do momento** (`Tournament.isCurrent`, um por ambiente real/sandbox). Sandbox (`isSandbox`) nunca aparece no público sem `?sandbox=1`.
6. **Jogos com `#manual` nas observações** são ignorados pelo simulador do sandbox (roteiros controlados). O marcador é escondido na UI.

## Como estender

- **Nova modalidade usando motor existente:** só config — adicione em `sports-catalog.ts` (ou pelo admin). Botões = `actions` (`kind`: score/card/sub/foul/timeout/stat; flags `against`, `both`, `decisive`, `penalty`, `athlete`).
- **Novo motor:** crie `engine/<nome>.ts` com `reduceX(input) → EngineOutput` e `buildX(input, out, cmd) → DraftEvent`, registre em `engine/index.ts`, adicione o tipo em `EngineKind`, painel em `web/src/pages/mesa/`, validação no `ConfigSchema` (`admin/catalog.controller.ts`) e testes em `engine.spec.ts`.
- **Estatísticas:** `ActionStats.rows(config, extra, skip)` em `engine/common.ts`. A primeira linha do SCORE é o total real do placar; pênaltis têm linhas próprias.
- **Tempo real:** publique via `LiveBus` (`summary`, `feed`, `standings`, `catalog`, `staff`); o gateway repassa. No web, `useLiveSync` remenda o cache do react-query.

## Front: convenções

- Textos de UI em **português**, identificadores em inglês, comentários curtos em PT.
- **Cores são variáveis CSS** (`web/src/index.css`). No Tailwind, `white` = cor do TEXTO e `black` = cor do FUNDO (semânticos, seguem o tema claro). Pra branco/preto literais (texto sobre cor de atlética, botão vermelho) use `snow`/`coal`. Paleta TUSCA em `pop.*`.
- Fontes: `font-sans` = Funnel Display; `font-display`/`font-poster` = Big Shoulders Display (títulos e placar, geralmente `uppercase`).
- Animações: transições tween com ease-out (`[0.16, 1, 0.3, 1]`). **Evite springs com damping baixo** — davam "pisca/quique" na comemoração.
- Regras do feed (dia inicial, jogo do momento, botão do ao vivo) ficam em `web/src/lib/feed.ts` como funções puras com teste em `feed.test.ts`.

## Armadilhas conhecidas (Windows)

- **`localhost` resolve pra IPv6 primeiro.** Servidor escutando só em `0.0.0.0` custa ~200–900 ms por requisição. O Nest escuta sem host (dual-stack); o Vite sobe com `--host` (sem valor) e o proxy aponta pra `127.0.0.1:3000`. Não troque isso.
- **Mudou `tailwind.config.js`?** Reinicie o Vite (o cache não pega a config nova).
- **Mudou `schema.prisma`?** Pare a API antes do `prisma db push`/`generate` (o engine do Prisma fica travado pelo processo no Windows). Depois rode `npm run dev` de novo.
- `DATABASE_URL` usa `?connection_limit=1` pra os PRAGMAs (WAL, synchronous) valerem.
- Heredocs grandes no Git Bash às vezes quebram com aspas: prefira escrever scripts em arquivo.

## Registro (logs): comece por aqui quando o usuário disser "deu erro"

Tudo vai pra `api/logs/app-AAAA-MM-DD.jsonl` (JSON Lines, dia de Brasília, 14 dias, fora do git). Leia com:

```bash
npm run logs                      # últimas 24 h, avisos e erros (api + navegador)
npm run logs -- --summary         # agrupado: o que mais quebra, com um --req de exemplo
npm run logs -- --req <id>        # uma requisição de ponta a ponta (o id aparece na mensagem de erro 500 e no header x-request-id)
npm run logs -- --match <id>      # tudo de um jogo: lances (live.command), desfazer, escala, erros
npm run logs -- --user Maria --since 2h --level info
npm run logs -- --ev web. --since 30m   # só erros vindos dos navegadores (mesário no celular etc.)
npm run logs -- --follow          # ao vivo
```

- **Servidor** (`api/src/common/log.ts`, `http-log.ts`): toda escrita HTTP (com corpo, sem senha/token/imagens), todo 4xx/5xx, requisição lenta (>800 ms), erro 500 com stack, login (ok/falha), cada lance (`live.command`: jogo, seq, tipo, ação, placar, fase), desfazer, autor atribuído, escala de mesário (`staff.*`), erros de processo.
- **Navegador** (`web/src/lib/log.ts`): erros JS, tela que quebrou (ErrorBoundary), falha de API (mesmo `req` do servidor), rede caindo, fila do mesário (`web.mesa.rejected`/`retry`), quedas do socket. Guarda no aparelho sem rede e envia depois. O site público só manda avisos/erros.
- Pra registrar algo novo: `log.info('area.acao', { ... })` no servidor, `report('warn', 'area.acao', { msg, data })` no web. Nomes `area.acao`, dados pequenos.

## Repositório

- Monorepo pessoal (`claudinho/`). Commits **direto na `main`**, mensagens no estilo `feat(pontusca): ...` em português, sem branches.
- Nunca commitar `*.db`, `.env`, `node_modules`, `dist` (já no `.gitignore`).
- Credenciais de dev (seed): admin `admin@arquibancada.app` / `arquibancada123`; mesário `mesario@arquibancada.app` / `mesario123`. Em produção vêm de `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

## Verificação ponta a ponta

- API: `curl 127.0.0.1:3000/api/public/time`.
- Sandbox: `POST /api/admin/sandbox/generate {"matches":60,"live":7,"finished":34,"fullDay":true,"allTeams":true}` e `POST /api/admin/sandbox/start {"speed":1}` (token de admin).
- Público em modo sandbox: `http://localhost:5173/?sandbox=1`.
- Carga: 1000 sockets no feed medidos com p99 ~114 ms (script de referência no histórico; refaça se mexer no gateway).
