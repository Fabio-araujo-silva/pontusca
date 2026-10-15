import type { ReactNode } from 'react';
import { cx } from './primitives';

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={cx('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 transition active:scale-95', active ? 'bg-white text-black ring-white' : 'bg-white/[0.04] text-white/85 ring-white/[0.08] hover:bg-white/[0.08]')}>
      {children}
    </button>
  );
}
