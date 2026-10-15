// Perfil do torcedor, só no aparelho (localStorage): atlética do coração,
// esportes de interesse e o switch "só a minha atlética".
import { useEffect, useState } from 'react';

export interface Profile {
  v: 1;
  atleticaId: string | null;
  sportIds: string[];
  onlyMine: boolean;
  onboarded: boolean;
}

const KEY = 'arq.profile';
const EVT = 'arq:profile';

export const EMPTY_PROFILE: Profile = { v: 1, atleticaId: null, sportIds: [], onlyMine: false, onboarded: false };

export function readProfile(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Profile {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return EMPTY_PROFILE;
    const p = JSON.parse(raw);
    if (p?.v !== 1) return EMPTY_PROFILE;
    return {
      ...EMPTY_PROFILE,
      atleticaId: typeof p.atleticaId === 'string' ? p.atleticaId : null,
      sportIds: Array.isArray(p.sportIds) ? p.sportIds.filter((x: unknown) => typeof x === 'string') : [],
      onlyMine: !!p.onlyMine,
      onboarded: !!p.onboarded,
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function writeProfile(p: Profile, storage: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try {
    storage?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* modo privado: segue só em memória */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT));
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

let memory: Profile | null = null;

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(() => memory ?? readProfile());
  useEffect(() => {
    const on = () => setProfile(memory ?? readProfile());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  const save = (patch: Partial<Profile>) => {
    const next = { ...(memory ?? readProfile()), ...patch };
    memory = next;
    writeProfile(next);
  };
  return { profile, save };
}
