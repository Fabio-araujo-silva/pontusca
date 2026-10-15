// Equipe: admins e mesários, com as modalidades que cada mesário pode registrar.
import { CalendarDays, Pencil, Plus, Trash2, UserCog } from 'lucide-react';
import { useState } from 'react';
import type { Role } from '@shared/types';
import { Button, Confirm, cx, Empty, Segmented, Sheet } from '@/components/ui/primitives';
import { SportIcon } from '@/components/ui/SportIcon';
import { del, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AdminUser, useAdmin } from './ctx';
import { PersonGames } from './Staff';
import { Field, MATCH_DATA_KEYS, PageHeader, Toggle, useAction } from './ui';

interface Form {
  id?: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  phone: string;
  active: boolean;
  sportIds: string[];
}

const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', MESARIO: 'Mesário' };

export default function Team() {
  const { users, sports, refresh } = useAdmin();
  const { user: me } = useAuth();
  const [f, setF] = useState<Form | null>(null);
  const [delU, setDelU] = useState<AdminUser | null>(null);
  const [games, setGames] = useState<AdminUser | null>(null);
  const [filter, setFilter] = useState<'all' | Role>('all');

  const save = useAction(
    (x: Form) => {
      const body = { name: x.name, email: x.email, role: x.role, phone: x.phone || null, active: x.active, sportIds: x.sportIds, ...(x.password && { password: x.password }) };
      return x.id ? patch(`/admin/users/${x.id}`, body) : post('/admin/users', body);
    },
    { ok: 'Pessoa salva', onDone: () => (refresh('users'), setF(null)) },
  );
  const remove = useAction((id: string) => del(`/admin/users/${id}`), { ok: 'Pessoa removida', invalidate: MATCH_DATA_KEYS, onDone: () => setDelU(null) });

  const edit = (u?: AdminUser, role: Role = 'MESARIO') =>
    setF(u ? { id: u.id, name: u.name, email: u.email, password: '', role: u.role, phone: u.phone ?? '', active: u.active, sportIds: u.sportIds } : { name: '', email: '', password: '', role, phone: '', active: true, sportIds: [] });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  const list = users.filter((u) => filter === 'all' || u.role === filter);
  const sportName = new Map(sports.map((s) => [s.id, s]));

  return (
    <div>
      <PageHeader
        title="Equipe"
        subtitle="Admins cuidam do painel; mesários registram os placares na beira da quadra"
        actions={
          <>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => edit(undefined, 'ADMIN')}>
              Admin
            </Button>
            <Button variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => edit()}>
              Mesário
            </Button>
          </>
        }
      />
      <Segmented
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: `Todos · ${users.length}` },
          { value: 'MESARIO', label: `Mesários · ${users.filter((u) => u.role === 'MESARIO').length}` },
          { value: 'ADMIN', label: `Admins · ${users.filter((u) => u.role === 'ADMIN').length}` },
        ]}
      />
      {list.length === 0 ? (
        <div className="card">
          <Empty icon={<UserCog className="h-6 w-6" />} title="Ninguém aqui" />
        </div>
      ) : (
        <div className="card divide-y divide-white/[0.05] overflow-hidden">
          {list.map((u) => (
            <div key={u.id} className={cx('flex flex-wrap items-center gap-3 px-4 py-3', !u.active && 'opacity-50')}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.07] font-display text-[17px] font-bold">
                {u.name
                  .split(' ')
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex items-center gap-2 text-[14px] font-semibold">
                  {u.name}
                  <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', u.role === 'ADMIN' ? 'bg-brand/15 text-brand' : 'bg-white/10 text-white/70')}>{ROLE_LABEL[u.role]}</span>
                  {!u.active && <span className="text-[11px] text-mute">desativado</span>}
                </div>
                <div className="truncate text-[12px] text-mute">
                  {u.email}
                  {u.phone ? ` · ${u.phone}` : ''}
                </div>
              </div>
              {u.role === 'MESARIO' && (
                <div className="flex min-w-0 max-w-md flex-1 flex-wrap gap-1">
                  {u.sportIds.length === 0 && <span className="text-[12px] font-semibold text-warn">nenhuma modalidade</span>}
                  {u.sportIds.length >= sports.length && sports.length > 0 ? (
                    <span className="text-[12px] text-mute">todas as modalidades</span>
                  ) : (
                    u.sportIds.slice(0, 8).map((id) => (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/75">
                        <SportIcon name={sportName.get(id)?.icon} size={12} />
                        {sportName.get(id)?.name}
                      </span>
                    ))
                  )}
                  {u.sportIds.length > 8 && u.sportIds.length < sports.length && <span className="text-[11px] text-mute">+{u.sportIds.length - 8}</span>}
                </div>
              )}
              <button
                onClick={() => setGames(u)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-white/85 hover:bg-white/[0.1]"
                title="Ver e atribuir jogos"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {u.matches} titular · {u.backupMatches} reserva
              </button>
              <button className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-white" onClick={() => edit(u)} aria-label="Editar">
                <Pencil className="h-4 w-4" />
              </button>
              <button className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-live disabled:opacity-20" disabled={u.id === me?.id} onClick={() => setDelU(u)} aria-label="Excluir">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <PersonGames user={games} onClose={() => setGames(null)} />
      <Sheet
        open={!!f}
        onClose={() => setF(null)}
        wide
        title={f?.id ? `Editar ${f.name}` : f?.role === 'ADMIN' ? 'Novo admin' : 'Novo mesário'}
        footer={
          <Button variant="brand" className="w-full" loading={save.isPending} onClick={() => f && save.mutate([f])}>
            Salvar
          </Button>
        }
      >
        {f && (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome">
                <input className="field" value={f.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="E-mail (login)">
                <input className="field" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label={f.id ? 'Nova senha (opcional)' : 'Senha inicial'} hint={f.id ? 'Deixe vazio pra manter a atual' : 'Mínimo 6 caracteres — passe pra pessoa'}>
                <input className="field" type="text" autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} />
              </Field>
              <Field label="Telefone / WhatsApp">
                <input className="field" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(16) 9…" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Papel">
                <div className="flex gap-1.5">
                  {(['MESARIO', 'ADMIN'] as Role[]).map((r) => (
                    <button key={r} type="button" onClick={() => set('role', r)} className={cx('flex-1 rounded-xl py-2.5 text-[14px] font-semibold ring-1 ring-white/10', f.role === r ? 'bg-white text-black' : 'bg-ink-800 text-white/70')}>
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="flex items-end">
                <Toggle checked={f.active} onChange={(v) => set('active', v)} label="Ativo" hint="Desativados não conseguem entrar" />
              </div>
            </div>
            {f.role === 'MESARIO' ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="label mb-0">Modalidades que pode registrar · {f.sportIds.length}</span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => set('sportIds', sports.map((s) => s.id))}>
                      Todas
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => set('sportIds', [])}>
                      Nenhuma
                    </Button>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sports.map((s) => {
                    const on = f.sportIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => set('sportIds', on ? f.sportIds.filter((x) => x !== s.id) : [...f.sportIds, s.id])}
                        className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition', on ? 'bg-white text-black' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]')}
                      >
                        <SportIcon name={s.icon} size={14} />
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="rounded-xl bg-white/[0.04] p-3 text-[13px] text-mute">Admins acessam o painel inteiro e podem operar qualquer jogo.</p>
            )}
          </div>
        )}
      </Sheet>

      <Confirm open={!!delU} onClose={() => setDelU(null)} title={`Remover ${delU?.name}?`} danger confirmLabel="Remover" loading={remove.isPending} onConfirm={() => delU && remove.mutate([delU.id])}>
        Os jogos em que a pessoa estava escalada ficam sem mesário. Pra só bloquear o acesso, prefira desativar.
      </Confirm>
    </div>
  );
}
