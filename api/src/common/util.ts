import { BadRequestException } from '@nestjs/common';
import type { z, ZodTypeAny } from 'zod';

/** Valida o corpo com zod e devolve 400 com a primeira mensagem legível. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    const path = issue.path.join('.');
    throw new BadRequestException(path ? `${path}: ${issue.message}` : issue.message);
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
