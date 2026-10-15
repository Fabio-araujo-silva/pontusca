// Modalidades: lista agrupada por motor, criação a partir do catálogo e editor.
import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { EngineKind, Gender, SportConfig } from '@shared/types';
import { Button, Confirm, cx, Sheet, Spinner, toast } from '@/components/ui/primitives';
import { SportIcon } from '@/components/ui/SportIcon';
import { del, get, patch, post } from '@/lib/api';
import { GENDER_SHORT } from '@/lib/format';
import { AdminSport, useAdmin } from './ctx';
import { cleanConfig, defaultConfig, ENGINE_INFO, SportEditorSheet, SportForm } from './SportEditor';
import { PageHeader, useAction } from './ui';

interface CatalogSport {
  slug: string;
  name: string;
  icon: string;
  category: 'team' | 'individual' | 'race';
  genders: Gender[];
  config: SportConfig;
}

export default function Sports() {
  const { sports, refresh } = useAdmin();
  const [form, setForm] = useState<SportForm | null>(null);
  const [picker, setPicker] = useState(false);
  const [delS, setDelS] = useState<AdminSport | null>(null);
  const [restore, setRestore] = useState(false);
  const cat = useQuery({ queryKey: ['admin', 'catalog'], queryFn: () => get<CatalogSport[]>('/admin/sports/catalog'), enabled: picker });

  const save = useAction(
    (f: SportForm) => {
      if (!f.genders.length) throw new Error('Escolha ao menos um naipe.');
      const body = { name: f.name, icon: f.icon, category: f.category, genders: f.genders, active: f.active, order: f.order, config: cleanConfig(f.config) };
      return f.id ? patch(`/admin/sports/${f.id}`, body) : post('/admin/sports', body);
    },
    { ok: 'Modalidade salva', onDone: () => (refresh('sports'), setForm(null)) },
  );
  const remove = useAction((id: string) => del<{ message?: string }>(`/admin/sports/${id}`), {
    ok: (r) => r.message ?? 'Modalidade excluída',
    onDone: () => (refresh('sports'), setDelS(null)),
  });
  const restoreAll = useAction(() => post<{ created: number }>('/admin/sports/restore-catalog'), {
    ok: (r) => (r.created ? `${r.created} modalidade(s) restaurada(s)` : 'Catálogo já estava completo'),
    onDone: () => (refresh('sports'), setRestore(false)),
  });

  const edit = (s: AdminSport) => setForm({ id: s.id, name: s.name, icon: s.icon, category: s.category, genders: s.genders, active: s.active, order: s.order, config: structuredClone(s.config) });
  const groups = (Object.keys(ENGINE_INFO) as EngineKind[]).map((e) => [e, sports.filter((s) => s.engine === e)] as const).filter(([, l]) => l.length);

  return (
    <div>
      <PageHeader
        title="Modalidades"
        subtitle={`${sports.length} modalidades · ${sports.filter((s) => s.active).length} ativas`}
        actions={
          <>
            <Button icon={<RotateCcw className="h-4 w-4" />} onClick={() => setRestore(true)}>
              Restaurar catálogo
            </Button>
            <Button variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => setPicker(true)}>
              Nova modalidade
            </Button>
          </>
        }
      />
      <div className="space-y-6">
        {groups.map(([engine, list]) => (
          <section key={engine}>
            <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-mute">
              {ENGINE_INFO[engine].label} <span className="font-medium normal-case tracking-normal text-mute-2">· {ENGINE_INFO[engine].hint}</span>
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((s) => (
                <div key={s.id} className={cx('card flex items-center gap-3 p-3', !s.active && 'opacity-50')}>
                  <button onClick={() => edit(s)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                      <SportIcon name={s.icon} size={20} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{s.name}</span>
                      <span className="block truncate text-[12px] text-mute">
                        {s.genders.map((g) => GENDER_SHORT[g]).join(' / ')} · {s.matches} jogos{!s.active && ' · inativa'}
                        {s.engine === 'SCORE' && s.config.periods && ` · ${s.config.periods.count}×${s.config.periods.durationMin ?? '–'}min`}
                        {s.engine === 'SETS' && s.config.sets && ` · md${s.config.sets.bestOf}${s.config.sets.target ? ` a ${s.config.sets.target}` : ''}`}
                      </span>
                    </span>
                  </button>
                  <button onClick={() => setDelS(s)} className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-live" aria-label="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Sheet open={picker} onClose={() => setPicker(false)} wide title="Nova modalidade">
        <button
          className="mb-4 w-full rounded-2xl bg-white/[0.05] p-4 text-left ring-1 ring-white/10 hover:bg-white/[0.08]"
          onClick={() => {
            setPicker(false);
            setForm({ name: '', icon: 'generic', category: 'team', genders: ['M', 'F'], active: true, order: sports.length, config: defaultConfig('SCORE') });
          }}
        >
          <div className="text-[15px] font-bold">Começar do zero</div>
          <div className="text-[12px] text-mute">Escolha o motor e configure tudo</div>
        </button>
        <span className="label">Ou partir de um modelo</span>
        {cat.isLoading ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(cat.data ?? []).map((c) => (
              <button
                key={c.slug}
                className="flex items-center gap-2 rounded-xl bg-ink-800 p-2.5 text-left ring-1 ring-white/10 hover:bg-white/[0.06]"
                onClick={() => {
                  setPicker(false);
                  setForm({ name: `${c.name} (cópia)`, icon: c.icon, category: c.category, genders: c.genders, active: true, order: sports.length, config: structuredClone(c.config) });
                }}
              >
                <SportIcon name={c.icon} size={18} />
                <span className="truncate text-[13px] font-medium">{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </Sheet>

      <SportEditorSheet
        form={form}
        onChange={setForm}
        onClose={() => setForm(null)}
        saving={save.isPending}
        onSave={() => {
          if (!form) return;
          if (!form.name.trim()) return toast.err('Dê um nome à modalidade.');
          save.mutate([form]);
        }}
      />

      <Confirm open={!!delS} onClose={() => setDelS(null)} title={`Excluir ${delS?.name}?`} danger confirmLabel="Excluir" loading={remove.isPending} onConfirm={() => delS && remove.mutate([delS.id])}>
        {delS?.matches ? `Tem ${delS.matches} jogo(s): ela será desativada em vez de apagada.` : 'A modalidade será apagada.'}
      </Confirm>
      <Confirm open={restore} onClose={() => setRestore(false)} title="Restaurar catálogo padrão?" confirmLabel="Restaurar" loading={restoreAll.isPending} onConfirm={() => restoreAll.mutate([])}>
        Recria as modalidades padrão que estiverem faltando. As existentes não são alteradas.
      </Confirm>
    </div>
  );
}
