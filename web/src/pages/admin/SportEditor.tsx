// Editor completo de modalidade: motor de placar, períodos/sets/tênis/
// beisebol/ranking e os botões (ações) que o mesário vê no console.
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { ReactNode, useState } from 'react';
import type { ActionKind, EngineKind, Gender, SportAction, SportConfig } from '@shared/types';
import { Button, cx, Sheet } from '@/components/ui/primitives';
import { SPORT_ICON_KEYS, SportIcon } from '@/components/ui/SportIcon';
import { GENDER } from '@/lib/format';
import { Field, move, MoveButtons, NumInput, Select, Toggle } from './ui';

export interface SportForm {
  id?: string;
  name: string;
  icon: string;
  category: 'team' | 'individual' | 'race';
  genders: Gender[];
  active: boolean;
  order: number;
  config: SportConfig;
}

export const ENGINE_INFO: Record<EngineKind, { label: string; hint: string }> = {
  SCORE: { label: 'Placar somado', hint: 'Gols/pontos por ação, com períodos e relógio (futebol, basquete, lutas…)' },
  SETS: { label: 'Sets', hint: 'Ponto a ponto, set fecha no alvo (vôlei, tênis de mesa, e-sports…)' },
  TENNIS: { label: 'Tênis', hint: '15/30/40, games, sets e tie-break (tênis, padel, beach tennis)' },
  BASEBALL: { label: 'Beisebol', hint: 'Entradas, contagem, bases e R-H-E (beisebol, softbol)' },
  RANKING: { label: 'Ranking', hint: 'Prova com vários participantes e marca (natação, atletismo…)' },
};

const KIND_LABEL: Record<ActionKind, string> = { score: 'Pontua', card: 'Cartão', sub: 'Substituição', foul: 'Falta', timeout: 'Pedido de tempo', stat: 'Estatística' };

/** Config padrão de cada motor ao trocar o tipo. */
export function defaultConfig(engine: EngineKind, prev?: SportConfig): SportConfig {
  const base = { engine, allowDraw: engine === 'SCORE', actions: prev?.actions ?? [], lineup: prev?.lineup ?? { starters: 5 } } as SportConfig;
  switch (engine) {
    case 'SCORE':
      return {
        ...base,
        scoreLabel: 'Pontos',
        periods: prev?.periods ?? { count: 2, label: 'Tempo', short: 'T', durationMin: 20, clock: 'up', display: 'minute', breakLabel: 'Intervalo' },
        overtime: null,
        shootout: null,
        actions: base.actions.length ? base.actions : [{ key: 'point', label: '+1', kind: 'score', value: 1, athlete: 'optional' }],
      };
    case 'SETS':
      return { ...base, scoreLabel: 'Sets', sets: { bestOf: 3, target: 25, decidingTarget: 15, winBy: 2, cap: null, label: 'Set' } };
    case 'TENNIS':
      return { ...base, actions: [], scoreLabel: 'Sets', tennis: { bestOf: 3, gamesPerSet: 6, tiebreakAt: 6, tiebreakTarget: 7, superTiebreak: 10, noAd: false } };
    case 'BASEBALL':
      return { ...base, scoreLabel: 'Corridas', baseball: { innings: 9 } };
    case 'RANKING':
      return { engine, allowDraw: false, actions: [], ranking: { order: 'asc', format: 'time', unit: 's', resultLabel: 'Tempo' } };
  }
}

/** Remove blocos de outros motores antes de mandar pro back. */
export function cleanConfig(c: SportConfig): SportConfig {
  const out: SportConfig = { engine: c.engine, allowDraw: c.allowDraw, actions: c.actions, ...(c.scoreLabel && { scoreLabel: c.scoreLabel }) };
  if (c.engine !== 'RANKING' && c.lineup) out.lineup = { starters: c.lineup.starters, ...(c.lineup.positions?.length && { positions: c.lineup.positions }) };
  if (c.engine === 'SCORE') {
    out.periods = c.periods;
    out.overtime = c.overtime ?? null;
    out.shootout = c.shootout ?? null;
  }
  if (c.engine === 'SETS') out.sets = c.sets;
  if (c.engine === 'TENNIS') out.tennis = c.tennis;
  if (c.engine === 'BASEBALL') out.baseball = c.baseball;
  if (c.engine === 'RANKING') out.ranking = c.ranking;
  out.actions = c.actions.map((a) => {
    const x: SportAction = { key: a.key, label: a.label, kind: a.kind };
    if (a.kind === 'score') {
      x.value = a.value ?? 1;
      if (a.against) x.against = true;
      if (a.both) x.both = true;
      if (a.decisive) x.decisive = true;
    }
    if (a.kind === 'card') x.color = a.color ?? 'yellow';
    if (a.athlete) x.athlete = a.athlete;
    if (a.celebrate) x.celebrate = a.celebrate;
    if (a.short) x.short = a.short;
    return x;
  });
  return out;
}

export function SportEditorSheet({ form, onChange, onClose, onSave, saving }: { form: SportForm | null; onChange: (f: SportForm) => void; onClose: () => void; onSave: () => void; saving: boolean }) {
  const [iconOpen, setIconOpen] = useState(false);
  const [openAction, setOpenAction] = useState<number | null>(null);
  if (!form) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const c = form.config;
  const set = <K extends keyof SportForm>(k: K, v: SportForm[K]) => onChange({ ...form, [k]: v });
  const cfg = (patchC: Partial<SportConfig>) => onChange({ ...form, config: { ...c, ...patchC } });
  const setAction = (i: number, p: Partial<SportAction>) => cfg({ actions: c.actions.map((a, j) => (j === i ? { ...a, ...p } : a)) });

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title={form.id ? `Editar ${form.name}` : 'Nova modalidade'}
      footer={
        <Button variant="brand" className="w-full" loading={saving} onClick={onSave}>
          Salvar modalidade
        </Button>
      }
    >
      <div className="grid gap-5">
        {/* básico */}
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_160px_90px]">
          <Field label="Ícone">
            <button type="button" onClick={() => setIconOpen(!iconOpen)} className="flex h-11 w-14 items-center justify-center gap-1 rounded-xl bg-ink-800 ring-1 ring-white/10">
              <SportIcon name={form.icon} size={22} />
              <ChevronDown className="h-3 w-3 text-mute" />
            </button>
          </Field>
          <Field label="Nome">
            <input className="field" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Categoria">
            <Select value={form.category} onChange={(v) => set('category', v as SportForm['category'])}>
              <option value="team">Coletiva</option>
              <option value="individual">Individual</option>
              <option value="race">Prova</option>
            </Select>
          </Field>
          <Field label="Ordem">
            <NumInput value={form.order} onChange={(v) => set('order', v ?? 0)} />
          </Field>
        </div>
        {iconOpen && (
          <div className="grid grid-cols-6 gap-1.5 rounded-2xl bg-white/[0.03] p-2 sm:grid-cols-12">
            {SPORT_ICON_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                title={k}
                onClick={() => {
                  set('icon', k);
                  setIconOpen(false);
                }}
                className={cx('flex aspect-square items-center justify-center rounded-xl', form.icon === k ? 'bg-white text-black' : 'text-white/75 hover:bg-white/10')}
              >
                <SportIcon name={k} size={22} />
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Naipes">
            <div className="flex gap-1.5">
              {(['M', 'F', 'X'] as Gender[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set('genders', form.genders.includes(g) ? form.genders.filter((x) => x !== g) : [...form.genders, g])}
                  className={cx('flex-1 rounded-xl py-2.5 text-[14px] font-semibold ring-1 ring-white/10', form.genders.includes(g) ? 'bg-white text-black' : 'bg-ink-800 text-white/70')}
                >
                  {GENDER[g]}
                </button>
              ))}
            </div>
          </Field>
          <div className="flex items-end">
            <Toggle checked={form.active} onChange={(v) => set('active', v)} label="Ativa" hint="Inativas não aparecem para criar jogos" />
          </div>
        </div>

        {/* motor */}
        <div>
          <span className="label">Motor de placar</span>
          <div className="grid gap-2 sm:grid-cols-5">
            {(Object.keys(ENGINE_INFO) as EngineKind[]).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => e !== c.engine && cfg(defaultConfig(e, c))}
                className={cx('rounded-xl p-3 text-left ring-1 transition', c.engine === e ? 'bg-white/[0.08] ring-brand' : 'ring-white/10 hover:bg-white/[0.04]')}
              >
                <div className="text-[13px] font-bold">{ENGINE_INFO[e].label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-mute">{ENGINE_INFO[e].hint}</div>
              </button>
            ))}
          </div>
          {form.id && <p className="mt-1.5 text-[12px] text-mute-2">Trocar o motor só é permitido se nenhum jogo da modalidade tiver lances.</p>}
        </div>

        {c.engine !== 'RANKING' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nome do placar">
              <input className="field" value={c.scoreLabel ?? ''} onChange={(e) => cfg({ scoreLabel: e.target.value })} placeholder="Gols, Pontos, Sets…" />
            </Field>
            <div className="flex items-end sm:col-span-2">
              <Toggle checked={c.allowDraw} onChange={(v) => cfg({ allowDraw: v })} label="Permite empate" />
            </div>
          </div>
        )}

        {/* específico do motor */}
        {c.engine === 'SCORE' && c.periods && (
          <Block title="Períodos e relógio">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Quantidade">
                <NumInput value={c.periods.count} min={1} max={12} onChange={(v) => cfg({ periods: { ...c.periods!, count: v ?? 1 } })} />
              </Field>
              <Field label="Rótulo">
                <input className="field" value={c.periods.label} onChange={(e) => cfg({ periods: { ...c.periods!, label: e.target.value } })} placeholder="Tempo, Quarto" />
              </Field>
              <Field label="Sigla">
                <input className="field" value={c.periods.short} maxLength={4} onChange={(e) => cfg({ periods: { ...c.periods!, short: e.target.value } })} placeholder="T, Q" />
              </Field>
              <Field label="Duração (min)" hint="vazio = sem relógio">
                <NumInput value={c.periods.durationMin} step={0.5} onChange={(v) => cfg({ periods: { ...c.periods!, durationMin: v } })} />
              </Field>
              <Field label="Relógio">
                <Select value={c.periods.clock} onChange={(v) => cfg({ periods: { ...c.periods!, clock: v as 'up' | 'down' | 'none' } })}>
                  <option value="up">Progressivo</option>
                  <option value="down">Regressivo</option>
                  <option value="none">Sem relógio</option>
                </Select>
              </Field>
              <Field label="Exibição">
                <Select value={c.periods.display} onChange={(v) => cfg({ periods: { ...c.periods!, display: v as 'minute' | 'mmss' } })}>
                  <option value="minute">Minuto (67')</option>
                  <option value="mmss">mm:ss (08:34)</option>
                </Select>
              </Field>
              <Field label="Intervalo" className="sm:col-span-2">
                <input className="field" value={c.periods.breakLabel} onChange={(e) => cfg({ periods: { ...c.periods!, breakLabel: e.target.value } })} />
              </Field>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Toggle checked={!!c.overtime} onChange={(v) => cfg({ overtime: v ? { count: 2, durationMin: 15, label: 'Prorrogação', short: 'PR' } : null })} label="Prorrogação" />
                {c.overtime && (
                  <div className="grid grid-cols-4 gap-2">
                    <NumInput value={c.overtime.count} min={1} onChange={(v) => cfg({ overtime: { ...c.overtime!, count: v ?? 1 } })} placeholder="qtd" />
                    <NumInput value={c.overtime.durationMin} step={0.5} onChange={(v) => cfg({ overtime: { ...c.overtime!, durationMin: v } })} placeholder="min" />
                    <input className="field" value={c.overtime.label} onChange={(e) => cfg({ overtime: { ...c.overtime!, label: e.target.value } })} />
                    <input className="field" value={c.overtime.short} maxLength={4} onChange={(e) => cfg({ overtime: { ...c.overtime!, short: e.target.value } })} />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Toggle checked={!!c.shootout} onChange={(v) => cfg({ shootout: v ? { label: 'Pênaltis', kicks: 5 } : null })} label="Disputa de pênaltis / shoot-out" />
                {c.shootout && (
                  <div className="grid grid-cols-[1fr_90px] gap-2">
                    <input className="field" value={c.shootout.label} onChange={(e) => cfg({ shootout: { ...c.shootout!, label: e.target.value } })} />
                    <NumInput value={c.shootout.kicks} min={1} max={10} onChange={(v) => cfg({ shootout: { ...c.shootout!, kicks: v ?? 5 } })} placeholder="cobranças" />
                  </div>
                )}
              </div>
            </div>
          </Block>
        )}

        {c.engine === 'SETS' && c.sets && (
          <Block title="Sets">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Melhor de">
                <NumInput value={c.sets.bestOf} min={1} max={9} onChange={(v) => cfg({ sets: { ...c.sets!, bestOf: v ?? 3 } })} />
              </Field>
              <Field label="Pontos para fechar" hint="vazio = set marcado manualmente">
                <NumInput value={c.sets.target} onChange={(v) => cfg({ sets: { ...c.sets!, target: v } })} />
              </Field>
              <Field label="Set decisivo">
                <NumInput value={c.sets.decidingTarget ?? null} onChange={(v) => cfg({ sets: { ...c.sets!, decidingTarget: v } })} />
              </Field>
              <Field label="Vantagem mínima">
                <NumInput value={c.sets.winBy} min={1} max={5} onChange={(v) => cfg({ sets: { ...c.sets!, winBy: v ?? 2 } })} />
              </Field>
              <Field label="Teto (opcional)" hint="Ex.: badminton fecha no 30">
                <NumInput value={c.sets.cap ?? null} onChange={(v) => cfg({ sets: { ...c.sets!, cap: v } })} />
              </Field>
              <Field label="Rótulo">
                <input className="field" value={c.sets.label} onChange={(e) => cfg({ sets: { ...c.sets!, label: e.target.value } })} placeholder="Set, Mapa, Game" />
              </Field>
            </div>
          </Block>
        )}

        {c.engine === 'TENNIS' && c.tennis && (
          <Block title="Tênis">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Melhor de (sets)">
                <NumInput value={c.tennis.bestOf} min={1} max={5} onChange={(v) => cfg({ tennis: { ...c.tennis!, bestOf: v ?? 3 } })} />
              </Field>
              <Field label="Games por set">
                <NumInput value={c.tennis.gamesPerSet} onChange={(v) => cfg({ tennis: { ...c.tennis!, gamesPerSet: v ?? 6 } })} />
              </Field>
              <Field label="Tie-break em">
                <NumInput value={c.tennis.tiebreakAt} onChange={(v) => cfg({ tennis: { ...c.tennis!, tiebreakAt: v ?? 6 } })} />
              </Field>
              <Field label="Tie-break até">
                <NumInput value={c.tennis.tiebreakTarget} onChange={(v) => cfg({ tennis: { ...c.tennis!, tiebreakTarget: v ?? 7 } })} />
              </Field>
              <Field label="Super tie-break" hint="vazio = set decisivo normal">
                <NumInput value={c.tennis.superTiebreak} onChange={(v) => cfg({ tennis: { ...c.tennis!, superTiebreak: v } })} />
              </Field>
              <div className="flex items-end">
                <Toggle checked={c.tennis.noAd} onChange={(v) => cfg({ tennis: { ...c.tennis!, noAd: v } })} label="Ponto decisivo (sem vantagem)" />
              </div>
            </div>
          </Block>
        )}

        {c.engine === 'BASEBALL' && (
          <Block title="Beisebol">
            <Field label="Entradas" className="max-w-[160px]">
              <NumInput value={c.baseball?.innings ?? 9} min={1} max={15} onChange={(v) => cfg({ baseball: { innings: v ?? 9 } })} />
            </Field>
          </Block>
        )}

        {c.engine === 'RANKING' && c.ranking && (
          <Block title="Prova">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Vence quem tem">
                <Select value={c.ranking.order} onChange={(v) => cfg({ ranking: { ...c.ranking!, order: v as 'asc' | 'desc' } })}>
                  <option value="asc">Menor marca (tempo)</option>
                  <option value="desc">Maior marca (distância/nota)</option>
                </Select>
              </Field>
              <Field label="Formato">
                <Select value={c.ranking.format} onChange={(v) => cfg({ ranking: { ...c.ranking!, format: v as 'time' | 'decimal' | 'integer' } })}>
                  <option value="time">Tempo (1:02.35)</option>
                  <option value="decimal">Decimal (6,45)</option>
                  <option value="integer">Inteiro (285)</option>
                </Select>
              </Field>
              <Field label="Unidade">
                <input className="field" value={c.ranking.unit} maxLength={6} onChange={(e) => cfg({ ranking: { ...c.ranking!, unit: e.target.value } })} />
              </Field>
              <Field label="Rótulo da marca">
                <input className="field" value={c.ranking.resultLabel} onChange={(e) => cfg({ ranking: { ...c.ranking!, resultLabel: e.target.value } })} />
              </Field>
            </div>
          </Block>
        )}

        {c.engine !== 'RANKING' && (
          <Block title="Escalação">
            <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
              <Field label="Titulares">
                <NumInput value={c.lineup?.starters ?? 0} min={0} max={30} onChange={(v) => cfg({ lineup: { ...(c.lineup ?? {}), starters: v ?? 0 } })} />
              </Field>
              <Field label="Posições (separadas por vírgula)">
                <input
                  className="field uppercase"
                  value={(c.lineup?.positions ?? []).join(', ')}
                  onChange={(e) =>
                    cfg({
                      lineup: {
                        starters: c.lineup?.starters ?? 0,
                        positions: e.target.value
                          .split(',')
                          .map((x) => x.trim().toUpperCase())
                          .filter(Boolean)
                          .slice(0, 20),
                      },
                    })
                  }
                  placeholder="GOL, ZAG, MEI, ATA"
                />
              </Field>
            </div>
          </Block>
        )}

        {c.engine !== 'RANKING' && c.engine !== 'TENNIS' && (
          <Block title={`Botões do mesário (${c.actions.length})`}>
            <p className="mb-3 text-[12px] text-mute">Cada ação vira um botão no console. “Pontua” soma no placar; os demais viram lances e estatísticas.</p>
            <div className="space-y-2">
              {c.actions.map((a, i) => (
                <div key={i} className="rounded-xl bg-ink-800 ring-1 ring-white/10">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <MoveButtons index={i} length={c.actions.length} onMove={(x, y) => cfg({ actions: move(c.actions, x, y) })} />
                    <input className="field h-9 w-28 py-1 text-[13px] font-semibold" value={a.label} onChange={(e) => setAction(i, { label: e.target.value })} placeholder="Rótulo" />
                    <Select value={a.kind} onChange={(v) => setAction(i, { kind: v as ActionKind })} className="h-9 w-36 py-1 text-[13px]">
                      {(Object.keys(KIND_LABEL) as ActionKind[]).map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </Select>
                    {a.kind === 'score' && <NumInput value={a.value ?? 1} step={0.5} onChange={(v) => setAction(i, { value: v ?? 1 })} className="h-9 w-16 py-1 text-center text-[13px]" />}
                    <span className="hidden min-w-0 flex-1 truncate text-[12px] text-mute sm:block">
                      {[a.against && 'contra', a.both && 'ambos', a.decisive && 'decisivo', a.celebrate && `“${a.celebrate}”`].filter(Boolean).join(' · ')}
                    </span>
                    <button type="button" className="ml-auto rounded-lg p-1.5 text-mute hover:text-white" onClick={() => setOpenAction(openAction === i ? null : i)} aria-label="Detalhes">
                      <ChevronDown className={cx('h-4 w-4 transition', openAction === i && 'rotate-180')} />
                    </button>
                    <button type="button" className="rounded-lg p-1.5 text-mute hover:text-live" onClick={() => cfg({ actions: c.actions.filter((_, j) => j !== i) })} aria-label="Remover">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {openAction === i && (
                    <div className="grid gap-3 border-t border-white/[0.06] p-3 sm:grid-cols-3">
                      <Field label="Chave" hint="a-z, 0-9 e _ (não mude depois de usar)">
                        <input className="field font-mono" value={a.key} onChange={(e) => setAction(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
                      </Field>
                      <Field label="Nome no lance">
                        <input className="field" value={a.short ?? ''} onChange={(e) => setAction(i, { short: e.target.value || undefined })} placeholder="Cesta de 3" />
                      </Field>
                      <Field label="Pede atleta?">
                        <Select value={a.athlete ?? 'optional'} onChange={(v) => setAction(i, { athlete: v as SportAction['athlete'] })}>
                          <option value="optional">Opcional</option>
                          <option value="required">Obrigatório</option>
                          <option value="none">Não</option>
                        </Select>
                      </Field>
                      {a.kind === 'card' && (
                        <Field label="Cor do cartão">
                          <Select value={a.color ?? 'yellow'} onChange={(v) => setAction(i, { color: v as SportAction['color'] })}>
                            <option value="yellow">Amarelo</option>
                            <option value="red">Vermelho</option>
                            <option value="blue">Azul</option>
                            <option value="green">Verde</option>
                            <option value="white">Branco</option>
                          </Select>
                        </Field>
                      )}
                      <Field label="Comemoração ao vivo" hint="Texto da animação grande, ex.: GOL!">
                        <input className="field uppercase" value={a.celebrate ?? ''} maxLength={24} onChange={(e) => setAction(i, { celebrate: e.target.value.toUpperCase() || undefined })} />
                      </Field>
                      {a.kind === 'score' && (
                        <div className="grid gap-2 sm:col-span-3 sm:grid-cols-3">
                          <Toggle checked={!!a.against} onChange={(v) => setAction(i, { against: v })} label="Contra" hint="Credita o adversário" />
                          <Toggle checked={!!a.both} onChange={(v) => setAction(i, { both: v })} label="Ambos" hint="Soma pros dois (empate ½)" />
                          <Toggle checked={!!a.decisive} onChange={(v) => setAction(i, { decisive: v })} label="Decisivo" hint="Encerra a disputa (ippon)" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Button
              size="sm"
              className="mt-3"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                const key = `acao_${c.actions.length + 1}`;
                cfg({ actions: [...c.actions, { key, label: 'Nova', kind: 'stat', athlete: 'optional' }] });
                setOpenAction(c.actions.length);
              }}
            >
              Adicionar botão
            </Button>
          </Block>
        )}
      </div>
    </Sheet>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/[0.025] p-4 ring-1 ring-white/[0.05]">
      <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-white/80">{title}</h3>
      {children}
    </section>
  );
}
