import { canonical, hashLine } from './hash.js';
import { RULES, applyAttemptHint } from './game.js';

const attempt = (t) => ({ f: t.f, s: t.s, x: t.x, qh: t.qh, oh: t.oh, a: t.a, ok: t.ok, hint: t.hint });

// Round → 기록 줄 본문(설계 §6.2). prev·hash는 chain()이 붙인다
export function toLine(round) {
  return {
    v: 1, id: round.id, player: round.player, agent: round.agent, zone: round.zone, mode: round.mode,
    startedAt: round.startedAt, endedAt: round.endedAt, finished: round.finished, cv: round.cv, gv: round.gv,
    q: round.q.map((q) => ({ c: q.c, x: q.x, f: q.f, s: q.s, qh: q.qh, oh: q.oh, a: q.a, ok: q.ok, hint: q.hint, boost: q.boost,
      retry: q.retry ? attempt(q.retry) : null })),
    streakMax: round.streakMax, ace: round.ace, tickets: round.tickets, creds: round.creds,
  };
}

export function body(line) {
  const { prev, hash, ...rest } = line;
  return rest;
}

export const sameBody = (a, b) => canonical(body(a)) === canonical(body(b));

export async function chain(bodies, lastHash = 'GENESIS') {
  const out = [];
  let prev = lastHash;
  for (const b of bodies) {
    const hash = await hashLine(prev, body(b));
    out.push({ ...body(b), prev, hash });
    prev = hash;
  }
  return out;
}

export async function verifyChain(lines) {
  let prev = 'GENESIS';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.prev !== prev) return { ok: false, breakAt: i };
    if (l.hash !== await hashLine(l.prev, body(l))) return { ok: false, breakAt: i };
    prev = l.hash;
  }
  return { ok: true, breakAt: null };
}

export function parseJsonl(text) {
  return text.split('\n').filter((s) => s.trim()).map((s) => JSON.parse(s));
}

export function toJsonl(lines) {
  return lines.map((l) => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : '');
}

// id 기준 병합: 본문 같으면 첫 것, 다르면 둘 다 격리(설계 §6.3)
export function merge(...lists) {
  const byId = new Map();
  const order = [];
  const quarantine = [];
  const bad = new Set();
  for (const list of lists) {
    for (const l of list) {
      if (bad.has(l.id)) continue;
      const seen = byId.get(l.id);
      if (!seen) { byId.set(l.id, l); order.push(l.id); continue; }
      if (!sameBody(seen, l)) { quarantine.push({ id: l.id, a: seen, b: l }); bad.add(l.id); byId.delete(l.id); }
    }
  }
  return { lines: order.filter((id) => byId.has(id)).map((id) => byId.get(id)), quarantine };
}

export function deriveState(lines, redemptions = [], { rules = RULES } = {}) {
  const mastery = new Map();
  const bonusDone = new Map();
  let earned = 0, rounds = 0, hintPts = 0;
  const recentAll = [];
  for (const l of lines) {
    if (l.finished === true) { earned += l.creds; rounds++; if (l.mode === 'bonus') bonusDone.set(l.zone, (bonusDone.get(l.zone) || 0) + 1); }
    for (const q of l.q) {
      hintPts = applyAttemptHint(hintPts, q);
      if (q.ok === true) mastery.set(q.c, (mastery.get(q.c) || 0) + 1);
      if (q.retry) {
        hintPts = applyAttemptHint(hintPts, q.retry);
        if (q.retry.ok === true) mastery.set(q.c, (mastery.get(q.c) || 0) + 1);
      }
      recentAll.push(q.c);
    }
  }
  const redeemed = redemptions.reduce((s, r) => s + (Number(r.creds) || 0), 0);
  const recent = [];
  for (let i = recentAll.length - 1; i >= 0 && recent.length < rules.RECENT; i--) if (!recent.includes(recentAll[i])) recent.push(recentAll[i]);
  return { earned, redeemed, balance: earned - redeemed, mastery, hintPts, recent, rounds, bonusDone };
}

// 기록 한 줄이 규칙(§5.4·§5.6)과 맞는지 q에서 재계산(관리 페이지 이상 징후)
export function checkRules(line, rules = RULES) {
  const errs = [];
  const r = rules[line.mode];
  if (!r) return ['mode-invalid'];
  const push = (e) => { if (!errs.includes(e)) errs.push(e); };
  if (line.finished !== true) {
    if ((line.tickets && line.tickets.length) || line.creds) push('abandoned-tickets');
    return errs;
  }
  const q = line.q;
  const expectBoost = (i) => i > 0 && q[i - 1].ok === false && q[i - 1].retry?.ok === true && (i - 1 === 0 || q[i - 2].ok === true);
  q.forEach((x, i) => { if (Boolean(x.boost) !== expectBoost(i)) push('boost-invalid'); });
  const firstOk = q.map((x, i) => (x.ok === true ? i : -1)).filter((i) => i >= 0);
  const qt = line.tickets.filter((t) => t.kind === 'q');
  if (qt.length !== firstOk.length || !qt.every((t, k) => t.i === firstOk[k])) push('tickets-mismatch');
  for (const t of qt) {
    const expectP = q[t.i]?.boost ? r.pBoost : r.p;
    if (t.p !== expectP) push('boost-invalid');
    if (!r.sizes.includes(t.size)) push('size-invalid');
  }
  const aceT = line.tickets.filter((t) => t.kind === 'ace');
  const allOk = q.length > 0 && q.every((x) => x.ok === true);
  if (line.ace !== allOk || aceT.length !== (allOk ? 1 : 0)) push('ace-invalid');
  for (const t of aceT) { if (t.p !== r.p || !r.sizes.map((s) => s * 2).includes(t.size)) push('ace-invalid'); }
  if (line.tickets.some((t) => t.kind !== 'q' && t.kind !== 'ace')) push('tickets-mismatch');
  const sum = line.tickets.reduce((s, t) => s + (t.won ? t.size : 0), 0);
  if (sum !== line.creds) push('creds-sum');
  if (line.creds > r.cap) push('creds-cap');
  const sec = (Date.parse(line.endedAt) - Date.parse(line.startedAt)) / 1000;
  if (Number.isFinite(sec) && sec < rules.MIN_ROUND_SEC) push('too-fast');
  return errs;
}
