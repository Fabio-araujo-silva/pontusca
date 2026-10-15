// Regras do feed público por dia (funções puras, cobertas por feed.test.ts).
import type { MatchSummary, TournamentDTO } from '@shared/types';
import { addDays, dayKey } from './format';

export const involves = (m: Pick<MatchSummary, 'homeId' | 'awayId' | 'participantIds'>, instId: string | null | undefined) =>
  !!instId && (m.homeId === instId || m.awayId === instId || (m.participantIds ?? []).includes(instId));

export const byTime = (a: MatchSummary, b: MatchSummary) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id);

/** Dias navegáveis: período do torneio + dias com jogo + hoje, em ordem. */
export function feedDays(matches: Pick<MatchSummary, 'scheduledAt'>[], tournament: Pick<TournamentDTO, 'startsAt' | 'endsAt'> | null, today: string): string[] {
  const set = new Set(matches.map((m) => dayKey(m.scheduledAt)));
  if (tournament?.startsAt && tournament?.endsAt) {
    let k = dayKey(tournament.startsAt);
    const end = dayKey(tournament.endsAt);
    for (let i = 0; i < 40 && k <= end; i++, k = addDays(k, 1)) set.add(k);
  }
  set.add(today);
  return [...set].sort();
}

/** Dia de abertura: hoje se tiver jogo; senão o próximo com jogo; senão o último com jogo; senão hoje. */
export function initialDay(days: string[], countOf: (day: string) => number, today: string): string {
  if (countOf(today) > 0) return today;
  const next = days.find((d) => d > today && countOf(d) > 0);
  if (next) return next;
  const prev = [...days].reverse().find((d) => d < today && countOf(d) > 0);
  return prev ?? today;
}

export interface Prefs {
  atleticaId?: string | null;
  sportIds?: string[];
}

/** Peso de preferência: minha atlética > esporte de interesse > resto. */
function affinity(m: MatchSummary, prefs: Prefs) {
  return (involves(m, prefs.atleticaId) ? 2 : 0) + (prefs.sportIds?.includes(m.sportId) ? 1 : 0);
}

/**
 * "Jogo do momento" de um dia: o que está ao vivo (preferindo a atlética e os
 * esportes do torcedor); se nada ao vivo, o último que terminou; se nenhum
 * terminou ainda, o primeiro do dia.
 */
export function momentMatch(day: MatchSummary[], prefs: Prefs = {}): MatchSummary | null {
  if (!day.length) return null;
  const live = day.filter((m) => m.status === 'LIVE');
  if (live.length) return [...live].sort((a, b) => affinity(b, prefs) - affinity(a, prefs) || byTime(a, b))[0];
  const done = day.filter((m) => m.status === 'FINISHED');
  if (done.length) return [...done].sort((a, b) => b.updatedAt - a.updatedAt || byTime(b, a))[0];
  return [...day].sort(byTime)[0];
}

/** Jogo ao vivo pro botão flutuante (null = esconde o botão). */
export function liveTarget(matches: MatchSummary[], prefs: Prefs = {}): MatchSummary | null {
  const live = matches.filter((m) => m.status === 'LIVE');
  if (!live.length) return null;
  return [...live].sort((a, b) => affinity(b, prefs) - affinity(a, prefs) || byTime(a, b))[0];
}

/**
 * Onde o feed abre: link #jogo-… (se existir) > jogo ao vivo (de qualquer dia)
 * > dia inicial e o jogo do momento dele.
 */
export function openingPoint(matches: MatchSummary[], days: string[], today: string, prefs: Prefs = {}, hashId?: string | null): { day: string; matchId: string | null } {
  const byDay = (d: string) => matches.filter((m) => dayKey(m.scheduledAt) === d);
  const hashed = hashId ? matches.find((m) => m.id === hashId) : undefined;
  if (hashed) return { day: dayKey(hashed.scheduledAt), matchId: hashed.id };
  const live = liveTarget(matches, prefs);
  if (live) return { day: dayKey(live.scheduledAt), matchId: live.id };
  const day = initialDay(days, (d) => byDay(d).length, today);
  return { day, matchId: momentMatch(byDay(day), prefs)?.id ?? null };
}

export const anchorId = (matchId: string) => `jogo-${matchId}`;
export const matchFromHash = (hash: string) => (hash.startsWith('#jogo-') ? hash.slice(6) : null);
