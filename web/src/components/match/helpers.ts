import type { InstitutionDTO, MatchSummary, SportDTO } from '@shared/types';
import { formatClock } from '@shared/engine';
import { FALLBACK_INST } from '@/lib/data';
import { dayChip, dayKey, fmtScore, GENDER_SHORT, timeHM } from '@/lib/format';

export type StatusKind = 'live' | 'break' | 'scheduled' | 'final' | 'off';

export interface StatusView {
  kind: StatusKind;
  main: string; // "67'", "14:30", "Final"
  sub?: string | null; // "2º Tempo", "Amanhã", "Pên. 4–3"
}

export function statusView(m: MatchSummary, now: number): StatusView {
  const L = m.live;
  switch (m.status) {
    case 'LIVE': {
      if (L.phase === 'BREAK') return { kind: 'break', main: L.shortLabel === 'INT' ? 'Intervalo' : L.periodLabel, sub: null };
      if (L.phase === 'SHOOTOUT') return { kind: 'live', main: 'Pênaltis', sub: m.score.shootout ? `${m.score.shootout.home}–${m.score.shootout.away}` : null };
      if (L.clock) {
        const t = formatClock(L.clock, now);
        const short = L.shortLabel && L.shortLabel !== 'AO VIVO' ? L.shortLabel : null;
        return { kind: 'live', main: t, sub: L.clock.display === 'minute' ? L.periodLabel : short };
      }
      return { kind: 'live', main: L.shortLabel && L.shortLabel !== 'AO VIVO' ? L.shortLabel : 'Ao vivo', sub: L.periodLabel !== L.shortLabel ? L.periodLabel : null };
    }
    case 'SCHEDULED': {
      const today = dayKey(now);
      const d = dayChip(dayKey(m.scheduledAt), today);
      return { kind: 'scheduled', main: timeHM(m.scheduledAt), sub: d.diff === 0 ? 'Hoje' : d.diff === 1 ? 'Amanhã' : `${d.top}, ${d.bottom}` };
    }
    case 'FINISHED': {
      let sub: string | null = null;
      if (m.wo) sub = 'W.O.';
      else if (m.score.shootout && (m.score.shootout.home || m.score.shootout.away)) sub = `Pên. ${m.score.shootout.home}–${m.score.shootout.away}`;
      else if (L.isOvertime && !m.score.baseball) sub = 'Prorrogação';
      else if (m.manual) sub = 'Oficial';
      return { kind: 'final', main: 'Final', sub };
    }
    case 'POSTPONED':
      return { kind: 'off', main: 'Adiado', sub: timeHM(m.scheduledAt) };
    default:
      return { kind: 'off', main: 'Cancelado', sub: null };
  }
}

export function teamsOf(m: Pick<MatchSummary, 'homeId' | 'awayId'>, inst: Map<string, InstitutionDTO>) {
  return {
    home: (m.homeId && inst.get(m.homeId)) || FALLBACK_INST,
    away: (m.awayId && inst.get(m.awayId)) || FALLBACK_INST,
  };
}

export function sportLine(m: MatchSummary, sport?: SportDTO) {
  return [sport ? `${sport.name}` : 'Jogo', GENDER_SHORT[m.gender]].join(' ');
}

export function phaseLine(m: MatchSummary) {
  return [m.title, m.phase, m.group && `Grupo ${m.group}`].filter(Boolean).join(' · ');
}

/** Linha de contexto ao vivo abaixo do placar (set atual, game, contagem...). */
export function liveContext(m: MatchSummary): string | null {
  if (m.status !== 'LIVE') return null;
  const s = m.score;
  if (s.tennis && s.tennis.game[0] !== '') return `${s.tennis.game[0]}–${s.tennis.game[1]}${s.tennis.tiebreak ? ' · TB' : ''}`;
  if (s.baseball) return `${s.baseball.outs} out${s.baseball.outs === 1 ? '' : 's'} · ${s.baseball.balls}-${s.baseball.strikes}`;
  if (s.periods.length && m.live.phase === 'PERIOD' && (m.live.periodLabel.startsWith('Set') || m.live.periodLabel.startsWith('Game') || m.live.periodLabel.startsWith('Mapa') || m.live.periodLabel.startsWith('Partida'))) {
    const cur = s.periods[s.periods.length - 1];
    return `${m.live.periodLabel} · ${fmtScore(cur[0])}–${fmtScore(cur[1])}`;
  }
  return null;
}

export const isRanking = (m: MatchSummary) => !!m.score.ranking;
