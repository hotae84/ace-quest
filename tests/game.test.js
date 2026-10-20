import { test, eq, ok } from './harness.js';
import { RULES, newRound, attachQuestion, answer, canRetry, boostEligible, startRetry, answerRetry, hintBalance, useHint,
  rollTickets, finishRound, abandonRound, expectedTickets, bonusThreshold, bonusOpen } from '../js/game.js';

const OX = { form: 'ox', text: 't', options: [{ text: 'O' }, { text: 'X' }], answer: 0 };
const YES = [0], NO = [1];
const plan = (n, mode = 'normal') => ({ mode, zone: 'Z1', cv: 'test.1', gv: '1',
  q: Array.from({ length: n }, (_, i) => ({ c: `c010${i + 1}`, x: [], f: 'ox', s: i + 1 })) });
const fresh = (n = 5, mode = 'normal') => newRound(plan(n, mode), { id: 'r1', player: 'p1', agent: 'jett', startedAt: '2026-10-25T10:00:00+09:00' });
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('RULES 수치(설계 §14)', () => {
  eq(RULES.normal, { size: 5, p: 0.25, pBoost: 0.35, sizes: [50, 100, 200], weights: [70, 25, 5], cap: 1400 });
  eq(RULES.bonus, { size: 8, p: 0.40, pBoost: 0.50, sizes: [100, 200, 400], weights: [70, 25, 5], cap: 4000 });
  eq([RULES.HINT_COST, RULES.HINT_MAX, RULES.RECENT, RULES.BONUS_BASE, RULES.BONUS_STEP, RULES.MIN_ROUND_SEC], [3, 30, 8, 2, 2, 15]);
});

test('newRound는 계획 위에 시도 칸을 만든다', () => {
  const r = fresh();
  eq(r.q.length, 5);
  eq(r.q[0], { c: 'c0101', x: [], f: 'ox', s: 1, qh: null, oh: null, a: null, ok: null, hint: false, boost: false, retry: null });
  eq([r.id, r.player, r.agent, r.finished, r.idx, r.streak, r.streakMax, r.boostNext], ['r1', 'p1', 'jett', null, 0, 0, 0, false]);
});

test('attachQuestion은 해시를 기록한다', () => {
  let r = attachQuestion(fresh(), 0, { qh: 'q'.repeat(16), oh: ['a', 'b'] });
  eq(r.q[0].qh, 'q'.repeat(16)); eq(r.q[0].oh, ['a', 'b']);
  r = startRetry(answer(r, 0, NO, OX), 0, { f: 'ox', s: 9, x: [] });
  r = attachQuestion(r, 0, { qh: 'r'.repeat(16), oh: ['c', 'd'] }, { retry: true });
  eq(r.q[0].retry.qh, 'r'.repeat(16));
});

test('연속 정답 2·3·4·5의 streakMax, 오답 뒤 streak 0', () => {
  let r = fresh();
  for (let i = 0; i < 5; i++) { r = answer(r, i, YES, OX); eq(r.streakMax, i + 1); }
  let s = fresh();
  s = answer(s, 0, YES, OX); s = answer(s, 1, YES, OX); s = answer(s, 2, NO, OX);
  eq([s.streak, s.streakMax], [0, 2]);
});

test('answer는 원본을 바꾸지 않는다', () => {
  const r = fresh();
  answer(r, 0, YES, OX);
  eq(r.q[0].ok, null);
});

test('boostEligible: 첫 문제·직전 정답은 true, 연속 오답은 false', () => {
  let r = fresh();
  ok(boostEligible(r, 0));
  r = answer(r, 0, YES, OX); r = answer(r, 1, NO, OX);
  ok(boostEligible(r, 1));
  r = answer(r, 2, NO, OX);
  ok(!boostEligible(r, 2));
});

test('canRetry는 오답이고 아직 재도전 전일 때만', () => {
  let r = answer(fresh(), 0, NO, OX);
  ok(canRetry(r, 0));
  ok(!canRetry(answer(fresh(), 0, YES, OX), 0));
  r = startRetry(r, 0, { f: 'ox', s: 2, x: [] });
  ok(!canRetry(r, 0));
  eq(r.q[0].retry, { f: 'ox', s: 2, x: [], qh: null, oh: null, a: null, ok: null, hint: false, eligible: true });
});

test('재도전 성공 → 다음 문제 boost:true, boostNext는 소모된다', () => {
  let r = answer(fresh(), 0, NO, OX);
  r = startRetry(r, 0, { f: 'ox', s: 2, x: [] });
  r = answerRetry(r, 0, YES, OX);
  ok(r.boostNext);
  r = answer(r, 1, YES, OX);
  ok(r.q[1].boost); ok(!r.boostNext);
  r = answer(r, 2, YES, OX);
  ok(!r.q[2].boost);
});

test('연속 오답 뒤 재도전 성공은 boost 없음', () => {
  let r = answer(fresh(), 0, NO, OX);
  r = answer(r, 1, NO, OX);
  r = startRetry(r, 1, { f: 'ox', s: 2, x: [] });
  r = answerRetry(r, 1, YES, OX);
  ok(!r.boostNext);
  r = answer(r, 2, YES, OX);
  ok(!r.q[2].boost);
});

test('마지막 문제 재도전 성공은 boostNext 무효', () => {
  let r = fresh(2);
  r = answer(r, 0, YES, OX); r = answer(r, 1, NO, OX);
  r = startRetry(r, 1, { f: 'ox', s: 2, x: [] }); r = answerRetry(r, 1, YES, OX);
  ok(!r.boostNext);
});

test('hintBalance: 시도 순서대로 −3 → +1 → 상한 30', () => {
  let r = fresh();
  eq(hintBalance(30, r), 30);
  r = useHint(r, 0, { retry: false, balance: 30 }).round;
  eq(hintBalance(30, r), 27);
  r = answer(r, 0, YES, OX);
  eq(hintBalance(30, r), 28);
  r = answer(r, 1, YES, OX); r = answer(r, 2, YES, OX);
  eq(hintBalance(30, r), 30, '상한');
});

test('useHint: 잔액 2면 거부·상태 불변, 3이면 사용 후 0', () => {
  const r0 = fresh();
  const d = useHint(r0, 0, { retry: false, balance: 2 });
  eq([d.ok, d.reason], [false, 'insufficient']);
  eq(d.round, r0);
  const u = useHint(r0, 0, { retry: false, balance: 3 });
  ok(u.ok);
  eq(hintBalance(3, u.round), 0);
});

test('useHint: 같은 시도 두 번째는 used, 답한 뒤는 answered, 재도전은 따로', () => {
  let r = useHint(fresh(), 0, { retry: false, balance: 30 }).round;
  eq(useHint(r, 0, { retry: false, balance: 30 }).reason, 'used');
  r = answer(r, 0, NO, OX);
  eq(useHint(r, 0, { retry: false, balance: 30 }).reason, 'answered');
  r = startRetry(r, 0, { f: 'ox', s: 2, x: [] });
  const u = useHint(r, 0, { retry: true, balance: 30 });
  ok(u.ok); ok(u.round.q[0].retry.hint);
});

test('rollTickets: 첫 시도 정답마다 티켓, 에이스 티켓은 2배', () => {
  let r = fresh();
  for (let i = 0; i < 5; i++) r = answer(r, i, YES, OX);
  // 티켓마다 rng 두 번: won 판정, 크기
  const t = rollTickets(r, seq([0.1, 0.5, 0.9, 0.5, 0.1, 0.96, 0.9, 0.5, 0.1, 0.5, 0.1, 0.5]));
  eq(t.tickets.length, 6);
  eq(t.tickets.map((x) => x.kind), ['q', 'q', 'q', 'q', 'q', 'ace']);
  eq(t.tickets.map((x) => x.won), [true, false, true, false, true, true]);
  eq(t.tickets[2].size, 200);
  eq(t.tickets[5].size, 100, '에이스는 50×2');
  eq(t.tickets[5].p, 0.25);
  ok(t.ace);
  eq(t.creds, 50 + 200 + 50 + 100);
});

test('rollTickets: 재도전 정답은 티켓 없음, boost 문제는 pBoost', () => {
  let r = answer(fresh(), 0, NO, OX);
  r = startRetry(r, 0, { f: 'ox', s: 2, x: [] }); r = answerRetry(r, 0, YES, OX);
  for (let i = 1; i < 5; i++) r = answer(r, i, YES, OX);
  const t = rollTickets(r, () => 0);
  eq(t.tickets.length, 4);
  eq(t.tickets[0], { kind: 'q', i: 1, p: 0.35, won: true, size: 50 });
  ok(!t.ace);
});

test('finishRound: 미답이 있으면 예외, 확정 뒤 재호출은 그대로', () => {
  let r = fresh();
  let threw = false; try { finishRound(r, { endedAt: 'x', rng: () => 0 }); } catch { threw = true; }
  ok(threw);
  for (let i = 0; i < 5; i++) r = answer(r, i, YES, OX);
  const f = finishRound(r, { endedAt: '2026-10-25T10:03:00+09:00', rng: () => 0 });
  eq([f.finished, f.endedAt, f.creds, f.ace], [true, '2026-10-25T10:03:00+09:00', 50 * 5 + 100, true]);
  eq(finishRound(f, { endedAt: 'later', rng: () => 0.99 }), f);
});

test('abandonRound: finished false, 티켓 없음, 미답 유지', () => {
  const r = answer(fresh(), 0, YES, OX);
  const a = abandonRound(r, { endedAt: 'e' });
  eq([a.finished, a.tickets, a.creds, a.ace, a.q[1].a, a.q[1].ok], [false, [], 0, false, null, null]);
  eq(abandonRound(a, { endedAt: 'e2' }), a);
});

function allPatterns(n) {
  const out = [];
  for (let m = 0; m < 2 ** n; m++) out.push(Array.from({ length: n }, (_, i) => Boolean((m >> i) & 1)));
  return out;
}

test('기대값 부등식: 미스가 있는 모든 패턴 < 전부 정답 (일반 1.5 / 보너스 3.6)', () => {
  for (const mode of ['normal', 'bonus']) {
    const n = RULES[mode].size;
    const best = expectedTickets(Array(n).fill(true), mode);
    eq(Number(best.toFixed(6)), mode === 'normal' ? 1.5 : 3.6);
    for (const p of allPatterns(n)) {
      if (p.every(Boolean)) continue;
      const e = expectedTickets(p, mode);
      ok(e < best, `${mode} ${p.map((b) => (b ? 'O' : 'X')).join('')} ${e} >= ${best}`);
    }
  }
});

test('라운드 크레드 상한: 전부 최대 당첨이어도 cap 이하', () => {
  for (const mode of ['normal', 'bonus']) {
    let r = fresh(RULES[mode].size, mode);
    for (let i = 0; i < RULES[mode].size; i++) r = answer(r, i, YES, OX);
    const t = rollTickets(r, seq([0, 0.999]));
    eq(t.creds, RULES[mode].cap);
  }
});

test('bonusThreshold와 bonusOpen', () => {
  eq([bonusThreshold(0), bonusThreshold(1), bonusThreshold(2)], [2, 4, 6]);
  const zoneCards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  eq(bonusOpen(zoneCards, new Map([['a', 2], ['b', 3], ['c', 2]]), 0), { open: true, ready: 3, total: 3, threshold: 2 });
  eq(bonusOpen(zoneCards, new Map([['a', 2], ['b', 1], ['c', 2]]), 0), { open: false, ready: 2, total: 3, threshold: 2 });
  eq(bonusOpen(zoneCards, new Map([['a', 2], ['b', 3], ['c', 2]]), 1).open, false);
  eq(bonusOpen([], new Map(), 0).open, false);
});
