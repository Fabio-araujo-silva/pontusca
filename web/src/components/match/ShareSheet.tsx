// Print publicável do placar: arte 1080px renderizada fora da tela e exportada
// como PNG. Duas opções de fundo (atlética 1 ou 2) e dois formatos (feed/story).
import { Download, Share2 } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import type { InstitutionDTO, MatchDetail, SportDTO } from '@shared/types';
import { usePublic } from '@/pages/public/PublicLayout';
import { alpha, fmtScore, GENDER, longDate, mix, onColor } from '@/lib/format';
import { Button, cx, Segmented, Sheet, toast } from '../ui/primitives';
import { LogoMark } from '../ui/Logo';
import { SportIcon } from '../ui/SportIcon';
import { FlagPatternShapes, TeamFlag } from '../ui/TeamFlag';
import { teamsOf } from './helpers';

type Format = 'feed' | 'story';
const SIZE: Record<Format, [number, number]> = { feed: [1080, 1350], story: [1080, 1920] };

export function ShareSheet({ open, onClose, m, sport }: { open: boolean; onClose: () => void; m: MatchDetail; sport?: SportDTO }) {
  const { inst, tournament } = usePublic();
  const ranking = !!m.score.ranking;
  const teams = teamsOf(m, inst);
  const winnerSide = m.winner === 'away' ? 'away' : 'home';
  const [bg, setBg] = useState<'home' | 'away'>(winnerSide);
  const [format, setFormat] = useState<Format>('feed');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => setBg(winnerSide), [winnerSide]);
  useEffect(() => {
    if (!open) return;
    const fit = () => {
      const w = wrap.current?.clientWidth ?? 320;
      const [W, H] = SIZE[format];
      setScale(Math.min(w / W, (window.innerHeight * 0.52) / H));
    };
    fit();
    const t = setTimeout(fit, 60);
    window.addEventListener('resize', fit);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', fit);
    };
  }, [open, format]);

  const rankingBg = ranking ? (m.score.ranking?.find((r) => r.position === 1)?.institutionId ?? m.participantIds?.[0]) : null;
  const bgInst = ranking ? (rankingBg ? inst.get(rankingBg) : undefined) ?? teams.home : teams[bg];

  const render = async () => {
    if (!ref.current) return null;
    await document.fonts.ready;
    const [W, H] = SIZE[format];
    return toPng(ref.current, { width: W, height: H, pixelRatio: 1, cacheBust: true, style: { transform: 'none' } });
  };

  const fileName = () => {
    const t = ranking ? (m.title ?? 'prova') : `${teams.home.name}-${fmtScore(m.score.home)}x${fmtScore(m.score.away)}-${teams.away.name}`;
    return `placar-${t}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-') + '.png';
  };

  const download = async () => {
    setBusy(true);
    try {
      const url = await render();
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName();
      a.click();
    } catch {
      toast.err('Não deu pra gerar a imagem.');
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    setBusy(true);
    try {
      const url = await render();
      if (!url) return;
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], fileName(), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Placar', text: `${window.location.origin}/jogo/${m.id}` });
      else {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName();
        a.click();
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.err('Não deu pra compartilhar.');
    } finally {
      setBusy(false);
    }
  };

  const [W, H] = SIZE[format];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Compartilhar placar"
      tone={bgInst.primaryColor}
      footer={
        <div className="flex gap-2">
          <Button variant="soft" className="flex-1" icon={<Download className="h-4 w-4" />} onClick={download} loading={busy}>
            Baixar
          </Button>
          <Button variant="primary" className="flex-1" icon={<Share2 className="h-4 w-4" />} onClick={share} loading={busy}>
            Compartilhar
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {!ranking && (
          <div className="flex gap-2">
            {(['home', 'away'] as const).map((s) => (
              <button key={s} onClick={() => setBg(s)} className={cx('flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13px] font-semibold ring-1 transition', bg === s ? 'bg-white text-black ring-white' : 'ring-white/15 hover:bg-white/5')}>
                <TeamFlag inst={teams[s]} size={24} />
                {teams[s].name}
              </button>
            ))}
          </div>
        )}
        <Segmented size="sm" className="ml-auto" value={format} onChange={setFormat} options={[{ value: 'feed', label: 'Feed' }, { value: 'story', label: 'Story' }]} />
      </div>
      <div ref={wrap} className="mt-4 flex justify-center">
        <div className="overflow-hidden rounded-2xl shadow-glow" style={{ width: W * scale, height: H * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: W, height: H }}>
            <ShareArt ref={ref} m={m} sport={sport} teams={teams} bgInst={bgInst} format={format} tournament={tournament ? `${tournament.name} ${tournament.edition ?? ''}`.trim() : ''} inst={inst} />
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] text-mute">Escolha o fundo e o formato. A imagem sai em 1080px, pronta pra postar.</p>
    </Sheet>
  );
}

interface ArtProps {
  m: MatchDetail;
  sport?: SportDTO;
  teams: { home: InstitutionDTO; away: InstitutionDTO };
  bgInst: InstitutionDTO;
  format: Format;
  tournament: string;
  inst: Map<string, InstitutionDTO>;
}

const ShareArt = forwardRef<HTMLDivElement, ArtProps>(function ShareArt({ m, sport, teams, bgInst, format, tournament, inst }, ref) {
  const [W, H] = SIZE[format];
  const P = bgInst.primaryColor;
  const S = bgInst.secondaryColor;
  const ink = onColor(mix(P, '#000000', 0.35));
  const story = format === 'story';
  const live = m.status === 'LIVE';
  const status = live ? 'AO VIVO' : m.wo ? 'FINAL · W.O.' : m.score.shootout && (m.score.shootout.home || m.score.shootout.away) ? `FINAL · PÊN. ${m.score.shootout.home}–${m.score.shootout.away}` : 'FINAL';
  const winner = m.winner === 'home' || m.winner === 'away' ? teams[m.winner] : null;
  const scorers = goalsBySide(m);

  return (
    <div ref={ref} style={{ width: W, height: H, background: mix(P, '#000000', 0.55), color: ink, fontFamily: "'Funnel Display Variable', sans-serif", position: 'relative', overflow: 'hidden' }}>
      {/* bandeira gigante inclinada no fundo */}
      <svg width={W * 1.6} height={H * 1.1} viewBox="0 0 150 100" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', left: -W * 0.3, top: -H * 0.05, transform: 'rotate(-8deg)', opacity: 0.9 }}>
        <FlagPatternShapes pattern={bgInst.flagPattern} p={P} s={S} a={bgInst.accentColor} w={150} h={100} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${alpha(mix(P, '#000', 0.5), 0.55)} 0%, ${alpha(mix(P, '#000', 0.75), 0.82)} 45%, ${alpha('#000000', 0.92)} 100%)` }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.07) 1.5px, transparent 1.5px)', backgroundSize: '22px 22px', opacity: 0.6 }} />

      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', padding: story ? '150px 84px 120px' : '84px 84px 72px' }}>
        {/* topo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 30, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.95 }}>
          <SportIcon name={sport?.icon} size={44} strokeWidth={2} />
          <span>
            {sport?.name ?? 'Jogo'} {GENDER[m.gender]}
          </span>
        </div>
        <div style={{ marginTop: 10, fontSize: 26, fontWeight: 600, opacity: 0.7 }}>{[tournament, m.title, m.phase, m.group && `Grupo ${m.group}`].filter(Boolean).join(' · ')}</div>

        {m.score.ranking ? (
          <RankingArt m={m} inst={inst} story={story} />
        ) : (
          <>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <ArtTeam inst={teams.home} dim={m.winner === 'away'} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'inline-block', padding: '10px 26px', borderRadius: 999, background: live ? '#ff3b30' : 'rgba(255,255,255,.14)', color: '#fff', fontSize: 26, fontWeight: 800, letterSpacing: 4 }}>{status}</div>
                </div>
                <ArtTeam inst={teams.away} dim={m.winner === 'home'} />
              </div>
              <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 46, fontFamily: "'Big Shoulders Display Variable', sans-serif", fontWeight: 800, fontSize: story ? 330 : 300, lineHeight: 0.9, letterSpacing: -6 }}>
                <span style={{ opacity: m.winner === 'away' ? 0.5 : 1 }}>{fmtScore(m.score.home)}</span>
                <span style={{ fontSize: 140, opacity: 0.4 }}>–</span>
                <span style={{ opacity: m.winner === 'home' ? 0.5 : 1 }}>{fmtScore(m.score.away)}</span>
              </div>
              {m.score.periods.length > 1 && (
                <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center', gap: 16 }}>
                  {m.score.periods.map((p, i) => (
                    <span key={i} style={{ padding: '8px 18px', borderRadius: 14, background: 'rgba(255,255,255,.1)', fontSize: 30, fontWeight: 700, fontFamily: "'Big Shoulders Display Variable', sans-serif" }}>
                      {fmtScore(p[0])}–{fmtScore(p[1])}
                    </span>
                  ))}
                </div>
              )}
              {(scorers.home.length > 0 || scorers.away.length > 0) && (
                <div style={{ marginTop: 44, display: 'flex', justifyContent: 'space-between', gap: 40, fontSize: 26, fontWeight: 600, opacity: 0.85, lineHeight: 1.45 }}>
                  <div>{scorers.home.slice(0, story ? 8 : 5).map((s, i) => <div key={i}>{s}</div>)}</div>
                  <div style={{ textAlign: 'right' }}>{scorers.away.slice(0, story ? 8 : 5).map((s, i) => <div key={i}>{s}</div>)}</div>
                </div>
              )}
            </div>
            {winner && !live && (
              <div style={{ fontFamily: "'Big Shoulders Display Variable', sans-serif", fontWeight: 800, fontSize: story ? 120 : 104, lineHeight: 0.95, textTransform: 'uppercase', letterSpacing: -1 }}>
                {winner.name}
                <br />
                <span style={{ color: S === P ? '#d7ff3e' : mix(S, '#ffffff', 0.15) }}>venceu.</span>
              </div>
            )}
            {m.winner === 'draw' && !live && <div style={{ fontFamily: "'Big Shoulders Display Variable', sans-serif", fontWeight: 800, fontSize: 104, textTransform: 'uppercase' }}>Empate.</div>}
          </>
        )}

        {/* rodapé */}
        <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 24, fontWeight: 600, opacity: 0.75 }}>
          <span>{[longDate(m.scheduledAt), m.venue].filter(Boolean).join(' · ')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: "'Big Shoulders Display Variable', sans-serif", fontSize: 34, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', opacity: 1 }}>
            <LogoMark size={44} /> Arquibancada
          </span>
        </div>
      </div>
    </div>
  );
});

function ArtTeam({ inst, dim }: { inst: InstitutionDTO; dim?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: 300, opacity: dim ? 0.62 : 1 }}>
      <div style={{ filter: 'drop-shadow(0 18px 30px rgba(0,0,0,.45))' }}>
        <TeamFlag inst={inst} size={170} shape="flag" />
      </div>
      <div style={{ fontFamily: "'Big Shoulders Display Variable', sans-serif", fontWeight: 800, fontSize: 58, textTransform: 'uppercase', lineHeight: 1, textAlign: 'center' }}>{inst.name}</div>
      {inst.university && <div style={{ fontSize: 22, fontWeight: 600, opacity: 0.65, marginTop: -8 }}>{inst.university}</div>}
    </div>
  );
}

function RankingArt({ m, inst, story }: { m: MatchDetail; inst: Map<string, InstitutionDTO>; story: boolean }) {
  const rows = (m.score.ranking ?? []).filter((r) => r.position).slice(0, story ? 8 : 5);
  const medal = ['#ffd60a', '#e5e7eb', '#d0884f'];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
      <div style={{ fontFamily: "'Big Shoulders Display Variable', sans-serif", fontWeight: 800, fontSize: 120, textTransform: 'uppercase', lineHeight: 0.95 }}>{m.title}</div>
      {rows.map((r) => {
        const i = inst.get(r.institutionId);
        return (
          <div key={r.participantId} style={{ display: 'flex', alignItems: 'center', gap: 26, padding: '18px 26px', borderRadius: 28, background: 'rgba(255,255,255,.1)' }}>
            <span style={{ width: 64, height: 64, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: medal[(r.position ?? 9) - 1] ?? 'rgba(255,255,255,.18)', color: (r.position ?? 9) <= 3 ? '#000' : '#fff', fontWeight: 900, fontSize: 32 }}>{r.position}</span>
            {i && <TeamFlag inst={i} size={64} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 36, fontWeight: 800 }}>{r.athleteName ?? i?.name}</div>
              <div style={{ fontSize: 24, opacity: 0.7, fontWeight: 600 }}>{i?.name}</div>
            </div>
            <span style={{ fontFamily: "'Big Shoulders Display Variable', sans-serif", fontWeight: 800, fontSize: 56 }}>{r.result}</span>
          </div>
        );
      })}
    </div>
  );
}

/** "Fulano 23'" dos lances de pontuação importantes (gols, tries, touchdowns...). */
function goalsBySide(m: MatchDetail) {
  const out = { home: [] as string[], away: [] as string[] };
  for (const t of m.timeline) {
    if (t.type !== 'ACTION' || !t.important || !t.side) continue;
    if (!['goal', 'own-goal', 'points'].includes(t.icon)) continue;
    if (t.icon === 'points' && !t.subtitle) continue;
    const who = t.subtitle ?? t.title;
    out[t.side].push(`${who}${t.minute ? ` ${t.minute}` : ''}`);
  }
  // basquete e afins: dezenas de cestas não cabem na arte
  if (out.home.length + out.away.length > 14) return { home: [], away: [] };
  return out;
}
