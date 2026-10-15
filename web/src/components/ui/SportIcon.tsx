// Ícones de modalidade desenhados no mesmo traço (24px, stroke 1.75) —
// as bibliotecas genéricas não têm bola de futebol, peteca, rugby etc.
import type { SVGProps } from 'react';

const P: Record<string, JSX.Element> = {
  soccer: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.6l3.7 2.7-1.4 4.4H9.7l-1.4-4.4z" />
      <path d="M12 3v4.6M20.6 9.3l-4.9 1M17.3 19.3l-3-4.6M6.7 19.3l3-4.6M3.4 9.3l4.9 1" />
    </>
  ),
  basketball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3v18M5.7 5.6c3.1 2.6 3.1 10.2 0 12.8M18.3 5.6c-3.1 2.6-3.1 10.2 0 12.8" />
    </>
  ),
  volleyball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 12c0-4.2 1.6-7 4.6-8.3M12 12c3.6 2.1 5.6 5 6 7.2M12 12c-3.7 2-7.3 2.1-9 1.1M7.2 4.4C9.3 7 10 9.2 12 12" />
    </>
  ),
  'beach-volleyball': (
    <>
      <circle cx="12" cy="10" r="7" />
      <path d="M12 10c0-3.2 1.2-5.4 3.6-6.4M12 10c2.8 1.6 4.3 3.8 4.6 5.5M12 10c-2.9 1.6-5.6 1.6-7 .9" />
      <path d="M3 21c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1" />
    </>
  ),
  tennis: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.7 5.6c3.4 3.4 3.4 9.4 0 12.8M18.3 5.6c-3.4 3.4-3.4 9.4 0 12.8" />
    </>
  ),
  'table-tennis': (
    <>
      <path d="M13.8 4.2a6.3 6.3 0 0 1 0 8.9l-2.1 2.1a2 2 0 0 1-2.8 0L7.3 13.6a2 2 0 0 1 0-2.8l2.1-2.1" />
      <path d="M9.4 8.7a6.3 6.3 0 0 1 4.4-4.5" />
      <path d="M10.3 14.6l-5.6 5.6a1.4 1.4 0 0 1-2-2l5.6-5.6" />
      <circle cx="18.5" cy="17.5" r="2" />
    </>
  ),
  badminton: (
    <>
      <path d="M8.5 13.5L4 4l5.2 2.8L12 3l2.8 3.8L20 4l-4.5 9.5" />
      <path d="M8.5 13.5h7" />
      <path d="M8.5 13.5a3.5 3.5 0 0 0 7 0" />
      <path d="M9.2 6.8l2.3 6.7M14.8 6.8l-2.3 6.7" />
    </>
  ),
  baseball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M6 5.3c2.6 3.6 2.6 9.8 0 13.4M18 5.3c-2.6 3.6-2.6 9.8 0 13.4" />
      <path d="M7.4 8.4l1.4-.6M7.9 11.2l1.5-.2M7.9 14l1.5.2M7.4 16.8l1.4.6M16.6 8.4l-1.4-.6M16.1 11.2l-1.5-.2M16.1 14l-1.5.2M16.6 16.8l-1.4.6" />
    </>
  ),
  'american-football': (
    <>
      <path d="M4.3 19.7C3 13.4 7.4 5.6 19.7 4.3 21 10.6 16.6 18.4 4.3 19.7z" />
      <path d="M8.2 15.8l7.6-7.6M10.6 11.4l2 2M12.2 9.8l2 2M9 13l2 2" />
      <path d="M5.6 13.2l5.2 5.2M13.2 5.6l5.2 5.2" />
    </>
  ),
  rugby: (
    <>
      <ellipse cx="12" cy="12" rx="9.5" ry="6" transform="rotate(-35 12 12)" />
      <path d="M6.6 16.8c4-1.4 8.6-6 10-10" />
    </>
  ),
  handball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3c-2.3 3.2-2.3 14.8 0 18M3.6 9.2c5.2 1.6 11.6 1.6 16.8 0M3.6 14.8c5.2-1.6 11.6-1.6 16.8 0" />
    </>
  ),
  hockey: (
    <>
      <path d="M15.5 2.5L9 17a3 3 0 0 1-2.7 1.8H3" />
      <ellipse cx="17" cy="19" rx="4" ry="1.8" />
    </>
  ),
  'water-polo': (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M12 3.5c-1.2 2-1.2 9 0 11M6.8 7.4c3.4.9 7 .9 10.4 0" />
      <path d="M2.5 19c1.6 0 1.6-1 3.2-1s1.6 1 3.2 1 1.6-1 3.1-1 1.6 1 3.2 1 1.6-1 3.2-1 1.6 1 3.1 1" />
    </>
  ),
  swimming: (
    <>
      <circle cx="17.5" cy="6.5" r="2" />
      <path d="M3 13.5l5.5-3.4 3 2.4 3.5-2" />
      <path d="M8.5 10.1L7 6.5l4-1.5" />
      <path d="M2.5 18c1.6 0 1.6-1 3.2-1s1.6 1 3.2 1 1.6-1 3.1-1 1.6 1 3.2 1 1.6-1 3.2-1 1.6 1 3.1 1" />
    </>
  ),
  athletics: (
    <>
      <circle cx="14.5" cy="4.5" r="1.9" />
      <path d="M7 21l3.6-5.6 3.2 2.2V22" />
      <path d="M5.5 11.4L9.3 8.6l4.3.4 2.3 3.4 3.3.6" />
      <path d="M10.6 15.4L13.6 9" />
    </>
  ),
  chess: (
    <>
      <circle cx="12" cy="5.5" r="2.5" />
      <path d="M9.3 10h5.4M10 10c0 3-1.3 5-2.4 7.2h8.8C15.3 15 14 13 14 10" />
      <path d="M6 20.5h12" />
    </>
  ),
  combat: (
    <>
      <path d="M7 12V7.5A3.5 3.5 0 0 1 10.5 4h3A4.5 4.5 0 0 1 18 8.5v3.8A6.7 6.7 0 0 1 11.3 19H9" />
      <path d="M7 12a2.4 2.4 0 0 0 0 4.8h4" />
      <path d="M9 19v2.5h6V19" />
      <path d="M11 8.2h4" />
    </>
  ),
  boxing: (
    <>
      <path d="M6.5 11.5V8a4 4 0 0 1 4-4h2.8A4.7 4.7 0 0 1 18 8.7v3a6.3 6.3 0 0 1-6.3 6.3H9.8" />
      <path d="M6.5 11.5a2.6 2.6 0 0 0 .3 5.2H11" />
      <rect x="8.8" y="18" width="6.4" height="3.5" rx="1" />
    </>
  ),
  esports: (
    <>
      <path d="M6.5 7.5h11a4.3 4.3 0 0 1 4.1 5.5l-1 3.4a2.6 2.6 0 0 1-4.4 1.1L14.5 16h-5l-1.7 1.5a2.6 2.6 0 0 1-4.4-1.1l-1-3.4a4.3 4.3 0 0 1 4.1-5.5z" />
      <path d="M8 10.5v3.5M6.25 12.25h3.5" />
      <circle cx="15.8" cy="11" r=".9" fill="currentColor" stroke="none" />
      <circle cx="17.8" cy="13" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  frisbee: (
    <>
      <ellipse cx="12" cy="11" rx="9.5" ry="4.5" />
      <path d="M2.5 11v1.5c0 2.5 4.3 4.5 9.5 4.5s9.5-2 9.5-4.5V11" />
      <ellipse cx="12" cy="10.6" rx="4.5" ry="1.8" />
    </>
  ),
  dodgeball: (
    <>
      <circle cx="14" cy="12" r="6.5" />
      <path d="M2.5 9h4M1.5 12.5h4M3 16h3.5" />
      <path d="M10 7.8c2.3 1.4 2.3 7 0 8.4" />
    </>
  ),
  cheer: (
    <>
      <path d="M12 2.8l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.3l-5.3 2.8 1.1-5.9L3.4 9.1l6-.8z" />
    </>
  ),
  archery: (
    <>
      <circle cx="11" cy="13" r="8" />
      <circle cx="11" cy="13" r="4.5" />
      <circle cx="11" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <path d="M11 13l9.5-9.5M17.5 3.5h3v3" />
    </>
  ),
  generic: (
    <>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4.5v1.5A3.5 3.5 0 0 0 8 11M17 6h2.5v1.5A3.5 3.5 0 0 1 16 11" />
    </>
  ),
};
P.futsal = P.soccer;

export const SPORT_ICON_KEYS = Object.keys(P);

export function SportIcon({ name, size = 18, strokeWidth = 1.75, ...rest }: { name?: string; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {P[name ?? 'generic'] ?? P.generic}
    </svg>
  );
}
