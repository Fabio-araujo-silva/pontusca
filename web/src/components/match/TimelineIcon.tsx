import { ArrowDownUp, CircleDot, Flag, Hand, Medal, MessageSquareText, Octagon, PauseCircle, RotateCcw, Target, Trophy, X, Zap } from 'lucide-react';
import { SportIcon } from '../ui/SportIcon';

const CARD: Record<string, string> = {
  'card-yellow': '#ffd60a',
  'card-red': '#e0261d',
  'card-blue': '#0a84ff',
  'card-green': '#30d158',
  'card-white': '#f2f2f7',
};

function Whistle({ className, size }: { className?: string; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 9.5h9.8l5.6-3.2a1 1 0 0 1 1.5.9v4.6" />
      <circle cx="12.5" cy="14" r="5.5" />
      <path d="M2.5 9.5v3.2" />
    </svg>
  );
}

/** Ícone de cada tipo de lance da timeline (gol, cartão, substituição...). */
export function TimelineIcon({ icon, sportIcon = 'soccer', size = 16 }: { icon: string; sportIcon?: string; size?: number }) {
  const s = { width: size, height: size };
  if (CARD[icon]) return <span className="inline-block rounded-[3px] shadow-sm" style={{ width: size * 0.62, height: size * 0.86, background: CARD[icon], transform: 'rotate(8deg)' }} />;
  switch (icon) {
    case 'pen-goal':
      // gol de pênalti: bola com um "P"
      return (
        <span className="relative inline-flex">
          <SportIcon name={sportIcon} size={size} className="text-white" />
          <span className="absolute -bottom-1 -right-1.5 rounded-[3px] bg-coal px-[3px] text-[8px] font-black leading-[11px] text-snow">P</span>
        </span>
      );
    case 'goal':
    case 'points':
    case 'run':
      return <SportIcon name={sportIcon} size={size} className="text-white" />;
    case 'own-goal':
      return <SportIcon name={sportIcon} size={size} className="text-live" />;
    case 'pen-miss':
      return <X style={s} className="text-live" />;
    case 'sub':
      return <ArrowDownUp style={s} className="text-win" />;
    case 'foul':
      return <Hand style={s} className="text-warn" />;
    case 'timeout':
      return <PauseCircle style={s} className="text-mute" />;
    case 'whistle':
    case 'inning':
      return <Whistle size={size} className="text-mute" />;
    case 'flag':
      return <Flag style={s} className="text-white" />;
    case 'note':
      return <MessageSquareText style={s} className="text-mute" />;
    case 'set':
    case 'game':
      return <Trophy style={s} className="text-brand" />;
    case 'break':
      return <Zap style={s} className="text-brand" />;
    case 'homerun':
      return <Zap style={s} className="text-brand" />;
    case 'hit':
      return <Target style={s} className="text-white" />;
    case 'out':
      return <Octagon style={s} className="text-live" />;
    case 'walk':
      return <RotateCcw style={s} className="text-mute" />;
    case 'result':
      return <Medal style={s} className="text-brand" />;
    case 'point':
    case 'pitch':
    case 'stat':
    default:
      return <CircleDot style={s} className="text-mute" />;
  }
}
