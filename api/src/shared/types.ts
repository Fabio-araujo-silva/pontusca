// Tipos compartilhados entre api e web (o web importa via alias @shared).
// Este diretório NÃO pode importar nada de Nest/Prisma/Node — só TS puro.

export type Side = 'home' | 'away';
export type Gender = 'M' | 'F' | 'X';
export type Role = 'ADMIN' | 'MESARIO';
export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELED';
export type EngineKind = 'SCORE' | 'SETS' | 'TENNIS' | 'BASEBALL' | 'RANKING';
export type FlagPattern = 'stripes' | 'diagonal' | 'chevron' | 'split' | 'cross' | 'solid';

export const GENDER_LABEL: Record<Gender, string> = { M: 'Masculino', F: 'Feminino', X: 'Misto' };
export const STATUS_LABEL: Record<MatchStatus, string> = {
  SCHEDULED: 'Agendado',
  LIVE: 'Ao vivo',
  FINISHED: 'Encerrado',
  POSTPONED: 'Adiado',
  CANCELED: 'Cancelado',
};

// ---------------------------------------------------------------------------
// Configuração de modalidade (fica em Sport.config como JSON)
// ---------------------------------------------------------------------------

export type ActionKind = 'score' | 'card' | 'sub' | 'foul' | 'timeout' | 'stat';

export interface SportAction {
  key: string; // identificador estável, ex: "goal", "three"
  label: string; // texto do botão, ex: "Gol", "+3"
  kind: ActionKind;
  value?: number; // pontos (kind=score) — default 1
  against?: boolean; // gol contra: credita o adversário
  both?: boolean; // credita os dois lados (ex: empate no xadrez = ½ pra cada)
  color?: 'yellow' | 'red' | 'blue' | 'green' | 'white'; // cartões
  athlete?: 'required' | 'optional' | 'none'; // pede atleta ao registrar
  celebrate?: string; // texto da animação ao vivo, ex: "GOL!"
  decisive?: boolean; // encerra a disputa (ippon, finalização, nocaute) -> sugere fim
  penalty?: boolean; // cobrança de pênalti/7m durante o jogo (gol de pênalti, pênalti perdido)
  short?: string; // rótulo curto da timeline
}

export interface PeriodConfig {
  count: number;
  label: string; // "Tempo", "Quarto", "Período", "Round"
  short: string; // "T", "Q", "P", "R"
  durationMin: number | null; // null = sem relógio
  clock: 'up' | 'down' | 'none';
  display: 'minute' | 'mmss'; // futebol mostra 67', basquete 08:34
  breakLabel: string; // "Intervalo"
}

export interface SportConfig {
  engine: EngineKind;
  allowDraw: boolean;
  scoreLabel?: string; // "Gols", "Pontos"
  periods?: PeriodConfig;
  overtime?: { count: number; durationMin: number | null; label: string; short: string } | null;
  shootout?: { label: string; kicks: number } | null;
  actions: SportAction[];
  sets?: {
    bestOf: number;
    target: number | null; // null = set fechado manualmente (ex: mapa de e-sports)
    decidingTarget?: number | null;
    winBy: number;
    cap?: number | null; // teto (ex: badminton 30)
    label: string; // "Set", "Mapa", "Game"
  };
  tennis?: {
    bestOf: number;
    gamesPerSet: number;
    tiebreakAt: number;
    tiebreakTarget: number;
    superTiebreak: number | null; // set decisivo em super tie-break (10)
    noAd: boolean;
  };
  baseball?: { innings: number };
  ranking?: {
    order: 'asc' | 'desc'; // asc = menor tempo vence
    format: 'time' | 'decimal' | 'integer';
    unit: string; // "s", "m", "pts"
    resultLabel: string; // "Tempo", "Marca", "Nota"
  };
  lineup?: { starters: number; positions?: string[] };
}

// ---------------------------------------------------------------------------
// Eventos (event-sourcing por jogo: o placar é sempre reduce(eventos))
// ---------------------------------------------------------------------------

export type EventType =
  | 'MATCH_START'
  | 'PERIOD_START'
  | 'PERIOD_END'
  | 'CLOCK_PAUSE'
  | 'CLOCK_RESUME'
  | 'CLOCK_SET'
  | 'SHOOTOUT_START'
  | 'SHOOTOUT_KICK'
  | 'MATCH_END'
  | 'WO'
  | 'NOTE'
  | 'ACTION' // botões configuráveis da modalidade (gol, cartão, substituição...)
  | 'POINT' // sets/tênis: ponto do lado
  | 'SET_WIN' // sets manuais (mapa de e-sports)
  | 'PITCH' // beisebol: BALL/STRIKE/FOUL
  | 'OUT'
  | 'HIT'
  | 'RUN'
  | 'ERROR'
  | 'BASES'
  | 'RESULT'; // ranking: marca/tempo de um participante

export interface EngineEvent {
  id: string;
  seq: number;
  type: EventType;
  side?: Side | null;
  athleteId?: string | null;
  athlete2Id?: string | null;
  payload: Record<string, any>;
  period?: number | null;
  clockMs?: number | null;
  at: number; // epoch ms (hora do servidor)
}

// ---------------------------------------------------------------------------
// Estado derivado
// ---------------------------------------------------------------------------

export interface ClockView {
  running: boolean;
  baseMs: number;
  startedAt: number | null; // epoch ms do servidor
  direction: 'up' | 'down';
  durationMs: number | null;
  display: 'minute' | 'mmss';
  offsetMin: number; // futebol 2º tempo começa em 45'
}

export type LivePhase = 'PRE' | 'PERIOD' | 'BREAK' | 'SHOOTOUT' | 'END';

export type LifecycleAction =
  | 'START_MATCH'
  | 'END_PERIOD'
  | 'START_PERIOD'
  | 'START_OVERTIME'
  | 'START_SHOOTOUT'
  | 'END_MATCH'
  | 'PAUSE_CLOCK'
  | 'RESUME_CLOCK';

export interface BaseballView {
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  balls: number;
  strikes: number;
  bases: [boolean, boolean, boolean];
  innings: { home: (number | null)[]; away: (number | null)[] };
  hits: { home: number; away: number };
  errors: { home: number; away: number };
}

export interface TennisView {
  sets: [number, number][]; // games por set
  tiebreaks: ([number, number] | null)[]; // pontos do tie-break de cada set (se houve)
  game: [string, string]; // "15", "40", "AD"
  tiebreak: boolean;
  server: Side | null;
}

export interface RankingRow {
  participantId: string;
  institutionId: string;
  athleteName?: string | null;
  lane?: number | null;
  result?: string | null; // formatado
  value?: number | null;
  position?: number | null;
  status?: 'OK' | 'DNF' | 'DQ' | 'DNS' | null;
}

export interface ScoreView {
  home: number;
  away: number;
  periods: [number, number][]; // placar por período / set
  shootout?: { home: number; away: number; kicks: { side: Side; scored: boolean }[] } | null;
  tennis?: TennisView | null;
  baseball?: BaseballView | null;
  ranking?: RankingRow[] | null;
  fouls?: { home: number; away: number }; // faltas do período (futsal/basquete)
  timeouts?: { home: number; away: number };
}

export interface LiveView {
  phase: LivePhase;
  period: number; // 1-based; prorrogação continua contando (3, 4...)
  isOvertime: boolean;
  periodLabel: string; // "2º Tempo", "Intervalo", "Q3", "Set 2", "▲ 5ª"
  shortLabel: string; // "2T", "INT", "Q3", "S2"
  clock: ClockView | null;
  nextActions: LifecycleAction[];
  suggestEnd: boolean; // o motor acha que o jogo acabou (sets fechados, 3 outs na 9ª...)
}

export interface Highlight {
  type: string; // 'score' | 'card' | 'set' | 'end' | 'start' | 'period'
  side?: Side | null;
  label: string; // "GOL!", "CESTA DE 3", "SET!", "FIM DE JOGO"
  athleteName?: string | null;
  value?: number;
  big?: boolean; // animação grande (gol, touchdown, set) vs. pulso discreto (+2 no basquete)
}

export interface MatchSummary {
  id: string;
  tournamentId: string;
  sportId: string;
  gender: Gender;
  phase?: string | null;
  group?: string | null;
  venue?: string | null;
  scheduledAt: string; // ISO
  status: MatchStatus;
  homeId?: string | null;
  awayId?: string | null;
  participantIds?: string[]; // RANKING: instituições na prova
  title?: string | null; // nome da prova (ex: "100m rasos")
  score: ScoreView;
  live: LiveView;
  winner: Side | 'draw' | null;
  wo: Side | null; // quem VENCEU por W.O.
  manual: boolean; // resultado lançado manualmente pelo admin
  seq: number;
  updatedAt: number;
  isSandbox: boolean;
  lastEvent?: { id: string; type: EventType; side?: Side | null; label: string; at: number } | null;
}

export interface TimelineItem {
  id: string;
  seq: number;
  type: EventType;
  side?: Side | null;
  icon: string; // chave de ícone pro front
  title: string; // "Gol", "Cartão amarelo"
  subtitle?: string | null; // nome do atleta, "Sai X, entra Y"
  minute?: string | null; // "67'", "Q2 03:12"
  scoreAfter?: [number, number] | null;
  at: number;
  voided?: boolean;
  important?: boolean;
  minor?: boolean; // lance miúdo (ponto a ponto do vôlei, arremesso do beisebol): o front recolhe
}

export interface PlayerView {
  athleteId: string;
  name: string;
  nickname?: string | null;
  number?: number | null;
  position?: string | null;
  starter: boolean;
  captain: boolean;
  course?: string | null;
}

export interface StatRow {
  label: string;
  home: number;
  away: number;
}

export interface MatchDetail extends MatchSummary {
  timeline: TimelineItem[];
  lineups: { home: PlayerView[]; away: PlayerView[] };
  participants?: { id: string; institutionId: string; athleteName?: string | null; lane?: number | null }[];
  stats: StatRow[];
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Comandos do mesário (viram eventos depois de validados pelo motor)
// ---------------------------------------------------------------------------

export interface MatchCommand {
  clientId: string; // uuid gerado no aparelho -> idempotência em retry offline
  type:
    | LifecycleAction
    | 'CLOCK_SET'
    | 'ACTION'
    | 'POINT'
    | 'SET_WIN'
    | 'SHOOTOUT_KICK'
    | 'PITCH'
    | 'OUT'
    | 'HIT'
    | 'RUN'
    | 'ERROR'
    | 'BASES'
    | 'RESULT'
    | 'WO'
    | 'NOTE';
  side?: Side | null;
  athleteId?: string | null;
  athlete2Id?: string | null;
  payload?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Entidades públicas
// ---------------------------------------------------------------------------

export interface InstitutionDTO {
  id: string;
  name: string; // nome curto, ex: "CAASO"
  fullName?: string | null;
  university?: string | null; // "USP São Carlos"
  city?: string | null;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string | null;
  flagPattern: FlagPattern;
  logo?: string | null;
  isSandbox?: boolean;
}

export interface SportDTO {
  id: string;
  name: string;
  slug: string;
  icon: string;
  category: 'team' | 'individual' | 'race';
  engine: EngineKind;
  config: SportConfig;
  genders: Gender[];
  active: boolean;
  order: number;
}

export interface TournamentDTO {
  id: string;
  name: string;
  slug: string;
  edition?: string | null;
  city?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  active: boolean;
  isCurrent: boolean;
  isSandbox: boolean;
  tiebreakers: string[];
  color?: string | null;
  banner?: string | null;
  bannerLink?: string | null;
}

export interface StandingRow {
  institutionId: string;
  position: number;
  points: number;
  matchPoints: number;
  placementPoints: number;
  racePoints: number;
  adjustments: number;
  gold: number;
  silver: number;
  bronze: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  bySport: { sportId: string; gender: Gender; points: number; placement?: number | null }[];
}

export interface ModalityTableRow {
  institutionId: string;
  position: number;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  diff: number;
}

export interface ModalityTable {
  sportId: string;
  gender: Gender;
  group: string | null;
  rows: ModalityTableRow[];
}

export interface StandingsDTO {
  tournamentId: string;
  rows: StandingRow[];
  modalities: ModalityTable[];
  updatedAt: number;
}

export const TOURNAMENT_TIEBREAKERS: Record<string, string> = {
  POINTS: 'Pontos',
  GOLD: 'Mais 1º lugares',
  SILVER: 'Mais 2º lugares',
  BRONZE: 'Mais 3º lugares',
  WINS: 'Mais vitórias',
  SCORE_DIFF: 'Saldo de gols/pontos',
  SCORE_FOR: 'Gols/pontos pró',
  FEWER_LOSSES: 'Menos derrotas',
};

export const MODALITY_TIEBREAKERS: Record<string, string> = {
  POINTS: 'Pontos',
  WINS: 'Vitórias',
  SCORE_DIFF: 'Saldo',
  SCORE_FOR: 'Gols/pontos pró',
  HEAD_TO_HEAD: 'Confronto direto',
  FEWER_AGAINST: 'Menos gols/pontos sofridos',
};
