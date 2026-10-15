export { Flag, Pause, Play } from 'lucide-react';

export function Whistle({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 9.5h9.8l5.6-3.2a1 1 0 0 1 1.5.9v4.6" />
      <circle cx="12.5" cy="14" r="5.5" />
      <path d="M2.5 9.5v3.2" />
    </svg>
  );
}

/** Desenho do cartão (amarelo, vermelho...) usado nos botões. */
export function CardGlyph({ color, size = 18 }: { color?: string; size?: number }) {
  const map: Record<string, string> = { yellow: '#ffd60a', red: '#ff3b30', blue: '#0a84ff', green: '#30d158', white: '#f2f2f7' };
  return <span className="inline-block rounded-[3px] shadow" style={{ width: size * 0.66, height: size, background: map[color ?? 'yellow'] ?? map.yellow, transform: 'rotate(8deg)' }} />;
}
