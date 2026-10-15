import { describe, expect, it } from 'vitest';
import type { MatchSummary } from '@shared/types';
import { feedDays, initialDay, involves, liveTarget, matchFromHash, momentMatch, openingPoint } from './feed';
import { EMPTY_PROFILE, readProfile } from './profile';

let n = 0;
function m(p: Partial<MatchSummary>): MatchSummary {
  n++;
  return {
    id: `m${n}`,
    tournamentId: 't',
    sportId: 'futebol',
    gender: 'M',
    scheduledAt: '2026-10-10T14:00:00-03:00',
    status: 'SCHEDULED',
    homeId: 'a',
    awayId: 'b',
    score: { home: 0, away: 0, periods: [] },
    live: { phase: 'PRE', period: 0, isOvertime: false, periodLabel: '', shortLabel: '', clock: null, nextActions: [], suggestEnd: false },
    winner: null,
    wo: null,
    manual: false,
    seq: 0,
    updatedAt: 0,
    isSandbox: false,
    ...p,
  };
}

describe('jogo do momento', () => {
  it('prefere o que está ao vivo', () => {
    const a = m({ status: 'FINISHED', updatedAt: 9 });
    const b = m({ status: 'LIVE', scheduledAt: '2026-10-10T16:00:00-03:00' });
    const c = m({ status: 'SCHEDULED', scheduledAt: '2026-10-10T09:00:00-03:00' });
    expect(momentMatch([a, b, c])?.id).toBe(b.id);
  });

  it('entre vários ao vivo, prefere a atlética e depois o esporte do torcedor', () => {
    const outro = m({ status: 'LIVE', homeId: 'x', awayId: 'y', scheduledAt: '2026-10-10T08:00:00-03:00' });
    const esporte = m({ status: 'LIVE', homeId: 'x', awayId: 'y', sportId: 'volei' });
    const meu = m({ status: 'LIVE', homeId: 'caaso', awayId: 'y', scheduledAt: '2026-10-10T20:00:00-03:00' });
    expect(momentMatch([outro, esporte, meu], { atleticaId: 'caaso', sportIds: ['volei'] })?.id).toBe(meu.id);
    expect(momentMatch([outro, esporte], { sportIds: ['volei'] })?.id).toBe(esporte.id);
    expect(momentMatch([outro, esporte])?.id).toBe(outro.id); // sem preferência: o que começou antes
  });

  it('sem ao vivo, fica no último que terminou', () => {
    const cedo = m({ status: 'FINISHED', updatedAt: 100 });
    const tarde = m({ status: 'FINISHED', updatedAt: 500 });
    const depois = m({ status: 'SCHEDULED' });
    expect(momentMatch([cedo, tarde, depois])?.id).toBe(tarde.id);
  });

  it('nada jogado ainda: primeiro do dia', () => {
    const b = m({ scheduledAt: '2026-10-10T18:00:00-03:00' });
    const a = m({ scheduledAt: '2026-10-10T08:30:00-03:00' });
    expect(momentMatch([b, a])?.id).toBe(a.id);
    expect(momentMatch([])).toBeNull();
  });
});

describe('dias do feed', () => {
  it('cobre o período do torneio, os dias com jogo e hoje', () => {
    const days = feedDays([m({ scheduledAt: '2026-10-20T10:00:00-03:00' })], { startsAt: '2026-10-09T12:00:00-03:00', endsAt: '2026-10-11T22:00:00-03:00' }, '2026-10-15');
    expect(days).toEqual(['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-15', '2026-10-20']);
  });

  it('abre em hoje se tiver jogo, senão no próximo, senão no último', () => {
    const days = ['2026-10-09', '2026-10-10', '2026-10-15', '2026-10-20'];
    expect(initialDay(days, (d) => (d === '2026-10-15' ? 2 : 1), '2026-10-15')).toBe('2026-10-15');
    expect(initialDay(days, (d) => (d === '2026-10-20' ? 1 : 0), '2026-10-15')).toBe('2026-10-20');
    expect(initialDay(days, (d) => (d === '2026-10-10' ? 1 : 0), '2026-10-15')).toBe('2026-10-10');
    expect(initialDay(days, () => 0, '2026-10-15')).toBe('2026-10-15');
  });

  it('dia é contado no fuso de São Paulo (jogo 23h não pula de dia)', () => {
    expect(feedDays([m({ scheduledAt: '2026-10-10T23:30:00-03:00' })], null, '2026-10-10')).toEqual(['2026-10-10']);
  });
});

describe('abertura do feed', () => {
  const days = ['2026-10-14', '2026-10-15'];
  it('jogo ao vivo de ontem (virou meia-noite) ganha de hoje', () => {
    const live = m({ status: 'LIVE', scheduledAt: '2026-10-14T23:40:00-03:00' });
    const hoje = m({ status: 'FINISHED', scheduledAt: '2026-10-15T00:05:00-03:00' });
    expect(openingPoint([live, hoje], days, '2026-10-15')).toEqual({ day: '2026-10-14', matchId: live.id });
  });
  it('link compartilhado (#jogo-…) manda em tudo', () => {
    const live = m({ status: 'LIVE', scheduledAt: '2026-10-15T10:00:00-03:00' });
    const old = m({ status: 'FINISHED', scheduledAt: '2026-10-14T10:00:00-03:00' });
    expect(openingPoint([live, old], days, '2026-10-15', {}, old.id)).toEqual({ day: '2026-10-14', matchId: old.id });
  });
  it('sem ao vivo: dia inicial e o jogo do momento dele', () => {
    const a = m({ status: 'FINISHED', updatedAt: 1, scheduledAt: '2026-10-15T09:00:00-03:00' });
    const b = m({ status: 'SCHEDULED', scheduledAt: '2026-10-15T15:00:00-03:00' });
    expect(openingPoint([a, b], days, '2026-10-15')).toEqual({ day: '2026-10-15', matchId: a.id });
  });
});

describe('botão do ao vivo e atlética', () => {
  it('só aparece com jogo ao vivo', () => {
    expect(liveTarget([m({ status: 'FINISHED' }), m({})])).toBeNull();
    const live = m({ status: 'LIVE' });
    expect(liveTarget([m({}), live])?.id).toBe(live.id);
  });

  it('reconhece a atlética em confrontos e provas', () => {
    expect(involves(m({ homeId: 'caaso' }), 'caaso')).toBe(true);
    expect(involves(m({ homeId: null, awayId: null, participantIds: ['x', 'caaso'] }), 'caaso')).toBe(true);
    expect(involves(m({}), null)).toBe(false);
  });

  it('lê o id do jogo da âncora #jogo-…', () => {
    expect(matchFromHash('#jogo-abc123')).toBe('abc123');
    expect(matchFromHash('#outra')).toBeNull();
  });
});

describe('perfil no localStorage', () => {
  const store = (v: string | null) => ({ getItem: () => v });
  it('sem nada salvo, começa vazio (abre as boas-vindas)', () => {
    expect(readProfile(store(null))).toEqual(EMPTY_PROFILE);
  });
  it('ignora lixo e versões desconhecidas', () => {
    expect(readProfile(store('{quebrado'))).toEqual(EMPTY_PROFILE);
    expect(readProfile(store('{"v":9,"atleticaId":"x"}'))).toEqual(EMPTY_PROFILE);
  });
  it('lê o que o questionário gravou', () => {
    const p = readProfile(store(JSON.stringify({ v: 1, atleticaId: 'caaso', sportIds: ['futebol', 3], onlyMine: true, onboarded: true })));
    expect(p).toEqual({ v: 1, atleticaId: 'caaso', sportIds: ['futebol'], onlyMine: true, onboarded: true });
  });
});
