// Marca PONTUSCA: ".T" — o T pesado e arredondado (pegada do wordmark do TUSCA)
// com o ponto laranja da paleta TUSCA 2026 na linha de base.
const T_PATH = 'M23 12h29a4.5 4.5 0 0 1 4.5 4.5v5a4.5 4.5 0 0 1-4.5 4.5h-7v22a4.5 4.5 0 0 1-4.5 4.5h-5a4.5 4.5 0 0 1-4.5-4.5V26h-8a4.5 4.5 0 0 1-4.5-4.5v-5A4.5 4.5 0 0 1 23 12z';

export function LogoMark({ size = 28, inverted }: { size?: number; inverted?: boolean }) {
  const bg = inverted ? '#ffffff' : '#0b0b0d';
  const fg = inverted ? '#0b0b0d' : '#ffffff';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="15" fill={bg} />
      <path d={T_PATH} fill={fg} />
      <circle cx="13" cy="46" r="6.5" fill="#ff8a15" />
    </svg>
  );
}

export function Logo({ size = 28, sub }: { size?: number; sub?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="leading-none">
        <span className="block font-display text-[26px] uppercase leading-[0.85] tracking-[0.01em]">Pontusca</span>
        {sub && <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-mute">{sub}</span>}
      </span>
    </span>
  );
}
