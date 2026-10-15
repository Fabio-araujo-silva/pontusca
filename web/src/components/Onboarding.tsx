// Boas-vindas: 2 perguntas (atlética e esportes) + tutorial de 3 gestos.
// Fica salvo no aparelho (localStorage) — nada vai pro servidor.
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, Hand, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { InstitutionDTO, SportDTO } from '@shared/types';
import { useProfile } from '@/lib/profile';
import { Button, cx, LiveDot } from './ui/primitives';
import { SportIcon } from './ui/SportIcon';
import { TeamFlag } from './ui/TeamFlag';

export function Onboarding({ institutions, sports, onClose, editing }: { institutions: InstitutionDTO[]; sports: SportDTO[]; onClose?: () => void; editing?: boolean }) {
  const { profile, save } = useProfile();
  const [step, setStep] = useState(0);
  const [atletica, setAtletica] = useState<string | null>(profile.atleticaId);
  const [picked, setPicked] = useState<string[]>(profile.sportIds);
  const mine = institutions.find((i) => i.id === atletica) ?? null;
  const steps = editing ? 2 : 3;

  const finish = () => {
    save({ atleticaId: atletica, sportIds: picked, onboarded: true, onlyMine: atletica ? profile.onlyMine : false });
    onClose?.();
  };
  const next = () => (step + 1 >= steps ? finish() : setStep(step + 1));

  return (
    <motion.div className="fixed inset-0 z-[95] flex flex-col bg-ink" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col overflow-hidden px-5 pt-[max(env(safe-area-inset-top),16px)]">
        {/* progresso estilo stories */}
        <div className="flex items-center gap-2">
          {step > 0 ? (
            <button onClick={() => setStep(step - 1)} aria-label="Voltar" className="-ml-1 p-1 text-mute">
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <span className="w-7" />
          )}
          <div className="flex flex-1 gap-1.5">
            {Array.from({ length: steps }, (_, i) => (
              <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.1]">
                <motion.span className="block h-full bg-white" initial={false} animate={{ width: i <= step ? '100%' : '0%' }} />
              </span>
            ))}
          </div>
          {editing ? (
            <button onClick={onClose} aria-label="Fechar" className="-mr-1 p-1 text-mute">
              <X className="h-5 w-5" />
            </button>
          ) : (
            <span className="w-7" />
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }} className="flex min-h-0 flex-1 flex-col pt-7">
            {step === 0 && <StepAtletica institutions={institutions} value={atletica} onChange={setAtletica} />}
            {step === 1 && <StepSports sports={sports} value={picked} onChange={setPicked} />}
            {step === 2 && <StepTutorial mine={mine} />}
          </motion.div>
        </AnimatePresence>

        <div className="safe-bottom flex items-center gap-3 border-t border-white/[0.06] bg-ink pt-3">
          {step === 0 && (
            <button onClick={() => (setAtletica(null), next())} className="text-[14px] font-semibold text-mute">
              Não tenho atlética
            </button>
          )}
          {step === 1 && (
            <button onClick={() => (setPicked([]), next())} className="text-[14px] font-semibold text-mute">
              Curto de tudo
            </button>
          )}
          <Button variant="primary" size="lg" className="ml-auto min-w-[140px] font-display text-[19px] uppercase" disabled={step === 0 && !atletica} onClick={next}>
            {step + 1 >= steps ? (editing ? 'Salvar' : 'Bora!') : 'Continuar'}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function Title({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <span className="tag -rotate-1 bg-pop-orange text-coal">{tag}</span>
      <h1 className="mt-3 font-display text-[40px] uppercase leading-[0.92]">{children}</h1>
    </div>
  );
}

function StepAtletica({ institutions, value, onChange }: { institutions: InstitutionDTO[]; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <>
      <Title tag="Bem-vindo_">De qual atlética você é?</Title>
      <div className="-mx-1 grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto px-1 pb-4 sm:grid-cols-3">
        {institutions.map((i) => {
          const on = value === i.id;
          return (
            <button key={i.id} onClick={() => onChange(on ? null : i.id)} className={cx('relative flex items-center gap-3 rounded-2xl p-3 text-left ring-1 transition active:scale-[0.98]', on ? 'bg-white text-black ring-white' : 'ring-white/[0.1] hover:bg-white/[0.03]')}>
              <TeamFlag inst={i} size={40} />
              <span className="min-w-0">
                <span className="block truncate font-display text-[20px] uppercase leading-none">{i.name}</span>
                {i.university && <span className={cx('mt-0.5 block truncate text-[11px]', on ? 'text-black/70' : 'text-mute')}>{i.university}</span>}
              </span>
              {on && <Check className="absolute right-2.5 top-2.5 h-4 w-4" />}
            </button>
          );
        })}
      </div>
    </>
  );
}

function StepSports({ sports, value, onChange }: { sports: SportDTO[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <>
      <Title tag="Seu feed_">Tem esporte preferido?</Title>
      <p className="-mt-2 mb-4 text-[14px] text-mute">Os jogos desses esportes ganham prioridade quando tiver mais de um rolando. Pode escolher vários — ou nenhum.</p>
      <div className="flex flex-1 flex-wrap content-start gap-2 overflow-y-auto pb-4">
        {sports.map((s) => {
          const on = value.includes(s.id);
          return (
            <button key={s.id} onClick={() => toggle(s.id)} className={cx('inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[14px] font-semibold ring-1 transition active:scale-95', on ? 'bg-white text-black ring-white' : 'ring-white/[0.12] hover:bg-white/[0.04]')}>
              <SportIcon name={s.icon} size={16} />
              {s.name}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Mini demonstrações animadas dos três gestos da home. */
function StepTutorial({ mine }: { mine: InstitutionDTO | null }) {
  const loop = { repeat: Infinity, repeatDelay: 0.6 };
  return (
    <>
      <Title tag="Rapidinho_">Como funciona</Title>
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        <Demo text="Cada dia é uma tela. Arraste pro lado pra ir pro dia seguinte (ou voltar).">
          <div className="relative h-full w-full overflow-hidden">
            <motion.div className="absolute inset-y-2 left-2 right-2 flex gap-2" animate={{ x: [0, -34, -34, 0] }} transition={{ duration: 2.2, times: [0, 0.4, 0.7, 1], ...loop }}>
              {['HOJE', 'AMANHÃ'].map((d) => (
                <div key={d} className="flex w-full shrink-0 flex-col gap-1 rounded-lg bg-white/[0.06] p-1.5">
                  <span className="font-display text-[11px] uppercase leading-none">{d}</span>
                  <span className="h-2 rounded bg-white/[0.12]" />
                  <span className="h-2 w-2/3 rounded bg-white/[0.12]" />
                </div>
              ))}
            </motion.div>
            <motion.div className="absolute bottom-1 right-3 text-white" animate={{ x: [0, -22, -22, 0], rotate: [-8, -16, -16, -8] }} transition={{ duration: 2.2, times: [0, 0.4, 0.7, 1], ...loop }}>
              <Hand className="h-6 w-6 fill-ink" />
            </motion.div>
          </div>
        </Demo>
        <Demo text="Tá rolando jogo? A bolinha no canto te leva direto pra ele.">
          <div className="relative flex h-full w-full items-end justify-end p-2">
            <motion.span className="flex h-11 w-11 items-center justify-center rounded-full bg-coal shadow-glow" animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1.4, ...loop }}>
              <LiveDot />
            </motion.span>
          </div>
        </Demo>
        <Demo text={mine ? `Ligue o botão lá em cima pra ver só os jogos do ${mine.name}.` : 'Escolhendo uma atlética, aparece um botão pra ver só os jogos dela.'}>
          <div className="flex h-full w-full items-center justify-center gap-2">
            {mine && <TeamFlag inst={mine} size={22} />}
            <span className="relative h-6 w-10 rounded-full bg-white/[0.12]">
              <motion.span className="absolute inset-0 rounded-full bg-coal" animate={{ opacity: [0, 0, 1, 1, 0] }} transition={{ duration: 2.4, times: [0, 0.3, 0.45, 0.85, 1], ...loop }} />
              <motion.span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-snow shadow" animate={{ x: [0, 0, 16, 16, 0] }} transition={{ duration: 2.4, times: [0, 0.3, 0.45, 0.85, 1], ...loop }} />
            </span>
          </div>
        </Demo>
      </div>
    </>
  );
}

function Demo({ children, text }: { children: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl p-3 ring-1 ring-white/[0.08]">
      <div className="h-[76px] w-[110px] shrink-0 overflow-hidden rounded-xl bg-white/[0.04]">{children}</div>
      <p className="text-[14px] font-medium leading-snug">{text}</p>
    </div>
  );
}

/** Esportes que aparecem no torneio (pra não listar 42 modalidades). */
export function useSportsInPlay(sports: SportDTO[], sportIds: string[]) {
  return useMemo(() => {
    const ids = new Set(sportIds);
    const inPlay = sports.filter((s) => ids.has(s.id));
    return inPlay.length ? inPlay : sports.filter((s) => s.active);
  }, [sports, sportIds]);
}
