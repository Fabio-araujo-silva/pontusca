import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MatchCard } from '@/components/match/MatchCard';
import { useMatchDetail } from '@/components/match/MatchDetailPanel';
import { teamsOf } from '@/components/match/helpers';
import { Empty, Spinner } from '@/components/ui/primitives';
import { fmtScore } from '@/lib/format';
import { usePublic } from './PublicLayout';

/** Link direto de um jogo (/jogo/:id) — é o que vai junto no compartilhamento. */
export default function MatchPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { inst, sport } = usePublic();
  const q = useMatchDetail(id);
  const m = q.data;

  useEffect(() => {
    if (!m) return;
    const sp = sport.get(m.sportId)?.name ?? 'Jogo';
    if (m.score.ranking) document.title = `${sp} · ${m.title ?? ''} · PONTUSCA`;
    else {
      const t = teamsOf(m, inst);
      document.title = `${t.home.name} ${fmtScore(m.score.home)} x ${fmtScore(m.score.away)} ${t.away.name} · ${sp}`;
    }
  }, [m, inst, sport]);

  return (
    <div className="px-4 pt-4">
      <button onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-white/80 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>
      {q.isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !m ? (
        <Empty title="Jogo não encontrado">
          <Link to="/" className="text-brand">
            Ver todos os jogos
          </Link>
        </Empty>
      ) : (
        <MatchCard m={m} expanded onToggle={() => undefined} />
      )}
    </div>
  );
}
