import type { Institution, Sport, Tournament } from '@prisma/client';
import type { FlagPattern, Gender, InstitutionDTO, SportConfig, SportDTO, TournamentDTO } from '../shared/types';
import { json } from './util';

export const toInstitution = (i: Institution): InstitutionDTO => ({
  id: i.id,
  name: i.name,
  fullName: i.fullName,
  university: i.university,
  city: i.city,
  slug: i.slug,
  primaryColor: i.primaryColor,
  secondaryColor: i.secondaryColor,
  accentColor: i.accentColor,
  flagPattern: i.flagPattern as FlagPattern,
  logo: i.logo,
  isSandbox: i.isSandbox,
});

export const toSport = (s: Sport): SportDTO => ({
  id: s.id,
  name: s.name,
  slug: s.slug,
  icon: s.icon,
  category: s.category as SportDTO['category'],
  engine: s.engine as SportDTO['engine'],
  config: json<SportConfig>(s.config, { engine: 'SCORE', allowDraw: true, actions: [] }),
  genders: s.genders.split(',').filter(Boolean) as Gender[],
  active: s.active,
  order: s.order,
});

export const toTournament = (t: Tournament): TournamentDTO => ({
  id: t.id,
  name: t.name,
  slug: t.slug,
  edition: t.edition,
  city: t.city,
  startsAt: t.startsAt?.toISOString() ?? null,
  endsAt: t.endsAt?.toISOString() ?? null,
  active: t.active,
  isSandbox: t.isSandbox,
  tiebreakers: json<string[]>(t.tiebreakers, ['POINTS']),
  color: t.color,
});
