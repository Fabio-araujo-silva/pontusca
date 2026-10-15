import { BadRequestException } from '@nestjs/common';
import type { z, ZodIssue, ZodTypeAny } from 'zod';

// nome dos campos como a pessoa vê na tela
const FIELD: Record<string, string> = {
  scheduledAt: 'Data e hora',
  tournamentId: 'Torneio',
  sportId: 'Modalidade',
  gender: 'Naipe',
  homeId: 'Mandante',
  awayId: 'Visitante',
  name: 'Nome',
  email: 'E-mail',
  password: 'Senha',
  phone: 'Telefone',
  venue: 'Local',
  title: 'Nome da prova',
  notes: 'Observações',
  points: 'Pontos',
  reason: 'Motivo',
  number: 'Número',
};

/** Mensagem do zod (em inglês) -> português. Mensagens próprias do schema passam direto. */
function ptMessage(i: ZodIssue): string {
  switch (i.code) {
    case 'invalid_type':
      return i.received === 'undefined' || i.received === 'null' ? 'obrigatório' : 'valor inválido';
    case 'invalid_string':
      return i.validation === 'datetime' ? 'data/hora inválida' : i.validation === 'email' ? 'e-mail inválido' : 'formato inválido';
    case 'too_small':
      return i.type === 'string' ? (Number(i.minimum) <= 1 ? 'não pode ficar vazio' : `mínimo de ${i.minimum} caracteres`) : i.type === 'array' ? `escolha pelo menos ${i.minimum}` : `mínimo ${i.minimum}`;
    case 'too_big':
      return i.type === 'string' ? `máximo de ${i.maximum} caracteres` : i.type === 'array' ? `no máximo ${i.maximum} itens` : `máximo ${i.maximum}`;
    case 'invalid_enum_value':
      return 'opção inválida';
    default:
      return i.message;
  }
}

/** Valida o corpo com zod e devolve 400 com a primeira mensagem legível (em português). */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    const custom = issue.code === 'custom' || !/^(Required|Invalid|Expected|String must|Number must|Array must)/.test(issue.message);
    const msg = custom ? issue.message : ptMessage(issue);
    const key = issue.path.filter((p) => typeof p === 'string').pop() as string | undefined;
    const label = key ? (FIELD[key] ?? key) : '';
    throw new BadRequestException(label ? `${label}: ${msg}` : msg);
  }
  return r.data;
}

export function json<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Garante slug único acrescentando -2, -3... */
export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>) {
  const root = slugify(base) || 'item';
  let slug = root;
  let i = 2;
  while (await exists(slug)) slug = `${root}-${i++}`;
  return slug;
}

export const HEX = /^#[0-9a-fA-F]{6}$/;
