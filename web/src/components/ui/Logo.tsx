export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#15161a" />
      <path d="M12 44h40M16 36h32M20 28h24" stroke="#d7ff3e" strokeWidth="5" strokeLinecap="round" />
      <circle cx="46" cy="16" r="5" fill="#ff3b30" />
    </svg>
  );
}

export function Logo({ size = 28, sub }: { size?: number; sub?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="leading-none">
        <span className="block font-display text-[22px] font-extrabold uppercase tracking-[0.02em]">Arquibancada</span>
        {sub && <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-mute">{sub}</span>}
      </span>
    </span>
  );
}
