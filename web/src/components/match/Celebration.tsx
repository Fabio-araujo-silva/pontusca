// Comemoração em tela cheia (estilo placar do Google) para o jogo que o
// torcedor está acompanhando de perto: card expandido, página do jogo ou
// jogo de atlética favorita. Os outros cards ganham só o flash local.
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { Highlight, InstitutionDTO, MatchSummary } from '@shared/types';
import { usePublic } from '@/pages/public/PublicLayout';
import { onHighlight } from '@/lib/data';
import { fmtScore, onColor, teamTone } from '@/lib/format';
import { involves } from '@/lib/feed';
import { useProfile } from '@/lib/profile';
import { TeamFlag } from '../ui/TeamFlag';
import { teamsOf } from './helpers';

interface Shown {
  key: number;
  h: Highlight;
  m: MatchSummary;
  team: InstitutionDTO | null;
}

export function Celebration() {
  const { focused, inst } = usePublic();
  const { profile } = useProfile();
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(
    () =>
      onHighlight(({ summary, highlight }) => {
        if (!highlight.big) return;
        const watching = summary.id === focused || involves(summary, profile.atleticaId);
        if (!watching) return;
        const team = highlight.side ? teamsOf(summary, inst)[highlight.side] : null;
        setShown({ key: Date.now(), h: highlight, m: summary, team });
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && (highlight.type === 'score' || highlight.type === 'end' || highlight.type === 'set')) {
          const colors = team ? [team.primaryColor, team.secondaryColor, '#ffffff'] : ['#111114', '#ffffff', '#e0261d'];
          const burst = (x: number, angle: number) => confetti({ particleCount: 90, spread: 70, startVelocity: 55, angle, origin: { x, y: 0.75 }, colors, scalar: 1.1, disableForReducedMotion: true });
          burst(0.1, 60);
          burst(0.9, 120);
          setTimeout(() => confetti({ particleCount: 120, spread: 120, origin: { y: 0.35 }, colors, disableForReducedMotion: true }), 250);
        }
        if ('vibrate' in navigator) navigator.vibrate?.([30, 50, 30]);
      }),
    [focused, profile.atleticaId, inst],
  );

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 3200);
    return () => clearTimeout(t);
  }, [shown]);

  const color = shown?.team ? teamTone(shown.team.primaryColor, shown.team.secondaryColor) : '#111114';
  const ink = onColor(color);
  return (
    <AnimatePresence>
      {shown && (
        <motion.div key={shown.key} className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden" onClick={() => setShown(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35 } }}>
          <motion.div className="absolute inset-0" style={{ background: color }} initial={{ clipPath: 'circle(0% at 50% 50%)' }} animate={{ clipPath: 'circle(150% at 50% 50%)' }} transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }} />
          <motion.div className="absolute inset-0 opacity-25" style={{ backgroundImage: `repeating-linear-gradient(115deg, ${ink}22 0 2px, transparent 2px 26px)` }} initial={{ x: -80 }} animate={{ x: 0 }} transition={{ duration: 3 }} />
          <div className="relative flex flex-col items-center px-6 text-center" style={{ color: ink }}>
            {shown.team && (
              <motion.div initial={{ y: 30, opacity: 0, rotate: -8 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 16 }}>
                <TeamFlag inst={shown.team} size={96} shape="flag" />
              </motion.div>
            )}
            <motion.div
              className="mt-5 font-poster font-extrabold uppercase italic leading-[0.85] tracking-tight"
              style={{ fontSize: 'clamp(72px, 22vw, 180px)', textShadow: '0 8px 40px rgba(0,0,0,.25)' }}
              initial={{ scale: 2.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 14 }}
            >
              {shown.h.label}
            </motion.div>
            <motion.div className="mt-4 text-[17px] font-bold uppercase tracking-[0.2em]" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 0.95 }} transition={{ delay: 0.45 }}>
              {[shown.team?.name, shown.h.athleteName].filter(Boolean).join(' · ')}
            </motion.div>
            {!shown.m.score.ranking && (
              <motion.div className="mt-6 flex items-center gap-4 rounded-full px-6 py-2 font-display text-[40px] font-extrabold tabular" style={{ background: ink === '#ffffff' ? 'rgba(0,0,0,.22)' : 'rgb(var(--fg) / .35)' }} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }}>
                <span className="font-sans text-[15px] font-bold not-italic">{teamsOf(shown.m, inst).home.name}</span>
                <span>
                  {fmtScore(shown.m.score.home)} – {fmtScore(shown.m.score.away)}
                </span>
                <span className="font-sans text-[15px] font-bold not-italic">{teamsOf(shown.m, inst).away.name}</span>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
