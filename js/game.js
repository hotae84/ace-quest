import { weightedIndex } from './rng.js';
import { grade } from './questions/index.js';

// 모든 수치는 여기 한 곳(설계 §14)
export const RULES = {
  normal: { size: 5, p: 0.25, pBoost: 0.35, sizes: [50, 100, 200], weights: [70, 25, 5], cap: 1400 },
  bonus: { size: 8, p: 0.40, pBoost: 0.50, sizes: [100, 200, 400], weights: [70, 25, 5], cap: 4000 },
  HINT_COST: 3, HINT_MAX: 30, RECENT: 8, BONUS_BASE: 2, BONUS_STEP: 2, MIN_ROUND_SEC: 15,
};

const copy = (round) => ({ ...round, q: round.q.map((q) => ({ ...q, retry: q.retry ? { ...q.retry } : null })) });

export function newRound(plan, { id, player, agent, startedAt }) {
  return {
    mode: plan.mode, zone: plan.zone, cv: plan.cv, gv: plan.gv,
    id, player, agent, startedAt, endedAt: null, finished: null,
    idx: 0, streak: 0, streakMax: 0, boostNext: false,
    q: plan.q.map((q) => ({ c: q.c, x: q.x, f: q.f, s: q.s, qh: null, oh: null, a: null, ok: null, hint: false, boost: false, retry: null })),
  };
}

export function attachQuestion(round, i, { qh, oh }, { retry = false } = {}) {
  const r = copy(round);
  const t = retry ? r.q[i].retry : r.q[i];
  t.qh = qh; t.oh = oh;
  return r;
}

// 첫 시도
export function answer(round, i, a, question) {
  const r = copy(round);
  const q = r.q[i];
  q.a = a.slice();
  q.ok = grade(question, a);
  q.boost = r.boostNext;
  r.boostNext = false;
  if (q.ok) { r.streak += 1; r.streakMax = Math.max(r.streakMax, r.streak); } else r.streak = 0;
  return r;
}

export const canRetry = (round, i) => round.q[i].ok === false && round.q[i].retry === null;
export const boostEligible = (round, i) => i === 0 || round.q[i - 1].ok === true;

export function startRetry(round, i, { f, s, x }) {
  if (!canRetry(round, i)) return round;
  const r = copy(round);
  r.q[i].retry = { f, s, x, qh: null, oh: null, a: null, ok: null, hint: false, eligible: boostEligible(round, i) };
  return r;
}

export function answerRetry(round, i, a, question) {
  const r = copy(round);
  const t = r.q[i].retry;
  t.a = a.slice();
  t.ok = grade(question, a);
  if (t.ok && t.eligible && i < r.q.length - 1) r.boostNext = true;
  return r;
}

// 설계 §5.7: 줄 → q → 원 시도 → 재도전, 시도 안에서는 힌트 −3 → 정답 +1 → 상한
export function applyAttemptHint(balance, attempt) {
  let b = balance;
  if (attempt.hint) b -= RULES.HINT_COST;
  if (attempt.ok === true) b += 1;
  return Math.min(b, RULES.HINT_MAX);
}

export function hintBalance(settledHintPts, round) {
  let b = settledHintPts;
  if (!round) return b;
  for (const q of round.q) {
    b = applyAttemptHint(b, q);
    if (q.retry) b = applyAttemptHint(b, q.retry);
  }
  return b;
}

export function useHint(round, i, { retry = false, balance }) {
  if (balance < RULES.HINT_COST) return { round, ok: false, reason: 'insufficient' };
  const t = retry ? round.q[i].retry : round.q[i];
  if (!t) return { round, ok: false, reason: 'answered' };
  if (t.a !== null) return { round, ok: false, reason: 'answered' };
  if (t.hint) return { round, ok: false, reason: 'used' };
  const r = copy(round);
  (retry ? r.q[i].retry : r.q[i]).hint = true;
  return { round: r, ok: true };
}

export function rollTickets(round, rng) {
  const rules = RULES[round.mode];
  const tickets = [];
  const roll = (kind, i, p, mult) => {
    const won = rng() < p;
    const size = rules.sizes[weightedIndex(rules.weights, rng)] * mult;
    tickets.push(i === undefined ? { kind, p, won, size } : { kind, i, p, won, size });
  };
  round.q.forEach((q, i) => { if (q.ok === true) roll('q', i, q.boost ? rules.pBoost : rules.p, 1); });
  const ace = round.q.length > 0 && round.q.every((q) => q.ok === true);
  if (ace) roll('ace', undefined, rules.p, 2);
  const creds = tickets.reduce((s, t) => s + (t.won ? t.size : 0), 0);
  return { tickets, creds, ace };
}

export function finishRound(round, { endedAt, rng }) {
  if (round.finished !== null) return round;
  if (round.q.some((q) => q.ok === null)) throw new Error('답하지 않은 문제가 있어 결산할 수 없음');
  const { tickets, creds, ace } = rollTickets(round, rng);
  return { ...copy(round), endedAt, finished: true, tickets, creds, ace };
}

export function abandonRound(round, { endedAt }) {
  if (round.finished !== null) return round;
  return { ...copy(round), endedAt, finished: false, tickets: [], creds: 0, ace: false };
}

// 테스트·검산용: 첫 시도 결과 패턴(미스 뒤 재도전 성공 가정)의 기대 티켓 수
export function expectedTickets(pattern, mode = 'normal') {
  const plan = { mode, zone: null, cv: 'x', gv: '1', q: pattern.map((_, i) => ({ c: `c${i}`, x: [], f: 'ox', s: i })) };
  const Q = { form: 'ox', options: [{ text: 'O' }, { text: 'X' }], answer: 0 };
  let r = newRound(plan, { id: 'e', player: 'p', agent: 'a', startedAt: '' });
  pattern.forEach((okFirst, i) => {
    r = answer(r, i, okFirst ? [0] : [1], Q);
    if (!okFirst) { r = startRetry(r, i, { f: 'ox', s: 0, x: [] }); r = answerRetry(r, i, [0], Q); }
  });
  return rollTickets(r, () => 0).tickets.reduce((s, t) => s + t.p, 0);
}

export const bonusThreshold = (bonusDone) => RULES.BONUS_BASE + RULES.BONUS_STEP * bonusDone;

export function bonusOpen(zoneCards, mastery, bonusDone) {
  const threshold = bonusThreshold(bonusDone);
  const total = zoneCards.length;
  const ready = zoneCards.filter((c) => (mastery.get(c.id) || 0) >= threshold).length;
  return { open: total > 0 && ready === total, ready, total, threshold };
}
