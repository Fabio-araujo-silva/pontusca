// Pontuação do torneio: regras (quanto vale cada resultado), classificação
// final por modalidade, ajustes manuais e prévia do placar geral.
import { useQuery } from '@tanstack/react-query';
import { Medal, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MODALITY_TIEBREAKERS, type Gender, type StandingsDTO } from '@shared/types';
import { Button, Confirm, cx, Empty, Segmented, Sheet, Spinner } from '@/components/ui/primitives';
import { SportIcon } from '@/components/ui/SportIcon';
import { TeamFlag } from '@/components/ui/TeamFlag';
import { del, get, post, put } from '@/lib/api';
import { fmtScore, GENDER } from '@/lib/format';
import { useAdmin } from './ctx';
import { Field, move, MoveButtons, NumInput, PageHeader, Select, useAction } from './ui';

interface Rule {
  id?: string;
  tournamentId: string;
  sportId: string | null;
  gender: Gender | null;
  win: number;
  draw: number;
  loss: number;
  woWin: number;
  woLoss: number;
  participation: number;
  placementPoints: number[];
  racePoints: number[];
  tiebreakers: string[];
}
interface Placement {
  id: string;
  sportId: string;
  gender: Gender;
  institutionId: string;
  position: number;
}
interface Adjustment {
  id: string;
  institutionId: string;
  points: number;
  reason: string;
  createdAt: string;
}
interface ScoringData {
  rules: Rule[];
  placements: Placement[];
  adjustments: Adjustment[];
  standings: StandingsDTO;
}

type Tab = 'rules' | 'placements' | 'adjust' | 'preview';

export default function Scoring() {
  const { tournamentId, tournament } = useAdmin();
  const key = ['admin', 'scoring', tournamentId];
  const q = useQuery({ queryKey: key, queryFn: () => get<ScoringData>(`/admin/scoring?tournamentId=${tournamentId}`), enabled: !!tournamentId });
  const [tab, setTab] = useState<Tab>('rules');

  return (
    <div>
      <PageHeader
        title="Pontuação"
        subtitle={
          <>
            Como as atléticas somam pontos no <b className="text-white/80">{tournament?.name} {tournament?.edition}</b>: pontos por jogo (vitória/empate/derrota) + pontos pela colocação final em cada modalidade + pontos por colocação em provas + ajustes manuais.
          </>
        }
      />
      <Segmented
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'rules', label: 'Regras' },
          { value: 'placements', label: 'Classificação final' },
          { value: 'adjust', label: 'Ajustes' },
          { value: 'preview', label: 'Placar geral' },
        ]}
      />
      {!q.data ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : tab === 'rules' ? (
        <Rules data={q.data} inv={key} />
      ) : tab === 'placements' ? (
        <Placements data={q.data} inv={key} />
      ) : tab === 'adjust' ? (
        <Adjustments data={q.data} inv={key} />
      ) : (
        <Preview data={q.data} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- regras

const blankRule = (tournamentId: string, sportId: string | null = null, gender: Gender | null = null): Rule => ({
  tournamentId,
  sportId,
  gender,
  win: 3,
  draw: 1,
  loss: 0,
  woWin: 3,
  woLoss: 0,
  participation: 0,
  placementPoints: [13, 10, 8, 6, 4, 2, 1],
  racePoints: [9, 7, 6, 5, 4, 3, 2, 1],
  tiebreakers: ['POINTS', 'WINS', 'SCORE_DIFF', 'SCORE_FOR', 'HEAD_TO_HEAD'],
});

function Rules({ data, inv }: { data: ScoringData; inv: unknown[] }) {
  const { tournamentId, sport, sports } = useAdmin();
  const [edit, setEdit] = useState<Rule | null>(null);
  const [delR, setDelR] = useState<Rule | null>(null);
  const save = useAction((r: Rule) => put('/admin/scoring/rules', { ...r, sportId: r.sportId || null, gender: r.gender || null }), { ok: 'Regra salva', invalidate: [inv], onDone: () => setEdit(null) });
  const remove = useAction((id: string) => del(`/admin/scoring/rules/${id}`), { ok: 'Regra removida', invalidate: [inv], onDone: () => setDelR(null) });

  const def = data.rules.find((r) => !r.sportId && !r.gender);
  const specific = data.rules.filter((r) => r !== def);
  const label = (r: Rule) => (r.sportId ? `${sport(r.sportId)?.name ?? '?'}${r.gender ? ` ${GENDER[r.gender]}` : ' (todos naipes)'}` : r.gender ? `Todas · ${GENDER[r.gender]}` : 'Padrão do torneio');

  const Card = ({ r }: { r: Rule }) => (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06]">{r.sportId ? <SportIcon name={sport(r.sportId)?.icon} size={16} /> : <Medal className="h-4 w-4 text-brand" />}</span>
        <h3 className="flex-1 text-[15px] font-bold">{label(r)}</h3>
        <button className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-white" onClick={() => setEdit({ ...r })} aria-label="Editar">
          <Pencil className="h-4 w-4" />
        </button>
        {r !== def && r.id && (
          <button className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-live" onClick={() => setDelR(r)} aria-label="Remover">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        {[
          ['V', r.win],
          ['E', r.draw],
          ['D', r.loss],
          ['V W.O.', r.woWin],
          ['D W.O.', r.woLoss],
          ['Part.', r.participation],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-lg bg-white/[0.04] py-1.5">
            <div className="font-display text-[20px] font-bold tabular">{fmtScore(v as number)}</div>
            <div className="text-[10px] font-semibold uppercase text-mute">{l}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1 text-[12px] text-mute">
        <div>Colocação final: {r.placementPoints.length ? r.placementPoints.map((p, i) => `${i + 1}º ${fmtScore(p)}`).join(' · ') : '—'}</div>
        <div>Provas: {r.racePoints.length ? r.racePoints.map((p, i) => `${i + 1}º ${fmtScore(p)}`).join(' · ') : '—'}</div>
        <div>Desempate da tabela: {r.tiebreakers.map((t) => MODALITY_TIEBREAKERS[t] ?? t).join(' › ')}</div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-white/[0.03] p-4 text-[13px] leading-relaxed text-white/70">
        A <b>regra padrão</b> vale pra todas as modalidades. Crie <b>regras específicas</b> quando uma modalidade pontua diferente (ex.: futebol vale o dobro). A busca é: modalidade+naipe → modalidade → padrão.
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {def ? <Card r={def} /> : (
          <div className="card flex items-center justify-between p-4">
            <span className="text-[14px]">Sem regra padrão — vale 3/1/0.</span>
            <Button size="sm" onClick={() => setEdit(blankRule(tournamentId ?? ''))}>
              Criar padrão
            </Button>
          </div>
        )}
        {specific.map((r) => (
          <Card key={r.id} r={r} />
        ))}
      </div>
      <Button className="mt-4" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ ...(def ? { ...def, id: undefined } : blankRule(tournamentId ?? '')), sportId: sports[0]?.id ?? null, gender: null })}>
        Regra específica por modalidade
      </Button>

      <Sheet
        open={!!edit}
        onClose={() => setEdit(null)}
        wide
        title={edit ? (edit.id ? `Regra · ${label(edit)}` : 'Nova regra') : ''}
        footer={
          <Button variant="brand" className="w-full" loading={save.isPending} onClick={() => edit && save.mutate([edit])}>
            Salvar regra
          </Button>
        }
      >
        {edit && <RuleForm r={edit} onChange={setEdit} />}
      </Sheet>
      <Confirm open={!!delR} onClose={() => setDelR(null)} title="Remover regra?" danger confirmLabel="Remover" onConfirm={() => delR?.id && remove.mutate([delR.id])}>
        A modalidade volta a usar a regra padrão.
      </Confirm>
    </div>
  );
}

function PointsList({ label, value, onChange, hint }: { label: string; value: number[]; onChange: (v: number[]) => void; hint: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {value.map((p, i) => (
          <div key={i} className="flex items-center gap-1 rounded-xl bg-ink-800 py-1 pl-2.5 pr-1 ring-1 ring-white/10">
            <span className="text-[12px] font-bold text-mute">{i + 1}º</span>
            <input type="number" className="w-12 bg-transparent text-center font-display text-[17px] font-bold" value={p} step={0.5} onChange={(e) => onChange(value.map((x, j) => (j === i ? Number(e.target.value) : x)))} />
          </div>
        ))}
        <button type="button" className="rounded-xl bg-white/[0.06] px-3 py-2 text-[13px] font-semibold hover:bg-white/[0.1]" onClick={() => onChange([...value, Math.max(0, (value[value.length - 1] ?? 1) - 1)])}>
          +
        </button>
        {value.length > 0 && (
          <button type="button" className="rounded-xl bg-white/[0.06] px-3 py-2 text-[13px] font-semibold hover:bg-white/[0.1]" onClick={() => onChange(value.slice(0, -1))}>
            −
          </button>
        )}
      </div>
      <p className="mt-1 text-[12px] text-mute-2">{hint}</p>
    </div>
  );
}

function RuleForm({ r, onChange }: { r: Rule; onChange: (r: Rule) => void }) {
  const { sports } = useAdmin();
  const set = <K extends keyof Rule>(k: K, v: Rule[K]) => onChange({ ...r, [k]: v });
  const showScope = !(r.id && !r.sportId && !r.gender); // a regra padrão não troca de escopo
  const missing = Object.keys(MODALITY_TIEBREAKERS).filter((k) => !r.tiebreakers.includes(k));
  return (
    <div className="grid gap-5">
      {showScope && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Modalidade">
            <Select value={r.sportId ?? ''} onChange={(v) => set('sportId', v || null)}>
              <option value="">Todas (padrão)</option>
              {sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Naipe">
            <Select value={r.gender ?? ''} onChange={(v) => set('gender', (v || null) as Gender | null)}>
              <option value="">Todos</option>
              {(['M', 'F', 'X'] as Gender[]).map((g) => (
                <option key={g} value={g}>
                  {GENDER[g]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <div>
        <span className="label">Pontos por jogo</span>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {(
            [
              ['win', 'Vitória'],
              ['draw', 'Empate'],
              ['loss', 'Derrota'],
              ['woWin', 'Vitória W.O.'],
              ['woLoss', 'Derrota W.O.'],
              ['participation', 'Participação'],
            ] as const
          ).map(([k, l]) => (
            <Field key={k} label={l}>
              <NumInput value={r[k]} step={0.5} onChange={(v) => set(k, v ?? 0)} className="text-center font-display text-[18px] font-bold" />
            </Field>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-mute-2">Derrota por W.O. pode ser negativa (punição). Participação soma em todo jogo disputado.</p>
      </div>
      <PointsList label="Pontos pela colocação final na modalidade" value={r.placementPoints} onChange={(v) => set('placementPoints', v)} hint="Somados quando você define a classificação final (aba Classificação final)." />
      <PointsList label="Pontos por colocação em cada prova" value={r.racePoints} onChange={(v) => set('racePoints', v)} hint="Para natação, atletismo e outras provas de ranking: cada prova encerrada distribui esses pontos." />
      <div>
        <span className="label">Desempate da tabela da modalidade</span>
        <div className="space-y-1.5">
          {r.tiebreakers.map((k, i) => (
            <div key={k} className="flex items-center gap-2 rounded-xl bg-ink-800 px-3 py-1.5 ring-1 ring-white/10">
              <span className="w-5 font-display text-[16px] font-bold text-mute">{i + 1}</span>
              <span className="flex-1 text-[14px]">{MODALITY_TIEBREAKERS[k] ?? k}</span>
              <MoveButtons index={i} length={r.tiebreakers.length} onMove={(a, b) => set('tiebreakers', move(r.tiebreakers, a, b))} />
              <button className="rounded-lg p-1.5 text-mute hover:text-live" onClick={() => set('tiebreakers', r.tiebreakers.filter((x) => x !== k))} aria-label="Remover">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        {missing.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {missing.map((k) => (
              <button key={k} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] text-white/75 hover:bg-white/[0.1]" onClick={() => set('tiebreakers', [...r.tiebreakers, k])}>
                + {MODALITY_TIEBREAKERS[k]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- classificação final

function Placements({ data, inv }: { data: ScoringData; inv: unknown[] }) {
  const { tournamentId, sports, institutions, sport, inst } = useAdmin();
  const [sportId, setSportId] = useState(sports[0]?.id ?? '');
  const [gender, setGender] = useState<Gender>('M');
  const [list, setList] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const s = sport(sportId);

  useEffect(() => {
    setList(
      data.placements
        .filter((p) => p.sportId === sportId && p.gender === gender)
        .sort((a, b) => a.position - b.position)
        .map((p) => p.institutionId),
    );
    setDirty(false);
  }, [data.placements, sportId, gender]);

  const save = useAction(() => put('/admin/scoring/placements', { tournamentId, sportId, gender, items: list.map((institutionId, i) => ({ institutionId, position: i + 1 })) }), { ok: 'Classificação salva', invalidate: [inv], onDone: () => setDirty(false) });
  const done = new Set(data.placements.map((p) => `${p.sportId}|${p.gender}`));
  const upd = (l: string[]) => {
    setList(l);
    setDirty(true);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <section className="card p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <Select value={sportId} onChange={(v) => { setSportId(v); const ns = sport(v); if (ns && !ns.genders.includes(gender)) setGender(ns.genders[0]); }} className="w-56">
            {sports.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
          <Select value={gender} onChange={(v) => setGender(v as Gender)} className="w-36">
            {(s?.genders ?? (['M', 'F', 'X'] as Gender[])).map((g) => (
              <option key={g} value={g}>
                {GENDER[g]}
              </option>
            ))}
          </Select>
        </div>
        <p className="mb-3 text-[13px] text-mute">Ordene as atléticas do campeão pra baixo. Ouro, prata e bronze contam medalhas e os pontos de colocação da regra entram no placar geral.</p>
        <div className="space-y-1.5">
          {list.length === 0 && <p className="py-6 text-center text-[13px] text-mute">Sem classificação definida.</p>}
          {list.map((id, i) => {
            const it = inst(id);
            return (
              <div key={id} className="flex items-center gap-3 rounded-xl bg-ink-800 px-3 py-2 ring-1 ring-white/10">
                <span className={cx('w-8 font-display text-[20px] font-extrabold', i === 0 ? 'text-yellow-300' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-mute')}>{i + 1}º</span>
                {it && <TeamFlag inst={it} size={28} />}
                <span className="flex-1 text-[14px] font-semibold">{it?.name ?? '?'}</span>
                <MoveButtons index={i} length={list.length} onMove={(a, b) => upd(move(list, a, b))} />
                <button className="rounded-lg p-1.5 text-mute hover:text-live" onClick={() => upd(list.filter((x) => x !== id))} aria-label="Remover">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <Select value="" onChange={(v) => v && upd([...list, v])} className="flex-1">
            <option value="">+ Adicionar atlética…</option>
            {institutions
              .filter((i) => !list.includes(i.id))
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </Select>
          <Button variant="brand" icon={<Save className="h-4 w-4" />} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate([])}>
            Salvar
          </Button>
        </div>
      </section>
      <aside className="card p-4">
        <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-mute">Modalidades com classificação</h3>
        {done.size === 0 ? (
          <p className="text-[13px] text-mute">Nenhuma ainda.</p>
        ) : (
          <ul className="space-y-1">
            {[...done].map((k) => {
              const [sid, g] = k.split('|');
              const champ = data.placements.find((p) => p.sportId === sid && p.gender === g && p.position === 1);
              return (
                <li key={k}>
                  <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-white/[0.05]" onClick={() => { setSportId(sid); setGender(g as Gender); }}>
                    <SportIcon name={sport(sid)?.icon} size={15} />
                    <span className="flex-1 truncate">
                      {sport(sid)?.name} {GENDER[g as Gender]}
                    </span>
                    {champ && inst(champ.institutionId) && <TeamFlag inst={inst(champ.institutionId)!} size={18} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- ajustes manuais

function Adjustments({ data, inv }: { data: ScoringData; inv: unknown[] }) {
  const { tournamentId, institutions, inst } = useAdmin();
  const [instId, setInstId] = useState('');
  const [points, setPoints] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [delA, setDelA] = useState<Adjustment | null>(null);
  const add = useAction(() => post('/admin/scoring/adjustments', { tournamentId, institutionId: instId, points: points ?? 0, reason }), {
    ok: 'Ajuste aplicado',
    invalidate: [inv],
    onDone: () => (setPoints(null), setReason('')),
  });
  const remove = useAction((id: string) => del(`/admin/scoring/adjustments/${id}`), { ok: 'Ajuste removido', invalidate: [inv], onDone: () => setDelA(null) });

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <section className="card p-4">
        <h3 className="mb-1 text-[15px] font-bold">Mexer na pontuação direto</h3>
        <p className="mb-4 text-[13px] text-mute">Bônus, punição, correção ou pontos de modalidades sem jogos no sistema. Use negativo pra tirar.</p>
        <div className="grid gap-3">
          <Field label="Atlética">
            <Select value={instId} onChange={setInstId}>
              <option value="">Escolha…</option>
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Pontos (+/−)">
            <NumInput value={points} step={0.5} onChange={setPoints} className="font-display text-[20px] font-bold" placeholder="ex.: -5" />
          </Field>
          <Field label="Motivo">
            <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: punição por conduta na torcida" maxLength={200} />
          </Field>
          <Button variant="brand" icon={<Plus className="h-4 w-4" />} disabled={!instId || !points || reason.trim().length < 2} loading={add.isPending} onClick={() => add.mutate([])}>
            Aplicar ajuste
          </Button>
        </div>
      </section>
      <section className="card overflow-hidden">
        {data.adjustments.length === 0 ? (
          <Empty title="Nenhum ajuste">Os ajustes aparecem aqui e entram na coluna “Ajustes” do placar geral.</Empty>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {data.adjustments.map((a) => {
              const it = inst(a.institutionId);
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  {it && <TeamFlag inst={it} size={30} />}
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold">{it?.name}</div>
                    <div className="truncate text-[12px] text-mute">
                      {a.reason} · {new Date(a.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <span className={cx('font-display text-[22px] font-extrabold tabular', a.points >= 0 ? 'text-win' : 'text-live')}>
                    {a.points > 0 ? '+' : ''}
                    {fmtScore(a.points)}
                  </span>
                  <button className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-live" onClick={() => setDelA(a)} aria-label="Remover">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <Confirm open={!!delA} onClose={() => setDelA(null)} title="Remover ajuste?" danger confirmLabel="Remover" onConfirm={() => delA && remove.mutate([delA.id])}>
        {delA && `${delA.points > 0 ? '+' : ''}${fmtScore(delA.points)} pts · ${delA.reason}`}
      </Confirm>
    </div>
  );
}

// ---------------------------------------------------------------- prévia

function Preview({ data }: { data: ScoringData }) {
  const { inst } = useAdmin();
  const rows = data.standings.rows;
  if (!rows.length)
    return (
      <div className="card">
        <Empty icon={<Medal className="h-6 w-6" />} title="Ninguém pontuou ainda">A classificação aparece quando houver jogos encerrados, colocações ou ajustes.</Empty>
      </div>
    );
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead className="text-left text-[11px] uppercase tracking-wider text-mute">
          <tr className="border-b border-white/[0.06]">
            <th className="px-4 py-2.5">#</th>
            <th className="py-2.5">Atlética</th>
            <th className="py-2.5 text-right">Pontos</th>
            <th className="py-2.5 text-right">Jogos</th>
            <th className="py-2.5 text-right">Coloc.</th>
            <th className="py-2.5 text-right">Provas</th>
            <th className="py-2.5 text-right">Ajustes</th>
            <th className="py-2.5 text-center">🥇🥈🥉</th>
            <th className="py-2.5 pr-4 text-right">J · V-E-D</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const it = inst(r.institutionId);
            return (
              <tr key={r.institutionId} className="border-b border-white/[0.04] last:border-0">
                <td className="px-4 py-2.5 font-display text-[18px] font-bold text-mute">{r.position}</td>
                <td className="py-2.5">
                  <span className="flex items-center gap-2 font-semibold">
                    {it && <TeamFlag inst={it} size={24} />}
                    {it?.name ?? '?'}
                  </span>
                </td>
                <td className="py-2.5 text-right font-display text-[20px] font-extrabold tabular">{fmtScore(r.points)}</td>
                <td className="py-2.5 text-right tabular">{fmtScore(r.matchPoints)}</td>
                <td className="py-2.5 text-right tabular">{fmtScore(r.placementPoints)}</td>
                <td className="py-2.5 text-right tabular">{fmtScore(r.racePoints)}</td>
                <td className={cx('py-2.5 text-right tabular', r.adjustments > 0 ? 'text-win' : r.adjustments < 0 ? 'text-live' : '')}>{fmtScore(r.adjustments)}</td>
                <td className="py-2.5 text-center tabular">
                  {r.gold}·{r.silver}·{r.bronze}
                </td>
                <td className="py-2.5 pr-4 text-right tabular text-mute">
                  {r.played} · {r.wins}-{r.draws}-{r.losses}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
