import type { EngineOutput } from '@shared/engine';
import type { EngineEvent, InstitutionDTO, MatchDetail, Side, SportConfig } from '@shared/types';
import type { Cmd } from './types';

export interface PickOpts {
  title: string;
  subtitle?: string;
  optional: boolean;
  preferred?: Set<string>;
  preferredLabel?: string;
  otherLabel?: string;
}

/** Tudo que um painel de modalidade precisa. */
export interface PanelCtx {
  out: EngineOutput;
  cfg: SportConfig;
  events: EngineEvent[];
  detail: MatchDetail;
  home: InstitutionDTO | null;
  away: InstitutionDTO | null;
  disabled: boolean;
  sportIcon: string;
  send: (c: Cmd) => boolean;
  /** undefined = cancelou; null = sem atleta */
  pickAthlete: (side: Side, opts: PickOpts) => Promise<string | null | undefined>;
}
