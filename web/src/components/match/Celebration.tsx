// Comemoração em tela cheia (estilo placar do Google) para o jogo que o
// torcedor está acompanhando de perto: card expandido, página do jogo ou
// jogo da atlética dele. Os outros cards ganham só o flash local.
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

/** Esse jogo ganha a comemoração em tela cheia? (o card não anima junto) */
export const celebratesFullscreen = (m: Pick<MatchSummary, 'id' | 'homeId' | 'awayId' | 'participantIds'>, h: Highlight, focused: string | null, atleticaId: string | null) =>
  !!h.big && (m.id === focused || involves(m, atleticaId));

// curva "ease-out" firme: entra rápido e assenta, sem quique
const EASE = [0.16, 1, 0.3, 1] as const;

export function Celebration() {
  const { focused, inst } = usePublic();
  const { profile } = useProfile();
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(
    () =>
      onHighlight(({ summary, highlight }) => {
        if (!celebratesFullscreen(summary, highlight, focused, profile.atleticaId)) return;
        const team = highlight.side ? teamsOf(summary, inst)[highlight.side] : null;
        setShown({ key: Date.now(), h: highlight, m: summary, team });
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && (highlight.type === 'score' || highlight.type === 'end' || highlight.type === 'set')) {
          const colors = team ? [team.primaryColor, team.secondaryColor, '#ffffff'] : ['#111114', '#ffffff', '#ff8a15'];
          // confete sai junto com o texto (um disparo só de cada lado, sem rajada atrasada)
          setTimeout(() => {
            confetti({ particleCount: 70, spread: 65, startVelocity: 50, angle: 60, origin: { x: 0, y: 0.8 }, colors, ticks: 220, disableForReducedMotion: true });
            confetti({ particleCount: 70, spread: 65, startVelocity: 50, angle: 120, origin: { x: 1, y: 0.8 }, colors, ticks: 220, disableForReducedMotion: true });
          }, 120);
        }
        if ('vibrate' in navigator) navigator.vibrate?.([30, 50, 30]);
      }),
    [focused, profile.atleticaId, inst],
  );

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 3000);
    return () => clearTimeout(t);
  }, [shown]);

  const color = shown?.team ? teamTone(shown.team.primaryColor, shown.team.secondaryColor) : '#111114';
  const ink = onColor(color);
  const teams = shown ? teamsOf(shown.m, inst) : null;
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.key}
          className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden"
          style={{ background: color, color: ink }}
          onClick={() => setShown(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {/* textura fixa (sem movimento, pra não "piscar") */}
          <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: `radial-gradient(${ink} 1.4px, transparent 1.4px)`, backgroundSize: '18px 18px' }} />
          <div className="relative flex flex-col items-center px-6 text-center">
            {shown.team && (
              <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.35, ease: EASE, delay: 0.05 }}>
                <TeamFlag inst={shown.team} size={88} shape="flag" />
              </motion.div>
            )}
            <motion.div
              className="mt-5 font-poster font-extrabold uppercase italic leading-[0.85] tracking-tight"
              style={{ fontSize: 'clamp(72px, 22vw, 180px)' }}
              initial={{ scale: 1.18, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.42, ease: EASE }}
            >
              {shown.h.label}
            </motion.div>
            <motion.div className="mt-4 text-[17px] font-bold uppercase tracking-[0.2em]" initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 0.95 }} transition={{ duration: 0.3, ease: EASE, delay: 0.18 }}>
              {[shown.team?.name, shown.h.athleteName].filter(Boolean).join(' · ')}
            </motion.div>
            {teams && !shown.m.score.ranking && (
              <motion.div
                className="mt-6 flex items-center gap-4 rounded-full px-6 py-2 font-display text-[40px] tabular"
                style={{ background: ink === '#ffffff' ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.4)' }}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3, ease: EASE, delay: 0.28 }}
              >
                <span className="font-sans text-[15px] font-bold">{teams.home.name}</span>
                <span>
                  {fmtScore(shown.m.score.home)} – {fmtScore(shown.m.score.away)}
                </span>
                <span className="font-sans text-[15px] font-bold">{teams.away.name}</span>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
