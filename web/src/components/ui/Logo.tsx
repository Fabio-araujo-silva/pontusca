// Marca: degraus de arquibancada + o ponto vermelho do "ao vivo".
export function LogoMark({ size = 28, inverted }: { size?: number; inverted?: boolean }) {
  const bg = inverted ? '#ffffff' : '#111114';
  const fg = inverted ? '#111114' : '#ffffff';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="15" fill={bg} />
      <path d="M13 45h38M18 36.5h28M23 28h18" stroke={fg} strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="47" cy="17" r="5.5" fill="#e0261d" />
    </svg>
  );
}

export function Logo({ size = 28, sub }: { size?: number; sub?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="leading-none">
        <span className="block font-display text-[25px] uppercase leading-[0.85]">Arquibancada</span>
        {sub && <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-mute">{sub}</span>}
      </span>
    </span>
  );
}
