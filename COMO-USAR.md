# PONTUSCA — como usar

Guia prático pra quem vai **rodar, organizar e operar** o placar ao vivo. Pra detalhes técnicos, veja o `README.md`. Se for um agente de IA mexendo no código, veja o `AGENTS.md`.

---

## 1. Ligar o sistema no seu PC

Pré-requisito: Node.js 22 ou mais novo.

```bash
cd arquibancada
cp api/.env.example api/.env   # só na primeira vez
npm run setup                  # só na primeira vez: instala, cria o banco e os dados iniciais
npm run dev                    # liga tudo (API na porta 3000 + site na 5173)
```

Deixe esse terminal aberto. Abra **http://localhost:5173**.

| Área | Endereço | Quem usa |
|---|---|---|
| Site público | `/` | torcida (sem login) |
| Mesa | `/mesa` | mesários (quem registra o placar) |
| Bastidores | `/bastidores` | organização (admin) — não tem link no site |

### Logins de teste (criados automaticamente em desenvolvimento)

| Papel | E-mail | Senha |
|---|---|---|
| Admin | `admin@arquibancada.app` | `arquibancada123` |
| Mesário | `mesario@arquibancada.app` | `mesario123` |

> Troque a senha do admin em **Bastidores → Equipe** antes de usar de verdade. Em produção, o mesário de teste não é criado.

### Pelo celular (mesma rede Wi-Fi)

1. Descubra o IP do PC (no Windows: `ipconfig`, linha "Endereço IPv4" do Wi-Fi). Ex.: `192.168.0.5`.
2. No celular: `http://192.168.0.5:5173` (público) ou `http://192.168.0.5:5173/mesa` (mesário).
3. Não abriu? É o firewall do Windows. Num PowerShell **como administrador**:
   ```powershell
   New-NetFirewallRule -DisplayName "PONTUSCA dev" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow -Profile Private
   ```

Dica: admin e mesário no **mesmo navegador** dividem a sessão (logar num desloga o outro). Use janela anônima, outro navegador ou o celular.

---

## 2. Organização (Bastidores)

Ordem sugerida pra montar um torneio do zero:

1. **Torneios** → *Novo torneio* (nome, edição, cidade, datas, cor). Depois clique **Colocar no site**: só o torneio marcado "NO SITE" aparece pro público. Aqui também vai o **banner** (aparece no topo da Classificação; tamanho ideal 1600×560) e o link opcional dele.
2. **Atléticas** → nome curto (ex.: CAASO), cores, padrão da bandeira e logo (opcional). As cores viram a "cara" da atlética no site, no console e no print compartilhável.
3. **Modalidades** → já vêm 42 prontas (futebol, futsal, basquete, vôlei, tênis, beisebol, lutas, natação, e-sports…). Dá pra ajustar períodos, duração, prorrogação, pênaltis, sets e os botões que o mesário vê.
4. **Atletas & elencos** → escolha a atlética, a modalidade e o naipe e use **Colar lista** (um por linha: `10 João Silva - ATA`). O elenco entra automaticamente na escalação de cada jogo.
5. **Equipe** → cadastre os mesários (com telefone) e marque **em quais modalidades** cada um pode registrar. O botão **N titular · N reserva** de cada pessoa abre os jogos dela: marque vários e **Escalar** de uma vez (como titular ou reserva). O painel avisa se a pessoa fica em dois jogos com menos de 1h30 de diferença.
6. **Jogos** → *Novo jogo* (ou *Criar rodada* pra vários de uma vez): modalidade, naipe, horário, local, as duas atléticas (ou os participantes, em provas como natação), **mesário titular** e **reserva**. Também dá pra escalar/trocar direto na lista de Jogos: toque no nome do mesário (ou em *Escalar mesário*).
7. **Pontuação** → quanto vale vitória/empate/derrota/W.O. (padrão e por modalidade), pontos pela **classificação final** de cada modalidade (1º, 2º, 3º…), critérios de desempate e **ajustes manuais** (bônus/punição com motivo).

No dia do evento, a **Visão geral** mostra:
- **Alertas** (jogo sem mesário, atrasado, ao vivo parado há muito tempo) com o **responsável em destaque**: titular e reserva, telefone com botões de ligar/WhatsApp, *Trocar*/*Escalar* e *Liberar reserva* ali mesmo.
- **No site agora** e **Audiência agora**: quantos torcedores estão com cada jogo na tela (e quantos com ele aberto), atualizado a cada 5 s. Admins e mesários não contam.

**Reserva:** o mesário reserva só consegue registrar quando você clicar **Liberar reserva** no jogo (Visão geral ou Jogos). A tela dele destrava na hora.

**Corrigir um jogo:** em Jogos → ação do jogo:
- *Resultado manual* — lança o placar final direto (jogo sem súmula, W.O. combinado).
- *Zerar lances* — apaga tudo e volta pra "agendado".
- O admin também pode abrir o jogo em **Operar** e desfazer lances específicos.

---

## 3. Mesário (Mesa)

1. Entre em `/mesa` com seu login. Aparecem os jogos em que você está escalado (titular ou reserva).
2. Abra o jogo. A tela fica acesa sozinha.
3. **Iniciar jogo**: toque e **segure** o botão até completar (proteção contra toque sem querer). O mesmo vale pra encerrar tempo, prorrogação, pênaltis e fim de jogo.
4. **Lances**: toque no botão grande do time (GOL, +2, +3, PONTO…) — o placar sobe **na hora**.
   - Logo depois sobe a barra **"quem fez?"** com as camisas: toque no número. Se estiver corrido, toque **Depois**.
   - Lances sem autor ficam em **"N lances sem autor"** pra preencher no intervalo.
   - Cartões, faltas, substituições, escanteios etc. ficam nos botões menores.
5. **Errou?** Na lista de lances: **Desfazer último** ou a lixeira do lance. Encerrou o jogo sem querer? Desfazer o "Fim de jogo" reabre.
6. **Sem sinal?** Continue registrando normalmente. O selo no topo mostra "N lances aguardando sinal" e tudo é enviado quando a internet voltar, sem duplicar.
7. **Escalação** (ícone de pessoas): marque titulares, capitão, números; dá pra adicionar atleta na hora.
8. **Mais** (⋯): observação, W.O., ajustar relógio, recarregar, ver a página pública.

Cada modalidade tem seu painel: futebol/basquete/lutas (botões por ação), vôlei/tênis de mesa (+1 por lado, sets fecham sozinhos), tênis (15/30/40, saque), beisebol (bola/strike/out/rebatidas e as bases), provas (digite tempo ou marca de cada participante).

---

## 4. Torcida (site público)

- **Primeiro acesso**: o app pergunta a atlética e os esportes preferidos e mostra um tutorial rápido. Tudo fica salvo no aparelho. Pra mudar: toque na bandeira no canto superior direito.
- **Arraste pro lado** pra trocar de dia. O app abre no **jogo do momento** (o ao vivo; senão o último encerrado; senão o primeiro do dia).
- **Bolinha no canto inferior direito**: leva pro jogo ao vivo (some se não tiver).
- **Switch "Só <atlética>"** no topo: mostra só os jogos da sua atlética.
- Toque num jogo pra ver **lance a lance, escalações e números**. Em jogos ao vivo ou encerrados, **Compartilhar** gera a imagem do placar (fundo de uma das duas atléticas, formato feed ou story).
- **Classificação**: pódio, pontos, medalhas e tabelas por modalidade.

---

## 5. Testar sem jogo real (Sandbox)

Bastidores → **Sandbox**:

- **Gerar** cria um torneio de teste (não aparece pro público) com jogos encerrados, ao vivo e agendados.
- **Iniciar simulação** põe um robô pra jogar as partidas ao vivo (velocidade de 0,25× a 10×).
- **Abrir site em modo sandbox** (ou `/?sandbox=1`) mostra esses jogos; `/?sandbox=0` volta ao normal.
- **Limpar tudo** apaga só os dados de teste.
- Os jogos do sandbox já vêm com o mesário de teste escalado, pra testar a Mesa.

---

## 6. Colocar no ar

Resumo (detalhes no `README.md`, seção Deploy): é uma imagem Docker só; no Fly.io rode **uma máquina** com volume em `/data`, e defina `JWT_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` como segredos.

---

## 7. Quando der erro

O sistema registra sozinho o que acontece: servidor, celular do mesário, site do torcedor. Nada de senha fica gravado.

- Erro do servidor mostra um **código** (ex.: `Código: a1b2c3d4e5f6`). Anote e mande pro agente/dev: `npm run logs -- --req a1b2c3d4e5f6` mostra o caminho todo.
- Problema num jogo? `npm run logs -- --match <id do jogo>` (o id está na URL `/jogo/<id>`).
- Visão geral do que anda falhando: `npm run logs -- --summary`.

## 8. Problemas comuns

| Sintoma | Causa provável / solução |
|---|---|
| Celular não abre o site | Firewall do Windows (ver seção 1) ou celular em outra rede. |
| Tudo lento (~1 s por ação) no PC | Algo rodando só em IPv4 com `localhost`. Use `npm run dev` (já sobe certo) ou acesse por `127.0.0.1`. |
| Mesário vê "aguardando liberação" | Ele é reserva: libere em Bastidores → Visão geral/Jogos. |
| Mesário não aparece pra escalar | Ele não está habilitado na modalidade (Bastidores → Equipe). |
| Site mostra torneio errado | Bastidores → Torneios → **Colocar no site** no torneio certo. |
| Placar de jogo passado errado | Jogos → Resultado manual, ou Operar e desfazer o lance errado. |
