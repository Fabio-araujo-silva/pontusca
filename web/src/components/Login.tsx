import { motion } from 'framer-motion';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { FormEvent, ReactNode, useState } from 'react';
import type { Role } from '@shared/types';
import { useAuth } from '@/lib/auth';
import { Button, Spinner } from './ui/primitives';
import { Logo } from './ui/Logo';

export function Login({ title, subtitle }: { title: string; subtitle: string }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-5">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-brand/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[420px] w-[420px] rounded-full bg-live/10 blur-[120px]" />
      <motion.form initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onSubmit={submit} className="relative w-full max-w-sm">
        <Logo size={36} sub={subtitle} />
        <h1 className="mt-8 font-display text-[40px] font-extrabold uppercase leading-none">{title}</h1>
        <p className="mt-2 text-[14px] text-mute">Entre com o e-mail e a senha que o admin cadastrou.</p>
        <div className="mt-7 space-y-3">
          <label className="relative block">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
            <input className="field h-12 pl-10" type="email" autoComplete="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="relative block">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
            <input className="field h-12 pl-10" type="password" autoComplete="current-password" placeholder="senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
        </div>
        {error && <p className="mt-3 text-[13px] font-medium text-live">{error}</p>}
        <Button type="submit" variant="brand" size="lg" className="mt-6 w-full" loading={busy}>
          Entrar <ArrowRight className="h-4 w-4" />
        </Button>
      </motion.form>
    </div>
  );
}

export function RequireAuth({ roles, title, subtitle, children }: { roles: Role[]; title: string; subtitle: string; children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner />
      </div>
    );
  if (!user) return <Login title={title} subtitle={subtitle} />;
  if (!roles.includes(user.role))
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[15px]">Sua conta ({user.email}) não tem acesso a esta área.</p>
        <Button onClick={logout}>Sair e entrar com outra conta</Button>
      </div>
    );
  return <>{children}</>;
}
