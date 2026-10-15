import type {
  ClockView,
  EngineEvent,
  Highlight,
  LifecycleAction,
  LivePhase,
  MatchCommand,
  ScoreView,
  Side,
  SportAction,
  SportConfig,
  StatRow,
  TimelineItem,
} from '../types';

export interface ParticipantInfo {
  id: string;
  institutionId: string;
  athleteName?: string | null;
  lane?: number | null;
}

export interface ManualResult {
  home: number;
  away: number;
  winner?: Side | 'draw' | null;
  note?: string | null;
}

export interface EngineInput {
  config: SportConfig;
  events: EngineEvent[]; // só eventos válidos (não anulados), em ordem de seq
  participants?: ParticipantInfo[];
  names?: Record<string, string>; // athleteId -> nome pra timeline
  manual?: ManualResult | null;
}

export interface EngineOutput {
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED';
  score: ScoreView;
  live: {
    phase: LivePhase;
    period: number;
    isOvertime: boolean;
    periodLabel: string;
    shortLabel: string;
    clock: ClockView | null;
    nextActions: LifecycleAction[];
    suggestEnd: boolean;
  };
  winner: Side | 'draw' | null;
  wo: Side | null;
  timeline: TimelineItem[];
  stats: StatRow[];
  highlight: Highlight | null; // destaque do ÚLTIMO evento (pra animação ao vivo)
}

/** Parte do evento que o motor decide (o service completa id/seq/at). */
export interface DraftEvent {
  type: EngineEvent['type'];
  side?: Side | null;
  athleteId?: string | null;
  athlete2Id?: string | null;
  payload: Record<string, any>;
  period?: number | null;
  clockMs?: number | null;
}

export class EngineError extends Error {}

/**
 * Quantos atletas um lance pede (0, 1 ou 2 na substituição). Base do fluxo
 * "marca o lance agora, diz quem fez depois" — vale pra toda modalidade.
 */
export function authorSlots(ev: Pick<EngineEvent, 'type' | 'payload'>, config: SportConfig): 0 | 1 | 2 {
  if (ev.type === 'SHOOTOUT_KICK' || ev.type === 'HIT' || ev.type === 'RUN') return 1;
  if (ev.type !== 'ACTION') return 0;
  const kind = ev.payload?.kind;
  const ath = ev.payload?.athlete ?? config.actions.find((a) => a.key === ev.payload?.key)?.athlete ?? 'optional';
  if (ath === 'none' || !['score', 'card', 'sub'].includes(kind)) return 0;
  return kind === 'sub' ? 2 : 1;
}

export function missingAuthor(ev: Pick<EngineEvent, 'type' | 'payload' | 'athleteId' | 'athlete2Id'>, config: SportConfig) {
  const n = authorSlots(ev, config);
  if (n === 2) return !ev.athleteId || !ev.athlete2Id;
  return n === 1 && !ev.athleteId;
}

export const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
export const ix = (s: Side) => (s === 'home' ? 0 : 1);

export function requireSide(cmd: MatchCommand): Side {
  if (cmd.side !== 'home' && cmd.side !== 'away') throw new EngineError('Escolha o lado (mandante/visitante).');
  return cmd.side;
}

// ---------------------------------------------------------------------------
// Relógio
// ---------------------------------------------------------------------------

export class Clock {
  running = false;
  baseMs = 0;
  startedAt: number | null = null;

  start(at: number, baseMs = 0) {
    this.baseMs = baseMs;
    this.startedAt = at;
    this.running = true;
  }
  pause(at: number) {
    if (!this.running) return;
    this.baseMs += Math.max(0, at - (this.startedAt ?? at));
    this.startedAt = null;
    this.running = false;
  }
  resume(at: number) {
    if (this.running) return;
    this.startedAt = at;
    this.running = true;
  }
  set(ms: number, at: number) {
    this.baseMs = Math.max(0, ms);
    this.startedAt = this.running ? at : null;
  }
  elapsed(at: number) {
    return this.baseMs + (this.running && this.startedAt != null ? Math.max(0, at - this.startedAt) : 0);
  }
}

/** Tempo decorrido do período num instante (usado no front pra tick e no back pro minuto do lance). */
export function clockElapsed(clock: Pick<ClockView, 'running' | 'baseMs' | 'startedAt'>, now: number) {
  return clock.baseMs + (clock.running && clock.startedAt != null ? Math.max(0, now - clock.startedAt) : 0);
}

const pad = (n: number) => String(n).padStart(2, '0');

export function mmss(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Texto do relógio: "67'", "45+2'", "08:34". */
export function formatClock(clock: ClockView, now: number): string {
  const el = clockElapsed(clock, now);
  if (clock.display === 'minute') {
    const m = Math.floor(el / 60000) + 1;
    const dur = clock.durationMs != null ? Math.round(clock.durationMs / 60000) : null;
    if (dur != null && m > dur) return `${clock.offsetMin + dur}+${m - dur}'`;
    return `${clock.offsetMin + m}'`;
  }
  if (clock.direction === 'down' && clock.durationMs != null) return mmss(clock.durationMs - el);
  return mmss(el);
}

// ---------------------------------------------------------------------------
// Rótulos e utilidades
// ---------------------------------------------------------------------------

export const ord = (n: number) => `${n}º`;

export function plural(label: string) {
  if (/^[+\d]/.test(label)) return label;
  const words = label.split(' ');
  const out: string[] = [];
  let stop = false;
  for (const w of words) {
    if (stop || /^(de|da|do|no|na|em|contra|\(|\d)/i.test(w)) {
      stop = true;
      out.push(w);
      continue;
    }
    let p = w;
    if (/ão$/.test(w)) p = w.replace(/ão$/, 'ões');
    else if (/[aeiouáéíóúl]$/i.test(w)) p = w + 's';
    else if (/[rz]$/i.test(w)) p = w + 'es';
    out.push(p);
  }
  return out.join(' ');
}

export function name(input: EngineInput, id?: string | null) {
  if (!id) return null;
  return input.names?.[id] ?? null;
}

export function emptyScore(): ScoreView {
  return { home: 0, away: 0, periods: [] };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function winnerByScore(h: number, a: number): Side | 'draw' {
  if (h > a) return 'home';
  if (a > h) return 'away';
  return 'draw';
}

/** Aplica resultado manual do admin por cima do que o motor calculou. */
export function applyManual(out: EngineOutput, manual?: ManualResult | null): EngineOutput {
  if (!manual) return out;
  out.score.home = manual.home;
  out.score.away = manual.away;
  out.winner = manual.winner ?? winnerByScore(manual.home, manual.away);
  out.status = 'FINISHED';
  out.live = { ...out.live, phase: 'END', periodLabel: 'Encerrado', shortLabel: 'FIM', clock: null, nextActions: [], suggestEnd: false };
  return out;
}

/** Contadores genéricos das ações configuráveis (cartões, faltas, estatísticas...). */
export class ActionStats {
  counts = new Map<string, [number, number]>();
  add(key: string, side: Side, n = 1) {
    const c = this.counts.get(key) ?? [0, 0];
    c[ix(side)] += n;
    this.counts.set(key, c);
  }
  rows(config: SportConfig, extra: StatRow[] = [], skip: (a: SportAction) => boolean = () => false): StatRow[] {
    const rows: StatRow[] = [...extra];
    const taken = new Set(extra.map((r) => r.label.toLowerCase()));
    for (const a of config.actions) {
      if (skip(a)) continue;
      const c = this.counts.get(a.key);
      if (!c || (c[0] === 0 && c[1] === 0)) continue;
      const label = plural(a.short && a.kind !== 'score' ? a.short : a.short ?? a.label);
      if (taken.has(label.toLowerCase())) continue; // ex.: "Gols" já é o total do placar
      rows.push({ label, home: c[0], away: c[1] });
    }
    return rows;
  }
}

/** A ação é cobrança de pênalti? (flag nova; chave como fallback pra configs antigas) */
export function isPenalty(a: Pick<SportAction, 'key' | 'penalty'>) {
  return a.penalty ?? /penalty|seven/.test(a.key);
}

export function actionIcon(kind: string, color?: string, against?: boolean, sportScoreIcon = 'goal') {
  if (kind === 'score') return against ? 'own-goal' : sportScoreIcon;
  if (kind === 'card') return `card-${color ?? 'yellow'}`;
  return kind; // sub | foul | timeout | stat
}

export function lifecycleItem(ev: EngineEvent, title: string, extra: Partial<TimelineItem> = {}): TimelineItem {
  return { id: ev.id, seq: ev.seq, type: ev.type, side: ev.side ?? null, icon: 'whistle', title, at: ev.at, important: true, ...extra };
}
