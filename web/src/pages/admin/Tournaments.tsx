// Torneios: CRUD + critérios de desempate do placar geral.
import { ImagePlus, Pencil, Plus, Radio, Trash2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { TOURNAMENT_TIEBREAKERS } from '@shared/types';
import { Button, Confirm, cx, Empty, Sheet } from '@/components/ui/primitives';
import { del, patch, post } from '@/lib/api';
import { AdminTournament, useAdmin } from './ctx';
import { ColorInput, Field, move, MoveButtons, PageHeader, SandboxBadge, toDateInput, Toggle, useAction } from './ui';

interface Form {
  id?: string;
  name: string;
  edition: string;
  city: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  color: string;
  tiebreakers: string[];
  banner: string;
  bannerLink: string;
}

const DEFAULT_TB = ['POINTS', 'GOLD', 'SILVER', 'BRONZE', 'WINS', 'SCORE_DIFF'];

/** Lê a imagem e reduz pra no máx. 1600px de largura (WebP) antes de mandar. */
function readBanner(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const webp = c.toDataURL('image/webp', 0.86);
      resolve(webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.86));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function BannerField({ value, link, onChange, onLink }: { value: string; link: string; onChange: (v: string) => void; onLink: (v: string) => void }) {
  return (
    <div>
      <span className="label">Banner do evento (topo da Classificação)</span>
      {value ? (
        <img src={value} alt="" className="mb-2 w-full rounded-xl object-cover ring-1 ring-white/10" style={{ aspectRatio: '16 / 5.6' }} />
      ) : (
        <div className="mb-2 flex items-center justify-center rounded-xl border border-dashed border-white/20 text-[13px] text-mute" style={{ aspectRatio: '16 / 5.6' }}>
          Sem banner · proporção ideal 1600×560
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-white/[0.07] px-4 text-[13px] font-semibold hover:bg-white/[0.11]">
          <ImagePlus className="h-4 w-4" /> {value ? 'Trocar imagem' : 'Enviar imagem'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) onChange(await readBanner(file));
              e.target.value = '';
            }}
          />
        </label>
        {value && (
          <Button size="sm" variant="ghost" onClick={() => onChange('')}>
            Remover
          </Button>
        )}
        {!value && (
          <Button size="sm" variant="ghost" onClick={() => onChange('/banners/tusca-2026.svg')}>
            Usar o modelo TUSCA
          </Button>
        )}
      </div>
      <input className="field mt-2" value={link} onChange={(e) => onLink(e.target.value)} placeholder="Link ao tocar no banner (opcional) — ingressos, instagram…" />
    </div>
  );
}

export default function Tournaments() {
  const { tournaments, setTournamentId, tournamentId, refresh } = useAdmin();
  const [f, setF] = useState<Form | null>(null);
  const [delId, setDelId] = useState<AdminTournament | null>(null);

  const save = useAction(
    (x: Form) => {
      const body = {
        name: x.name,
        edition: x.edition || null,
        city: x.city || null,
        startsAt: x.startsAt || null,
        endsAt: x.endsAt || null,
        active: x.active,
        color: x.color || null,
        tiebreakers: x.tiebreakers,
        banner: x.banner || null,
        bannerLink: x.bannerLink || null,
      };
      return x.id ? patch(`/admin/tournaments/${x.id}`, body) : post('/admin/tournaments', body);
    },
    { ok: 'Torneio salvo', onDone: () => (refresh('tournaments'), setF(null)) },
  );
  // torneio do momento: o único que o site público mostra (um por ambiente: real e sandbox)
  const goLive = useAction((id: string) => post(`/admin/tournaments/${id}/current`), { ok: 'Agora é o torneio do site', onDone: () => refresh('tournaments') });
  const remove = useAction((id: string) => del(`/admin/tournaments/${id}`), { ok: 'Torneio excluído', onDone: () => (refresh('tournaments'), setDelId(null)) });

  const edit = (t?: AdminTournament) =>
    setF(
      t
        ? { id: t.id, name: t.name, edition: t.edition ?? '', city: t.city ?? '', startsAt: toDateInput(t.startsAt), endsAt: toDateInput(t.endsAt), active: t.active, color: t.color ?? '', tiebreakers: t.tiebreakers.length ? t.tiebreakers : DEFAULT_TB, banner: t.banner ?? '', bannerLink: t.bannerLink ?? '' }
        : { name: '', edition: String(new Date().getFullYear()), city: '', startsAt: '', endsAt: '', active: true, color: '#ff8a15', tiebreakers: DEFAULT_TB, banner: '', bannerLink: '' },
    );

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  const missing = f ? Object.keys(TOURNAMENT_TIEBREAKERS).filter((k) => !f.tiebreakers.includes(k)) : [];

  return (
    <div>
      <PageHeader
        title="Torneios"
        subtitle="TUSCA, InterUSP, Economíadas… cada um com seus jogos, pontuação e classificação"
        actions={
          <Button variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => edit()}>
            Novo torneio
          </Button>
        }
      />
      {tournaments.length === 0 ? (
        <div className="card">
          <Empty icon={<Trophy className="h-6 w-6" />} title="Nenhum torneio" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tournaments.map((t) => (
            <div key={t.id} className={cx('card relative overflow-hidden p-4', t.id === tournamentId && 'ring-2 ring-brand/60')}>
              <div className="absolute inset-y-0 left-0 w-1" style={{ background: t.color ?? '#3a3d47' }} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-display text-[24px] font-bold leading-none uppercase">{t.name}</h3>
                    {t.edition && <span className="text-[13px] font-semibold text-mute">{t.edition}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-mute">
                    {t.isCurrent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-live px-2 py-0.5 text-[10px] font-bold uppercase text-snow">
                        <Radio className="h-3 w-3" /> no site
                      </span>
                    )}
                    {t.isSandbox && <SandboxBadge />}
                    {!t.active && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase">inativo</span>}
                    {t.city && <span>{t.city}</span>}
                    <span>{t.matches} jogos</span>
                    {t.startsAt && (
                      <span>
                        {toDateInput(t.startsAt).split('-').reverse().slice(0, 2).join('/')} → {t.endsAt ? toDateInput(t.endsAt).split('-').reverse().slice(0, 2).join('/') : '?'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <button className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-white" onClick={() => edit(t)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-live" onClick={() => setDelId(t)} aria-label="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 text-[12px] text-mute">
                Desempate: {t.tiebreakers.map((k) => TOURNAMENT_TIEBREAKERS[k] ?? k).join(' › ')}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!t.isCurrent && (
                  <Button size="sm" variant="primary" icon={<Radio className="h-3.5 w-3.5" />} onClick={() => goLive.mutate([t.id])}>
                    Colocar no site
                  </Button>
                )}
                {t.id !== tournamentId && (
                  <Button size="sm" onClick={() => setTournamentId(t.id)}>
                    Usar no painel
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={!!f}
        onClose={() => setF(null)}
        title={f?.id ? 'Editar torneio' : 'Novo torneio'}
        tone={f?.color || undefined}
        footer={
          <Button variant="brand" className="w-full" loading={save.isPending} onClick={() => f && save.mutate([f])}>
            Salvar
          </Button>
        }
      >
        {f && (
          <div className="grid gap-4">
            <div className="grid grid-cols-[2fr_1fr] gap-3">
              <Field label="Nome">
                <input className="field" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="TUSCA" />
              </Field>
              <Field label="Edição">
                <input className="field" value={f.edition} onChange={(e) => set('edition', e.target.value)} placeholder="2026" />
              </Field>
            </div>
            <Field label="Cidade">
              <input className="field" value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="São Carlos" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início">
                <input type="date" className="field" value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
              </Field>
              <Field label="Fim">
                <input type="date" className="field" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} />
              </Field>
            </div>
            <Field label="Cor do torneio">
              <ColorInput value={f.color} onChange={(v) => set('color', v)} />
            </Field>
            <Toggle checked={f.active} onChange={(v) => set('active', v)} label="Ativo" hint="Só um torneio aparece no site: o marcado como “no site”" />
            <BannerField value={f.banner} link={f.bannerLink} onChange={(v) => set('banner', v)} onLink={(v) => set('bannerLink', v)} />
            <div>
              <span className="label">Critérios do placar geral (em ordem)</span>
              <div className="space-y-1.5">
                {f.tiebreakers.map((k, i) => (
                  <div key={k} className="flex items-center gap-2 rounded-xl bg-ink-800 px-3 py-1.5 ring-1 ring-white/10">
                    <span className="w-5 font-display text-[16px] font-bold text-mute uppercase">{i + 1}</span>
                    <span className="flex-1 text-[14px]">{TOURNAMENT_TIEBREAKERS[k] ?? k}</span>
                    <MoveButtons index={i} length={f.tiebreakers.length} onMove={(a, b) => set('tiebreakers', move(f.tiebreakers, a, b))} />
                    <button className="rounded-lg p-1.5 text-mute hover:text-live" onClick={() => set('tiebreakers', f.tiebreakers.filter((x) => x !== k))} aria-label="Remover">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              {missing.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {missing.map((k) => (
                    <button key={k} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] text-white/75 hover:bg-white/[0.1]" onClick={() => set('tiebreakers', [...f.tiebreakers, k])}>
                      + {TOURNAMENT_TIEBREAKERS[k]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <Confirm open={!!delId} onClose={() => setDelId(null)} title={`Excluir ${delId?.name}?`} danger confirmLabel="Excluir" loading={remove.isPending} onConfirm={() => delId && remove.mutate([delId.id])}>
        Só é possível excluir torneios sem lances registrados. Para torneios encerrados, prefira desativar.
      </Confirm>
    </div>
  );
}
