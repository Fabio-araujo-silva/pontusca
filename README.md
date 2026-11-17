# PONTUSCA

**Placar ao vivo para jogos de atlética.** Um sistema para contar a pontuação de competições universitárias (TUSCA, InterUSP e afins) em tempo real, com **vários mesários logados ao mesmo tempo**, cada um registrando os lances do seu jogo na beira da quadra, e a torcida acompanhando tudo ao vivo pelo celular.

> Pastas e pacotes ainda se chamam `arquibancada` (nome antigo do projeto).

📘 **[COMO-USAR.md](./COMO-USAR.md)**: guia de uso (organização, mesários, torcida, sandbox, celular).

## O que ele faz

- **Vários mesários em paralelo.** Cada jogo tem um mesário titular e um reserva, escalados pela organização. Todos ficam logados ao mesmo tempo, cada um no seu jogo, e o console funciona até sem sinal (os lances ficam numa fila e sobem quando a rede volta).
- **Pontuação ao vivo de 42 modalidades.** Futebol, futsal, basquete, handebol, vôlei, tênis, beisebol, natação, atletismo, e-sports e outras, cada uma com seu motor de placar (gols, sets, games, entradas, ranking por tempo ou marca).
- **Classificação geral das atléticas.** Os pontos do torneio são recalculados a cada resultado, com regras configuráveis por modalidade, critérios de desempate e ajustes manuais (bônus, punição).
- **Torcida em tempo real.** Site público sem login, com o placar de todos os jogos, animação de gol, lance a lance, escalações e um print do placar pronto para postar. Aguenta milhares de conexões simultâneas.
- **Painel da organização.** Cadastro de atléticas, modalidades, jogos e mesários, correção de qualquer lance e um sandbox com um robô mesário para testar um dia cheio de jogos.

## As três frentes

- **Público** (`/`): sem login. No primeiro acesso pergunta a atlética e os esportes preferidos (fica no `localStorage`) e mostra um tutorial de 3 gestos. Mostra os jogos em cards no estilo Apple Sports, com placar e animação de gol ao vivo, lance a lance, escalações, agenda por dia, filtros, classificação geral e um print do placar pronto pra postar.
- **Mesa** (`/mesa`): console do **mesário**, a pessoa que registra o placar na beira da quadra. Login próprio, funciona otimista e offline.
- **Bastidores** (`/bastidores`): painel admin escondido (não tem link em lugar nenhum do site público). O caminho muda com `VITE_ADMIN_PATH` no build.

| Camada | Stack |
|---|---|
| API + tempo real | NestJS 10, Socket.IO, Prisma 6, SQLite (WAL) |
| Front | React 18, Vite, Tailwind, framer-motion, TanStack Query |
| Motor de placar | TypeScript puro em `api/src/shared/engine` (o mesmo código roda no servidor e no celular do mesário) |

## Rodar local

```bash
cp api/.env.example api/.env     # ajuste JWT_SECRET/ADMIN_* se quiser
npm run setup                    # instala, cria o banco e roda o seed
npm run dev                      # API :3000 + front :5173
```

Abra http://localhost:5173.

| Área | Endereço | Login de teste (seed, só em dev) |
|---|---|---|
| Público | `/` | — |
| Mesa | `/mesa` | `mesario@arquibancada.app` / `mesario123` |
| Admin | `/bastidores` | `admin@arquibancada.app` / `arquibancada123` (troque a senha no painel) |

O seed é idempotente. Ele cria 42 modalidades, o primeiro admin, 8 atléticas de exemplo e o torneio TUSCA 2026 vazio. **As cores e os nomes das atléticas são placeholders: ajuste em Bastidores → Atléticas** (dá pra subir o logo oficial).

### Sandbox

- **Bastidores → Sandbox** gera um torneio de teste isolado do público, com jogos já encerrados, ao vivo e agendados. O botão "iniciar simulação" põe um robô mesário pra jogar em tempo real, com velocidade de 0,25× a 10×. Ele chama o mesmo `LiveService.command` dos mesários, então testa a cadeia inteira: motor, banco, WebSocket e animações.
- **`/?sandbox=1`** abre o site público em modo sandbox (faixa amarela no topo). `/?sandbox=0` ou o botão "Sair" volta ao normal.
- **`npm run dev:sandbox`** sobe tudo num banco separado (`api/sandbox.db`) com o simulador ligado desde o boot.

### Testes

```bash
npm test          # motor de placar: futebol, pênaltis, vôlei, tênis, beisebol, ranking...
npm run typecheck # api + web
```

## Como funciona

**Placar = reduce(eventos).** Cada jogo é uma lista de eventos (gol, cartão, ponto, fim de período...), e o placar, o relógio, o período e as estatísticas são sempre recalculados a partir dela. Por isso:

- **desfazer** é só anular um evento;
- o admin pode corrigir qualquer lance de um jogo passado;
- o mesário roda o motor localmente e vê o placar mudar na hora, antes de a rede confirmar.

**Motores de placar** (configuráveis por modalidade no painel):

| Motor | Modalidades | O que faz |
|---|---|---|
| `SCORE` | futebol, futsal, basquete, handebol, rugby, futebol americano, polo, lutas, xadrez | Soma ações configuráveis (gol, +2, +3, try +5…). Tem períodos, relógio progressivo ou regressivo, acréscimos, prorrogação, pênaltis e golpes decisivos (ippon, finalização) |
| `SETS` | vôlei, vôlei de praia, futevôlei, tênis de mesa, badminton, e-sports por mapa | Ponto a ponto. O set fecha sozinho no alvo com vantagem; o set decisivo pode ter alvo diferente |
| `TENNIS` | tênis, beach tennis, padel | 15/30/40, vantagem ou no-ad, tie-break, super tie-break e saque alternado |
| `BASEBALL` | beisebol, softbol | Bolas/strikes/outs, entradas alto e baixo, linescore R-H-E, bases e walk-off |
| `RANKING` | natação, atletismo, cheerleading, tiro com arco | Provas sem confronto direto, ordenadas por tempo ou marca |

**Mesário offline.** Cada toque vira um comando com `clientId` e entra numa fila salva no aparelho. A fila é reenviada com backoff quando o sinal volta, e o servidor ignora duplicatas. Ações críticas (iniciar, encerrar período ou jogo) pedem **segurar o botão** pra confirmar.

**Marca agora, autor depois** (estilo SofaScore, em toda modalidade). O toque em gol, cesta, ponto, cartão, substituição, pênalti ou rebatida já vale na hora. Aí sobe a barra "quem fez?" com as camisas, sem travar o próximo lance. O que ficar sem autor vai pra lista "Sem autor", pra preencher no intervalo. A atribuição usa a mesma fila offline, e no servidor é um `PATCH /api/mesa/matches/:id/events/:eventId`.

**Titular e reserva.** Cada jogo tem um mesário titular e um reserva. O reserva só registra quando o admin libera, na hora, em Visão geral ou Jogos. Mesários só podem ser escalados nas modalidades em que estão habilitados.

**Tempo real.** O Socket.IO tem duas salas: `feed` (o resumo de todos os jogos, que alimenta os cards) e `match:<id>`. O feed público e o detalhe de cada jogo ficam serializados em memória, então os torcedores não fazem consulta ao banco. Medido localmente: **1000 conexões simultâneas recebendo 22 mil atualizações em 20 s, latência p99 de 114 ms**.

**Feed por dia (home).** Uma tela por dia, sem filtros: arrastar pro lado troca o dia (setas do teclado no desktop). Abre fixado no jogo do momento (ao vivo de qualquer dia > último encerrado > primeiro do dia) via âncora `#jogo-<id>` — que também serve de link compartilhável. Botão redondo flutuante leva pro jogo ao vivo (some se não há jogo ou se ele já está na tela). Switch "Só <atlética>" no topo filtra pela atlética do torcedor. Regras em `web/src/lib/feed.ts`, testadas em `feed.test.ts` (Vitest).

**Torneio do momento.** O público não escolhe torneio: vê só o que o admin marcou em Bastidores → Torneios → "Colocar no site" (um por ambiente, real e sandbox). Cada torneio pode ter um **banner** (upload ou URL, com link opcional) exibido no topo da Classificação. O modelo `web/public/banners/tusca-2026.svg` vem pronto.

**Visual.** Tema claro, inspirado na identidade do TUSCA 2026: Big Shoulders Display (condensada pesada) nos títulos e placares, Funnel Display no texto, paleta pop em etiquetas chapadas e ticker preto com texto amarelo. As cores são variáveis CSS em `web/src/index.css`, e já existe um `[data-theme='dark']` pronto, se um dia quiserem modo noturno.

**Pontuação do torneio** (Bastidores → Pontuação):

- regra padrão do torneio, que pode ser sobrescrita por modalidade e naipe: vitória, empate, derrota, vitória/derrota por W.O. e participação;
- pontos pela classificação final de cada modalidade (ex.: 13, 10, 8…) e pontos por colocação em cada prova de ranking;
- critérios de desempate do placar geral (mais ouros, vitórias, saldo…) e das tabelas por modalidade (confronto direto, saldo…), em ordem configurável;
- ajustes manuais de pontos com motivo: bônus, punição, correção.

## Deploy

É uma imagem só: o Nest serve a API, o WebSocket e o front buildado. No boot ela roda `prisma db push`, depois o seed e só então sobe.

**Fly.io** (região GRU):

```bash
fly launch --no-deploy --copy-config
fly volumes create arquibancada_data --region gru --size 1
fly secrets set JWT_SECRET=$(openssl rand -hex 32) ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD='senha-forte'
fly deploy
```

Ajuste `app` e `WEB_ORIGIN` no `fly.toml`. **Rode uma máquina só**: o SQLite e o barramento ao vivo são locais. Uma instância aguenta folgado um torneio universitário. Se um dia precisar escalar horizontalmente:

1. troque o provider do Prisma pra `postgresql` (o schema não usa nada específico do SQLite);
2. adicione o adapter Redis do Socket.IO.

Qualquer host com Docker e volume persistente serve (Railway, Render, VPS). Monte o volume e aponte `DATABASE_URL=file:/caminho/no/volume.db`.

## Estrutura

```
api/
  prisma/schema.prisma        modelos (atléticas, modalidades, jogos, eventos, regras...)
  src/shared/                 tipos + catálogo de modalidades + motor (compartilhado com o web)
  src/live/                   LiveService (fila por jogo, cache, broadcast), gateway, API do mesário
  src/public/                 feed público em memória
  src/standings/              classificação geral e tabelas por modalidade
  src/admin/                  CRUDs do painel
  src/sandbox/                gerador + simulador
  src/seed/seed.ts
web/
  src/pages/public/           feed, jogo, classificação, atlética
  src/pages/mesa/             console do mesário
  src/pages/admin/            Bastidores
  src/components/match/       card, detalhe, print compartilhável, comemoração
  src/components/ui/          bandeiras, ícones de modalidade, sheets, botão de segurar
```
