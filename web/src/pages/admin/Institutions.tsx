// Atléticas: grid com brasão e editor com cores, padrão de bandeira e logo.
import { ImagePlus, Pencil, Plus, Shield, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { FlagPattern } from '@shared/types';
import { Button, Confirm, cx, Empty, Sheet, toast } from '@/components/ui/primitives';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { del, patch, post } from '@/lib/api';
import { AdminInstitution, useAdmin } from './ctx';
import { ColorInput, Field, PageHeader, SandboxBadge, useAction } from './ui';

const PATTERNS: { value: FlagPattern; label: string }[] = [
  { value: 'stripes', label: 'Listras' },
  { value: 'diagonal', label: 'Diagonal' },
  { value: 'chevron', label: 'Chevron' },
  { value: 'split', label: 'Dividida' },
  { value: 'cross', label: 'Cruz' },
  { value: 'solid', label: 'Lisa' },
];

interface Form {
  id?: string;
  name: string;
  fullName: string;
  university: string;
  city: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  flagPattern: FlagPattern;
  logo: string | null;
}

/** Lê a imagem e reduz pra no máx. 256px (cabe folgado no limite do back). */
async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = url;
    });
    const scale = Math.min(1, 256 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const webp = c.toDataURL('image/webp', 0.9);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Institutions() {
  const { institutions, refresh } = useAdmin();
  const [f, setF] = useState<Form | null>(null);
  const [delInst, setDelInst] = useState<AdminInstitution | null>(null);
  const [q, setQ] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const save = useAction(
    (x: Form) => {
      const body = {
        name: x.name,
        fullName: x.fullName || null,
        university: x.university || null,
        city: x.city || null,
        primaryColor: x.primaryColor,
        secondaryColor: x.secondaryColor,
        accentColor: x.accentColor || null,
        flagPattern: x.flagPattern,
        logo: x.logo,
      };
      return x.id ? patch(`/admin/institutions/${x.id}`, body) : post('/admin/institutions', body);
    },
    { ok: 'Atlética salva', onDone: () => (refresh('institutions'), setF(null)) },
  );
  const remove = useAction((id: string) => del(`/admin/institutions/${id}`), { ok: 'Atlética excluída', onDone: () => (refresh('institutions'), setDelInst(null)) });

  const edit = (i?: AdminInstitution) =>
    setF(
      i
        ? { id: i.id, name: i.name, fullName: i.fullName ?? '', university: i.university ?? '', city: i.city ?? '', primaryColor: i.primaryColor, secondaryColor: i.secondaryColor, accentColor: i.accentColor ?? '', flagPattern: i.flagPattern, logo: i.logo ?? null }
        : { name: '', fullName: '', university: '', city: '', primaryColor: '#1d4ed8', secondaryColor: '#ffffff', accentColor: '', flagPattern: 'stripes', logo: null },
    );
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => (x ? { ...x, [k]: v } : x));

  const list = institutions.filter((i) => !q || [i.name, i.fullName, i.university, i.city].join(' ').toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Atléticas"
        subtitle={`${institutions.length} cadastradas — cores e bandeira aparecem nos cards e nos prints compartilháveis`}
        actions={
          <>
            <input className="field h-10 w-48" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => edit()}>
              Nova atlética
            </Button>
          </>
        }
      />
      {list.length === 0 ? (
        <div className="card">
          <Empty icon={<Shield className="h-6 w-6" />} title="Nenhuma atlética" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.map((i) => (
            <button key={i.id} onClick={() => edit(i)} className="card group relative overflow-hidden p-4 text-left transition hover:ring-white/15">
              <div className="absolute inset-x-0 top-0 h-16 opacity-30" style={{ background: `linear-gradient(135deg, ${i.primaryColor}, transparent)` }} />
              <div className="relative flex flex-col items-center text-center">
                <TeamFlag inst={i} size={64} />
                <div className="mt-3 font-display text-[22px] font-bold leading-none uppercase">{i.name}</div>
                <div className="mt-1 line-clamp-1 text-[12px] text-mute">{i.university ?? i.fullName ?? '—'}</div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-mute-2">
                  {i.isSandbox && <SandboxBadge />}
                  <span>{i.athletes} atletas</span>·<span>{i.matches} jogos</span>
                </div>
              </div>
              <Pencil className="absolute right-3 top-3 h-4 w-4 text-white/0 transition group-hover:text-white/60" />
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={!!f}
        onClose={() => setF(null)}
        wide
        tone={f?.primaryColor}
        title={f?.id ? `Editar ${f.name}` : 'Nova atlética'}
        footer={
          <div className="flex gap-2">
            {f?.id && (
              <Button variant="ghost" className="text-live" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDelInst(institutions.find((x) => x.id === f.id) ?? null)}>
                Excluir
              </Button>
            )}
            <Button variant="brand" className="flex-1" loading={save.isPending} onClick={() => f && save.mutate([f])}>
              Salvar
            </Button>
          </div>
        }
      >
        {f && (
          <div className="grid gap-6 md:grid-cols-[1fr_240px]">
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nome curto" hint="Aparece no placar: CAASO, UFSCar…">
                  <input className="field" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={40} />
                </Field>
                <Field label="Universidade / campus">
                  <input className="field" value={f.university} onChange={(e) => set('university', e.target.value)} placeholder="USP São Carlos" />
                </Field>
              </div>
              <Field label="Nome completo">
                <input className="field" value={f.fullName} onChange={(e) => set('fullName', e.target.value)} />
              </Field>
              <Field label="Cidade">
                <input className="field" value={f.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Cor principal">
                  <ColorInput value={f.primaryColor} onChange={(v) => set('primaryColor', v)} />
                </Field>
                <Field label="Cor secundária">
                  <ColorInput value={f.secondaryColor} onChange={(v) => set('secondaryColor', v)} />
                </Field>
                <Field label="Destaque (opcional)">
                  <ColorInput value={f.accentColor} onChange={(v) => set('accentColor', v)} />
                </Field>
              </div>
              <div>
                <span className="label">Padrão da bandeira</span>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {PATTERNS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => set('flagPattern', p.value)}
                      className={cx('flex flex-col items-center gap-1.5 rounded-xl p-2 ring-1 transition', f.flagPattern === p.value ? 'bg-white/[0.08] ring-brand' : 'ring-white/10 hover:bg-white/[0.04]')}
                    >
                      <TeamFlag inst={{ ...f, logo: null, flagPattern: p.value, accentColor: f.accentColor || null }} size={30} shape="flag" showInitials={false} />
                      <span className="text-[11px] font-medium text-white/75">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="label">Logo / brasão (opcional)</span>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      try {
                        set('logo', await shrinkImage(file));
                      } catch {
                        toast.err('Não consegui ler essa imagem.');
                      }
                    }}
                  />
                  <Button icon={<ImagePlus className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
                    {f.logo ? 'Trocar imagem' : 'Enviar imagem'}
                  </Button>
                  {f.logo && (
                    <Button variant="ghost" onClick={() => set('logo', null)}>
                      Remover
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-mute-2">PNG quadrado com fundo funciona melhor. Sem logo, usamos o brasão gerado com as cores.</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-4 rounded-2xl bg-white/[0.03] p-5">
              <span className="label self-start">Prévia</span>
              <TeamFlag inst={{ ...f, name: f.name || '?', accentColor: f.accentColor || null }} size={96} />
              <TeamFlag inst={{ ...f, name: f.name || '?', logo: null, accentColor: f.accentColor || null }} size={88} shape="flag" />
              <div className="flex w-full items-center gap-2 rounded-xl bg-ink-800 px-3 py-2">
                <TeamFlag inst={{ ...f, name: f.name || '?', accentColor: f.accentColor || null }} size={26} />
                <span className="flex-1 truncate text-[14px] font-semibold">{f.name || 'Nome'}</span>
                <span className="font-display text-[20px] font-bold uppercase">2</span>
              </div>
            </div>
          </div>
        )}
      </Sheet>

      <Confirm open={!!delInst} onClose={() => setDelInst(null)} title={`Excluir ${delInst?.name}?`} danger confirmLabel="Excluir" loading={remove.isPending} onConfirm={() => delInst && (remove.mutate([delInst.id]), setF(null))}>
        Os atletas da atlética também são apagados. Atléticas com jogos não podem ser excluídas.
      </Confirm>
    </div>
  );
}
