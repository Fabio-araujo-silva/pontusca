import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { ButtonHTMLAttributes, forwardRef, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtScore } from '@/lib/format';
import { vibrate } from '@/lib/hooks';

// curva padrão do app: entra firme e assenta, sem quique
export const EASE = [0.16, 1, 0.3, 1] as const;

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------- botão

type Variant = 'primary' | 'brand' | 'ghost' | 'soft' | 'danger' | 'outline';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-white text-black hover:bg-white/90',
  brand: 'bg-brand text-brand-ink hover:brightness-95',
  ghost: 'bg-transparent text-white hover:bg-white/[0.06]',
  soft: 'bg-white/[0.07] text-white hover:bg-white/[0.11]',
  danger: 'bg-live text-snow hover:brightness-110',
  outline: 'bg-transparent text-white ring-1 ring-inset ring-white/15 hover:bg-white/[0.05]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }>(
  ({ variant = 'soft', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-10 px-4 text-[14px]',
        size === 'lg' && 'h-12 px-6 text-[15px]',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  ),
);

export function IconButton({ className, children, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cx('inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/[0.08] hover:text-white active:scale-95', className)} {...rest}>
      {children}
    </button>
  );
}

export const Spinner = ({ className = '' }: { className?: string }) => <Loader2 className={cx('h-5 w-5 animate-spin text-mute', className)} />;

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] text-mute">{icon}</div>}
      <p className="text-[15px] font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-xs text-[13px] text-mute">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- abas segmentadas

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  // id próprio: a "pílula" não voa entre dois Segmented iguais na tela (ex.: dois cards abertos)
  const gid = useId();
  return (
    <LayoutGroup id={gid}>
      <div className={cx('relative inline-flex rounded-full bg-white/[0.06] p-1', className)}>
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cx('relative z-10 flex-1 whitespace-nowrap rounded-full font-semibold transition-colors', size === 'sm' ? 'px-3 py-1 text-[12px]' : 'px-4 py-1.5 text-[13px]', value === o.value ? 'text-black' : 'text-white/70 hover:text-white')}
          >
            {value === o.value && <motion.span layoutId="seg-pill" className="absolute inset-0 -z-10 rounded-full bg-white" transition={{ duration: 0.25, ease: EASE }} />}
            {o.label}
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}

// ---------------------------------------------------------------- ao vivo

export function LiveDot({ className = '' }: { className?: string }) {
  return (
    <span className={cx('relative inline-flex h-2 w-2', className)}>
      <span className="absolute inline-flex h-full w-full animate-ping2 rounded-full bg-live" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
    </span>
  );
}

export function LiveBadge({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full bg-live/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-live', className)}>
      <LiveDot />
      {children ?? 'Ao vivo'}
    </span>
  );
}

/** Número do placar que "rola" quando muda. */
export function ScoreNumber({ value, className = '', dim }: { value: number; className?: string; dim?: boolean }) {
  const text = fmtScore(value);
  return (
    <span className={cx('relative inline-flex overflow-hidden tabular', dim && 'text-white/45', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          initial={{ y: '90%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-90%', opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="inline-block"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// ---------------------------------------------------------------- sheet / modal

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  tone,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  tone?: string; // cor de destaque no topo (cor da atlética)
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-coal/40 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3, ease: EASE }}
            className={cx('relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-ink-850 shadow-glow ring-1 ring-white/[0.06] sm:rounded-[24px]', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
          >
            {tone && <div className="absolute inset-x-0 top-0 h-1" style={{ background: tone }} />}
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
            {(title || true) && (
              <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
                <div className="min-w-0 text-[17px] font-bold">{title}</div>
                <IconButton label="Fechar" onClick={onClose} className="-mr-2">
                  <X className="h-5 w-5" />
                </IconButton>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            {footer && <div className="safe-bottom border-t border-white/[0.06] bg-ink-850 px-5 pt-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------------------------------------------------------------- segurar pra confirmar

/**
 * Botão de "segure para confirmar": evita toque acidental em ações críticas
 * (iniciar, encerrar período, fim de jogo) com o celular na mão no ginásio.
 */
export function HoldButton({
  onConfirm,
  children,
  ms = 900,
  className = '',
  color = '#111114',
  textColor = '#ffffff',
  disabled,
}: {
  onConfirm: () => void;
  children: ReactNode;
  ms?: number;
  className?: string;
  color?: string;
  textColor?: string;
  disabled?: boolean;
}) {
  const [p, setP] = useState(0);
  const raf = useRef<number>();
  const start = useRef(0);
  const done = useRef(false);

  const stop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (!done.current) setP(0);
  };
  const begin = () => {
    if (disabled) return;
    done.current = false;
    start.current = performance.now();
    vibrate(8);
    const loop = () => {
      const v = Math.min(1, (performance.now() - start.current) / ms);
      setP(v);
      if (v >= 1) {
        done.current = true;
        vibrate([20, 40, 30]);
        onConfirm();
        setTimeout(() => setP(0), 300);
        return;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };
  useEffect(() => () => stop(), []);

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && begin()}
      onKeyUp={stop}
      className={cx('relative isolate h-16 w-full select-none overflow-hidden rounded-2xl font-bold tracking-wide ring-1 ring-white/10 transition active:scale-[0.99] disabled:opacity-40', className)}
      style={{ background: 'rgb(var(--fg) / .08)', color: 'rgb(var(--fg))', touchAction: 'none' }}
    >
      <span className="absolute inset-y-0 left-0 -z-10" style={{ width: `${p * 100}%`, background: color }} />
      <span className="relative z-10 inline-flex -translate-y-1.5 items-center gap-2 text-[16px]" style={{ color: p > 0.5 ? textColor : 'rgb(var(--fg))', transition: 'color .15s' }}>
        {children}
      </span>
      <span className="absolute bottom-2 left-0 right-0 z-10 text-center text-[10px] font-medium uppercase tracking-widest opacity-50">{p > 0 ? 'segurando…' : 'segure para confirmar'}</span>
    </button>
  );
}

// ---------------------------------------------------------------- toast

type ToastItem = { id: number; text: string; tone: 'ok' | 'err' | 'info' };
let pushToast: (t: Omit<ToastItem, 'id'>) => void = () => {};
export const toast = {
  ok: (text: string) => pushToast({ text, tone: 'ok' }),
  err: (text: string) => pushToast({ text, tone: 'err' }),
  info: (text: string) => pushToast({ text, tone: 'info' }),
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    let n = 0;
    pushToast = (t) => {
      const id = ++n;
      setItems((s) => [...s.slice(-2), { ...t, id }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), t.tone === 'err' ? 4500 : 2600);
    };
  }, []);
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            initial={{ y: -20, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -10, opacity: 0 }}
            className={cx(
              'pointer-events-auto max-w-sm rounded-2xl px-4 py-2.5 text-[14px] font-semibold shadow-glow backdrop-blur-xl',
              t.tone === 'err' && 'bg-live text-snow',
              t.tone === 'ok' && 'bg-white/95 text-black',
              t.tone === 'info' && 'bg-ink-700/95 text-white ring-1 ring-white/10',
            )}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- confirmação simples

export function Confirm({
  open,
  onClose,
  title,
  children,
  confirmLabel = 'Confirmar',
  onConfirm,
  danger,
  hold,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  danger?: boolean;
  hold?: boolean;
  loading?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        hold ? (
          // enquanto envia, não aceita segurar de novo (evita mandar 2 vezes)
          <HoldButton onConfirm={onConfirm} color={danger ? '#e0261d' : '#111114'} textColor="#ffffff" disabled={loading}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : confirmLabel}
          </HoldButton>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm} loading={loading}>
              {confirmLabel}
            </Button>
          </div>
        )
      }
    >
      <div className="text-[14px] leading-relaxed text-white/75">{children}</div>
    </Sheet>
  );
}
