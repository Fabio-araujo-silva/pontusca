import type { Gender } from '@shared/types';

export const TZ = 'America/Sao_Paulo';

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hmFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const wdFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short' });
const dmFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: 'numeric', month: 'short' });
const longFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const shortFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** "2026-10-14" no fuso de São Paulo. */
export const dayKey = (d: Date | string | number) => dayFmt.format(new Date(d));
export const timeHM = (d: Date | string | number) => hmFmt.format(new Date(d));
export const longDate = (d: Date | string | number) => cap(longFmt.format(new Date(d)));
export const shortDateTime = (d: Date | string | number) => shortFmt.format(new Date(d));

export function addDays(key: string, n: number) {
  const d = new Date(`${key}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return dayKey(d);
}

export function dayChip(key: string, today: string) {
  const d = new Date(`${key}T12:00:00-03:00`);
  const diff = Math.round((d.getTime() - new Date(`${today}T12:00:00-03:00`).getTime()) / 86400_000);
  const top = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : diff === -1 ? 'Ontem' : wdFmt.format(d).replace('.', '');
  return { top: cap(top), bottom: dmFmt.format(d).replace('.', '').replace(' de ', ' '), diff };
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 0.5 -> "½", 2.5 -> "2½" (xadrez). */
export function fmtScore(n: number | null | undefined) {
  if (n == null) return '–';
  if (Number.isInteger(n)) return String(n);
  const f = Math.abs(n % 1);
  if (Math.abs(f - 0.5) < 0.01) return `${Math.trunc(n) || ''}½`;
  return n.toFixed(1).replace('.', ',');
}

export const GENDER: Record<Gender, string> = { M: 'Masculino', F: 'Feminino', X: 'Misto' };
export const GENDER_SHORT: Record<Gender, string> = { M: 'Masc.', F: 'Fem.', X: 'Misto' };

// ---------------------------------------------------------------- cores

export function hexToRgb(hex: string) {
  const h = (hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Cor de texto legível sobre a cor da atlética. */
export const onColor = (hex: string) => (luminance(hex) > 0.42 ? '#0b0b0c' : '#ffffff');

export function mix(hex: string, other: string, t: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(other);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export const alpha = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/** Cor da atlética "visível" sobre fundo escuro (clareia as muito escuras). */
export const visibleOnDark = (hex: string) => (luminance(hex) < 0.05 ? mix(hex, '#ffffff', 0.38) : hex);

/** Escolhe entre primária/secundária a que aparece melhor no escuro. */
export function teamTone(primary: string, secondary: string) {
  return luminance(primary) < 0.05 && luminance(secondary) > luminance(primary) ? secondary : primary;
}
