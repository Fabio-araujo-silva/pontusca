// Motor RANKING: provas sem confronto direto (natação, atletismo, cheerleading).
// Cada participante recebe um RESULT; a classificação sai ordenada pela marca.
import type { Highlight, LifecycleAction, LivePhase, MatchCommand, RankingRow, TimelineItem } from '../types';
import { DraftEvent, EngineError, EngineInput, EngineOutput, lifecycleItem } from './common';

export function formatMark(value: number | null | undefined, format: 'time' | 'decimal' | 'integer', unit: string): string {
  if (value == null || Number.isNaN(value)) return '—';
  if (format === 'time') {
    const m = Math.floor(value / 60);
    const s = value - m * 60;
    const ss = s.toFixed(2).padStart(5, '0');
    return m > 0 ? `${m}:${ss}` : `${s.toFixed(2)}s`;
  }
  if (format === 'integer') return `${Math.round(value)} ${unit}`;
  return `${value.toFixed(2).replace('.', ',')} ${unit}`;
}

/** Aceita "1:02.35", "62.35", "62,35", "6,45". */
export function parseMark(raw: string | number): number | null {
  if (typeof raw === 'number') return raw;
  const t = String(raw).trim().replace(',', '.');
  if (!t) return null;
  if (t.includes(':')) {
    const parts = t.split(':').map(Number);
    if (parts.some((p) => Number.isNaN(p))) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

export function reduceRanking(input: EngineInput): EngineOutput {
  const R = input.config.ranking ?? { order: 'asc', format: 'time', unit: 's', resultLabel: 'Tempo' };
  const parts = input.participants ?? [];
  let phase = 'PRE' as LivePhase; // cast: closures mudam a fase e o TS não rastreia
  const results = new Map<string, { value: number | null; status: RankingRow['status'] }>();
  const timeline: TimelineItem[] = [];
  let highlight: Highlight | null = null;

  for (const ev of input.events) {
    highlight = null;
    switch (ev.type) {
      case 'MATCH_START':
        phase = 'PERIOD';
        timeline.push(lifecycleItem(ev, 'Largada!'));
        highlight = { type: 'start', label: 'VALENDO!' };
        break;
      case 'RESULT': {
        const pid = ev.payload.participantId;
        const p = parts.find((x) => x.id === pid);
        if (!p) break;
        const status = (ev.payload.status ?? 'OK') as RankingRow['status'];
        const value = status === 'OK' ? (ev.payload.value ?? null) : null;
        results.set(pid, { value, status });
        timeline.push({
          id: ev.id,
          seq: ev.seq,
          type: ev.type,
          icon: 'result',
          title: p.athleteName ? p.athleteName : 'Resultado',
          subtitle: status === 'OK' ? formatMark(value, R.format, R.unit) : status,
          at: ev.at,
          important: true,
          side: null,
        });
        highlight = { type: 'result', label: status === 'OK' ? formatMark(value, R.format, R.unit) : String(status), athleteName: p.athleteName };
        break;
      }
      case 'MATCH_END':
        phase = 'END';
        timeline.push(lifecycleItem(ev, 'Resultado oficial', { icon: 'flag' }));
        highlight = { type: 'end', label: 'RESULTADO FINAL', big: true };
        break;
      case 'NOTE':
        timeline.push({ id: ev.id, seq: ev.seq, type: ev.type, icon: 'note', title: String(ev.payload.text ?? ''), at: ev.at });
        break;
      default:
        break;
    }
  }

  const rows: RankingRow[] = parts.map((p) => {
    const r = results.get(p.id);
    return {
      participantId: p.id,
      institutionId: p.institutionId,
      athleteName: p.athleteName ?? null,
      lane: p.lane ?? null,
      value: r?.value ?? null,
      status: r?.status ?? null,
      result: r ? (r.status === 'OK' ? formatMark(r.value, R.format, R.unit) : r.status) : null,
      position: null,
    };
  });
  const ranked = rows.filter((r) => r.status === 'OK' && r.value != null).sort((a, b) => (R.order === 'asc' ? a.value! - b.value! : b.value! - a.value!));
  ranked.forEach((r, i) => {
    r.position = i > 0 && ranked[i - 1].value === r.value ? ranked[i - 1].position : i + 1;
  });
  const rest = rows.filter((r) => !ranked.includes(r)).sort((a, b) => (a.lane ?? 99) - (b.lane ?? 99));

  const next: LifecycleAction[] = [];
  if (phase === 'PRE') next.push('START_MATCH');
  else if (phase === 'PERIOD') next.push('END_MATCH');

  return {
    status: phase === 'PRE' ? 'SCHEDULED' : phase === 'END' ? 'FINISHED' : 'LIVE',
    score: { home: 0, away: 0, periods: [], ranking: [...ranked, ...rest] },
    live: {
      phase,
      period: phase === 'PRE' ? 0 : 1,
      isOvertime: false,
      periodLabel: phase === 'PERIOD' ? 'Em andamento' : phase === 'END' ? 'Encerrado' : 'Pré-prova',
      shortLabel: phase === 'PERIOD' ? 'AO VIVO' : phase === 'END' ? 'FIM' : '',
      clock: null,
      nextActions: next,
      suggestEnd: phase === 'PERIOD' && parts.length > 0 && results.size >= parts.length,
    },
    winner: null,
    wo: null,
    timeline,
    stats: [],
    highlight,
  };
}

export function buildRanking(input: EngineInput, out: EngineOutput, cmd: MatchCommand): DraftEvent {
  if (cmd.type !== 'RESULT') throw new EngineError('Comando não suportado nesta modalidade.');
  if (out.live.phase !== 'PERIOD') throw new EngineError('A prova não está em andamento.');
  const p = cmd.payload ?? {};
  if (!(input.participants ?? []).some((x) => x.id === p.participantId)) throw new EngineError('Participante não encontrado.');
  const status = ['OK', 'DNF', 'DQ', 'DNS'].includes(p.status) ? p.status : 'OK';
  const value = status === 'OK' ? parseMark(p.value) : null;
  if (status === 'OK' && value == null) throw new EngineError('Marca inválida. Ex.: 12.45 ou 1:02.35');
  return { type: 'RESULT', payload: { participantId: p.participantId, value, status } };
}
