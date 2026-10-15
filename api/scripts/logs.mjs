#!/usr/bin/env node
// Lê o registro (api/logs/app-*.jsonl) com filtros. Sem dependências.
//
//   npm run logs                         últimas 24 h, avisos e erros
//   npm run logs -- --summary            erros agrupados (o que mais acontece)
//   npm run logs -- --req a1b2c3d4e5f6   tudo de uma requisição (servidor + navegador)
//   npm run logs -- --match <id>         histórico de um jogo (lances, edições, erros)
//   npm run logs -- --level info --since 30m --ev live.,staff.
//   npm run logs -- --user Maria --since 2h
//   npm run logs -- --grep "pênalti" --json
//   npm run logs -- --follow             acompanha ao vivo
import { existsSync, readdirSync, readFileSync, statSync, watch } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const DIR = resolve(process.env.LOG_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'logs'));
const RANK = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };

// ---------------------------------------------------------------- argumentos
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  opt[k] = v;
}
if (opt.help || opt.h) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 13).join('\n').replace(/^\/\/ ?/gm, ''));
  process.exit(0);
}

const parseSince = (s) => {
  if (!s) return null;
  const m = /^(\d+)\s*(s|m|h|d)$/.exec(s);
  if (m) return Date.now() - Number(m[1]) * { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2]];
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
};
// procurando algo específico: olha a semana e todos os níveis
const specific = opt.req || opt.match || opt.user || opt.grep;
const since = parseSince(opt.since) ?? Date.now() - (specific ? 7 : 1) * 864e5;
const until = parseSince(opt.until) ?? Infinity;
const minLevel = RANK[opt.level] ?? (specific ? RANK.debug : RANK.warn);
const evs = typeof opt.ev === 'string' ? opt.ev.split(',') : null;
const tail = Number(opt.tail ?? (opt.summary ? Infinity : 200));
const color = process.stdout.isTTY && !opt.json && !opt['no-color'];

const match = (o) => {
  const t = Date.parse(o.t);
  if (t < since || t > until) return false;
  if ((RANK[o.lvl] ?? 0) < minLevel) return false;
  if (opt.src && o.src !== opt.src) return false;
  if (evs && !evs.some((e) => o.ev?.startsWith(e))) return false;
  const raw = JSON.stringify(o);
  if (opt.req && o.req !== opt.req && !raw.includes(opt.req)) return false;
  if (opt.match && !raw.includes(opt.match)) return false;
  if (opt.user && !(o.user ?? '').toLowerCase().includes(String(opt.user).toLowerCase())) return false;
  if (opt.grep && !raw.toLowerCase().includes(String(opt.grep).toLowerCase())) return false;
  return true;
};

// ---------------------------------------------------------------- leitura
function files() {
  if (!existsSync(DIR)) return [];
  const from = new Date(since - 864e5).toISOString().slice(0, 10);
  return readdirSync(DIR)
    .filter((f) => /^app-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(4, 14) >= from)
    .sort()
    .map((f) => join(DIR, f));
}

function parseLines(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* linha cortada */
    }
  }
  return out;
}

// ---------------------------------------------------------------- saída
const C = color ? { dim: '\x1b[2m', red: '\x1b[31m', yel: '\x1b[33m', cyan: '\x1b[36m', mag: '\x1b[35m', bold: '\x1b[1m', off: '\x1b[0m' } : new Proxy({}, { get: () => '' });
const LVL = { debug: `${C.dim}DBG`, info: `${C.cyan}INF`, warn: `${C.yel}WRN`, error: `${C.red}ERR`, fatal: `${C.red}${C.bold}FTL` };
const local = (iso) => new Date(Date.parse(iso) - 3 * 36e5).toISOString().replace('T', ' ').slice(5, 23); // horário de Brasília

function show(o) {
  if (opt.json) return console.log(JSON.stringify(o));
  const { t, lvl, src, ev, req, user, msg, stack, err, ...rest } = o;
  const head = `${C.dim}${local(t)}${C.off} ${LVL[lvl] ?? lvl}${C.off} ${src === 'web' ? `${C.mag}web${C.off}` : 'api'} ${C.bold}${ev}${C.off}`;
  const who = [req && `req=${req}`, user && `por ${user}`].filter(Boolean).join(' ');
  const kv = Object.entries(rest)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${C.dim}${k}=${C.off}${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`${head}${msg ? ` ${msg}` : ''}${who ? ` ${C.dim}${who}${C.off}` : ''}`);
  if (kv) console.log(`    ${kv.length > 1200 ? kv.slice(0, 1200) + '…' : kv}`);
  const st = stack ?? err?.stack ?? (err?.message && `${err.name}: ${err.message}`);
  if (st) console.log(C.dim + String(st).split('\n').slice(0, 10).map((l) => '    | ' + l).join('\n') + C.off);
}

function summary(rows) {
  // agrupa por evento + mensagem sem números/ids, pra ver o que se repete
  const norm = (s) => String(s ?? '').replace(/[a-z0-9]{20,}/gi, '<id>').replace(/\d+/g, 'N').slice(0, 140);
  const groups = new Map();
  for (const o of rows) {
    const k = `${o.lvl}|${o.ev}|${norm(o.msg ?? o.reason ?? o.err?.message ?? (o.status ? `${o.method} ${norm(o.path)} ${o.status}` : ''))}`;
    const g = groups.get(k) ?? { n: 0, first: o.t, last: o.t, sample: o, users: new Set() };
    g.n++;
    g.last = o.t;
    g.sample = o;
    if (o.user) g.users.add(o.user);
    groups.set(k, g);
  }
  const list = [...groups.entries()].sort((a, b) => RANK[b[1].sample.lvl] - RANK[a[1].sample.lvl] || b[1].n - a[1].n);
  console.log(`${C.bold}${rows.length} linhas, ${list.length} tipos${C.off} (${local(new Date(since).toISOString())} → agora)\n`);
  for (const [k, g] of list) {
    const [lvl, ev, msg] = k.split('|');
    console.log(`${String(g.n).padStart(5)}× ${LVL[lvl]}${C.off} ${C.bold}${ev}${C.off} ${msg}`);
    console.log(`${C.dim}        ${local(g.first)} → ${local(g.last)}${g.sample.req ? ` · ex.: --req ${g.sample.req}` : ''}${g.users.size ? ` · ${[...g.users].slice(0, 3).join(', ')}` : ''}${C.off}`);
  }
}

// ---------------------------------------------------------------- main
const all = files().flatMap((f) => parseLines(readFileSync(f, 'utf8')).filter(match));
if (!all.length && !opt.follow) {
  console.log(existsSync(DIR) ? `Nada encontrado (${DIR}). Tente --level info ou --since 7d.` : `Sem registro ainda em ${DIR}.`);
}
if (opt.summary) summary(all);
else for (const o of all.slice(-tail)) show(o);

if (opt.follow) {
  // acompanha o arquivo do dia (e troca na virada)
  let current = files().at(-1);
  let pos = current && existsSync(current) ? statSync(current).size : 0;
  console.log(`${C.dim}— acompanhando ${DIR} (Ctrl+C sai) —${C.off}`);
  const read = () => {
    const latest = files().at(-1);
    if (latest && latest !== current) [current, pos] = [latest, 0];
    if (!current || !existsSync(current)) return;
    const size = statSync(current).size;
    if (size <= pos) return;
    const buf = readFileSync(current).subarray(pos, size).toString('utf8');
    const cut = buf.lastIndexOf('\n') + 1;
    pos += Buffer.byteLength(buf.slice(0, cut));
    for (const o of parseLines(buf.slice(0, cut)).filter(match)) show(o);
  };
  if (existsSync(DIR)) watch(DIR, () => read());
  setInterval(read, 1000);
}
