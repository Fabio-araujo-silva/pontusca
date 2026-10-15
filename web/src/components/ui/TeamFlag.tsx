// "Bandeira" da atlética: logo enviada pelo admin ou um brasão gerado com as
// cores e o padrão escolhido (listras, diagonal, chevron...).
import { useId } from 'react';
import type { FlagPattern, InstitutionDTO } from '@shared/types';
import { onColor } from '@/lib/format';

type Inst = Pick<InstitutionDTO, 'name' | 'primaryColor' | 'secondaryColor' | 'flagPattern'> & Partial<Pick<InstitutionDTO, 'logo' | 'accentColor'>>;

export function initials(name: string) {
  const n = name.trim();
  if (n.length <= 5) return n.toUpperCase();
  const words = n.split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w));
  if (words.length > 1) return words.map((w) => w[0]).join('').slice(0, 4).toUpperCase();
  return n.slice(0, 3).toUpperCase();
}

/** Desenho do padrão num viewBox 0 0 W H. */
export function FlagPatternShapes({ pattern, p, s, a, w, h }: { pattern: FlagPattern; p: string; s: string; a?: string | null; w: number; h: number }) {
  const third = w / 3;
  switch (pattern) {
    case 'stripes':
      return (
        <>
          <rect width={w} height={h} fill={p} />
          <rect x={third} width={third} height={h} fill={s} />
        </>
      );
    case 'diagonal':
      return (
        <>
          <rect width={w} height={h} fill={p} />
          <path d={`M${-w * 0.1} ${h * 0.78} L${w * 0.78} ${-h * 0.1} L${w * 1.1} ${h * 0.22} L${w * 0.22} ${h * 1.1} Z`} fill={s} />
          {a && <path d={`M${-w * 0.1} ${h * 0.98} L${w * 0.98} ${-h * 0.1} L${w * 1.1} ${h * 0.02} L${w * 0.02} ${h * 1.1} Z`} fill={a} opacity={0.9} />}
        </>
      );
    case 'chevron':
      return (
        <>
          <rect width={w} height={h} fill={p} />
          <path d={`M0 ${h * 0.18} L${w / 2} ${h * 0.58} L${w} ${h * 0.18} L${w} ${h * 0.46} L${w / 2} ${h * 0.86} L0 ${h * 0.46} Z`} fill={s} />
        </>
      );
    case 'split':
      return (
        <>
          <rect width={w} height={h} fill={p} />
          <path d={`M${w} 0 L${w} ${h} L0 ${h} Z`} fill={s} />
        </>
      );
    case 'cross':
      return (
        <>
          <rect width={w} height={h} fill={p} />
          <rect x={w * 0.3} width={w * 0.16} height={h} fill={s} />
          <rect y={h * 0.42} width={w} height={h * 0.16} fill={s} />
        </>
      );
    default:
      return (
        <>
          <rect width={w} height={h} fill={p} />
          <rect y={h * 0.82} width={w} height={h * 0.18} fill={s} />
        </>
      );
  }
}

export function TeamFlag({
  inst,
  size = 36,
  shape = 'crest',
  showInitials = true,
  className = '',
}: {
  inst: Inst;
  size?: number;
  shape?: 'crest' | 'flag' | 'square';
  showInitials?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const w = shape === 'flag' ? 150 : 100;
  const h = 100;
  const pxW = shape === 'flag' ? size * 1.5 : size;
  const radius = shape === 'crest' ? 50 : shape === 'square' ? 22 : 10;

  if (inst.logo) {
    return (
      <span
        className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${shape === 'crest' ? 'rounded-full' : 'rounded-[22%]'} ${className}`}
        style={{ width: pxW, height: size, background: inst.secondaryColor, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12)' }}
      >
        <img src={inst.logo} alt={inst.name} className="h-full w-full object-cover" draggable={false} />
      </span>
    );
  }

  const label = initials(inst.name);
  const fontSize = label.length >= 5 ? 26 : label.length === 4 ? 30 : label.length === 3 ? 36 : 44;
  const text = onColor(inst.primaryColor);
  return (
    <svg width={pxW} height={size} viewBox={`0 0 ${w} ${h}`} className={`shrink-0 ${className}`} role="img" aria-label={inst.name}>
      <defs>
        <clipPath id={`c${id}`}>
          <rect width={w} height={h} rx={radius} />
        </clipPath>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#c${id})`}>
        <FlagPatternShapes pattern={inst.flagPattern} p={inst.primaryColor} s={inst.secondaryColor} a={inst.accentColor} w={w} h={h} />
        <rect width={w} height={h} fill={`url(#g${id})`} />
        {showInitials && (
          <text
            x={w / 2}
            y={h / 2}
            dy="0.36em"
            textAnchor="middle"
            fontFamily="'Barlow Condensed', 'Inter Variable', sans-serif"
            fontWeight={800}
            fontSize={shape === 'flag' ? fontSize * 1.05 : fontSize}
            letterSpacing="0.5"
            fill={text}
            stroke={text === '#ffffff' ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.35)'}
            strokeWidth={2.5}
            paintOrder="stroke"
          >
            {label}
          </text>
        )}
      </g>
      <rect x="0.5" y="0.5" width={w - 1} height={h - 1} rx={radius} fill="none" stroke="rgba(255,255,255,.14)" />
    </svg>
  );
}
