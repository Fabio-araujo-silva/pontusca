// Faixa preta com texto amarelo correndo (grafismo do TUSCA 2026: "SOU_TUSQUEIRO").
export function Ticker({ items }: { items: string[] }) {
  const line = items.filter(Boolean).join('  ·  ');
  return (
    <div className="overflow-hidden bg-coal py-1.5 text-pop-yellow" aria-label={line}>
      <div className="flex w-max animate-marquee whitespace-nowrap font-display text-[15px] uppercase tracking-[0.06em]" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="pr-8">
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Etiqueta chapada de seção (AO VIVO, PRÓXIMOS…), levemente torta como nos posts. */
export function SectionTag({ children, tone, tilt = 0 }: { children: React.ReactNode; tone: 'live' | 'orange' | 'purple' | 'black' | 'green'; tilt?: number }) {
  const cls = {
    live: 'bg-live text-snow',
    orange: 'bg-pop-orange text-coal',
    purple: 'bg-pop-purple text-snow',
    black: 'bg-coal text-pop-yellow',
    green: 'bg-pop-green text-coal',
  }[tone];
  return (
    <span className={`tag ${cls}`} style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined }}>
      {children}
    </span>
  );
}
