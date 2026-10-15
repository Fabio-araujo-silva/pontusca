import type { ManualResult, ParticipantInfo } from '@shared/engine';
import type { EngineEvent, InstitutionDTO, MatchCommand, MatchDetail, MatchSummary, SportConfig, SportDTO, TournamentDTO } from '@shared/types';

export type StaffRole = 'primary' | 'backup' | 'admin';

export interface RosterItem {
  athleteId: string;
  name: string;
  nickname: string | null;
  number: number | null;
  position: string | null;
  inRoster: boolean;
}

export interface MesaMeta {
  role: StaffRole;
  canOperate: boolean;
  backupEnabled: boolean;
  sport: SportDTO;
  tournament: TournamentDTO | null;
  home: InstitutionDTO | null;
  away: InstitutionDTO | null;
  mesario: { id: string; name: string } | null;
  backup: { id: string; name: string } | null;
  roster: { home: RosterItem[]; away: RosterItem[] };
}

export interface EngineState {
  events: EngineEvent[];
  names: Record<string, string>;
  participants: ParticipantInfo[];
  manual: ManualResult | null;
  config: SportConfig;
}

export interface MesaMatch {
  detail: MatchDetail;
  engine: EngineState;
  meta: MesaMeta;
}

export interface MesaListItem {
  summary: MatchSummary;
  role: StaffRole;
  backupEnabled: boolean;
  canOperate: boolean;
  home?: InstitutionDTO | null;
  away?: InstitutionDTO | null;
}

/** Comando sem clientId (o hook gera). */
export type Cmd = Omit<MatchCommand, 'clientId'>;
