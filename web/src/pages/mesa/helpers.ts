import type { EngineOutput } from '@shared/engine';
import type { EngineEvent, InstitutionDTO, LifecycleAction, PlayerView, Side, SportConfig } from '@shared/types';
import { FALLBACK_INST } from '@/lib/data';
import { onColor, teamTone, visibleOnDark } from '@/lib/format';

export const SIDES: Side[] = ['home', 'away'];
export const CRITICAL: LifecycleAction[] = ['START_MATCH', 'END_PERIOD', 'START_PERIOD', 'START_OVERTIME', 'START_SHOOTOUT', 'END_MATCH'];

/** Cores prontas de um lado: fundo do botão, texto sobre ele e tom visível no escuro. */
export function teamColors(inst: InstitutionDTO | null | undefined) {
  const i = inst ?? FALLBACK_INST;
  const bg = teamTone(i.primaryColor, i.secondaryColor);
  return { bg, fg: onColor(bg), tone: visibleOnDark(bg), inst: i };
}

const ord = (n: number) => `${n}º`;

export function actionLabel(a: LifecycleAction, out: EngineOutput, cfg: SportConfig): string {
  const L = out.live;
  const P = cfg.periods;
  switch (a) {
    case 'START_MATCH':
      return cfg.engine === 'RANKING' ? 'Iniciar prova' : 'Iniciar jogo';
    case 'END_PERIOD':
      if (L.nextActions.includes('END_MATCH')) return cfg.shootout && !cfg.overtime ? 'Fim do tempo · ir pros pênaltis' : 'Fim do tempo · prorrogação/pênaltis';
      return `Encerrar ${L.periodLabel.toLowerCase()}`;
    case 'START_PERIOD': {
      if (cfg.engine === 'SETS') return `Abrir ${(cfg.sets?.label ?? 'set').toLowerCase()} ${L.period + 1}`;
      const next = L.period + 1;
      if (P && next <= P.count) return `Iniciar ${ord(next)} ${P.label.toLowerCase()}`;
      const ot = cfg.overtime;
      if (ot) return ot.count > 1 ? `Iniciar ${ord(next - (P?.count ?? 0))} ${ot.label.toLowerCase()}` : `Iniciar ${ot.label.toLowerCase()}`;
      return 'Iniciar próximo período';
    }
    case 'START_OVERTIME':
      return cfg.overtime?.label ?? 'Prorrogação';
    case 'START_SHOOTOUT':
      return cfg.shootout?.label ?? 'Pênaltis';
    case 'END_MATCH':
      return cfg.engine === 'RANKING' ? 'Encerrar prova' : 'Encerrar jogo';
    case 'PAUSE_CLOCK':
      return 'Pausar relógio';
    case 'RESUME_CLOCK':
      return 'Retomar relógio';
  }
}

export function actionHint(a: LifecycleAction, out: EngineOutput, cfg: SportConfig): string {
  switch (a) {
    case 'START_MATCH':
      return cfg.periods?.clock && cfg.periods.clock !== 'none'
        ? 'O placar vai ao ar AO VIVO para todo mundo e o relógio começa a correr agora.'
        : 'O placar vai ao ar AO VIVO para todo mundo.';
    case 'END_PERIOD':
      return `O relógio para e o placar público passa a mostrar "${out.live.nextActions.includes('END_MATCH') ? 'fim do tempo normal' : (cfg.periods?.breakLabel ?? 'intervalo').toLowerCase()}".`;
    case 'START_PERIOD':
    case 'START_OVERTIME':
      return cfg.engine === 'SETS' ? 'O novo set começa zerado.' : 'O relógio zera e começa a correr agora.';
    case 'START_SHOOTOUT':
      return 'Registre cada cobrança, alternando os lados.';
    case 'END_MATCH':
      return cfg.engine === 'RANKING' ? 'A classificação vira resultado oficial e entra na pontuação do torneio.' : 'O jogo sai de "Ao vivo" e o resultado entra na classificação do torneio.';
    default:
      return '';
  }
}

/** Quem está em quadra agora: titulares ± substituições registradas. */
export function onField(lineup: PlayerView[], events: EngineEvent[], side: Side) {
  const set = new Set(lineup.filter((p) => p.starter).map((p) => p.athleteId));
  for (const e of events) {
    if (e.type !== 'ACTION' || e.side !== side || e.payload?.kind !== 'sub') continue;
    if (e.athleteId) set.delete(e.athleteId);
    if (e.athlete2Id) set.add(e.athlete2Id);
  }
  return set;
}

export const shortName = (n: string) => {
  const parts = n.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : n;
};
