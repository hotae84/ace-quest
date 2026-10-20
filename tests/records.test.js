import { test, eq, ok } from './harness.js';
import { newRound, answer, startRetry, answerRetry, useHint, finishRound, abandonRound, RULES } from '../js/game.js';
import { toLine, body, sameBody, chain, verifyChain, parseJsonl, toJsonl, merge, deriveState, checkRules } from '../js/records.js';

const OX = { form: 'ox', text: 't', options: [{ text: 'O' }, { text: 'X' }], answer: 0 };
const YES = [0], NO = [1];
const plan = (n, mode = 'normal', zone = 'Z1', prefix = 'c010') => ({ mode, zone, cv: 'test.1', gv: '1',
  q: Array.from({ length: n }, (_, i) => ({ c: `${prefix}${i + 1}`, x: ['c0109'], f: 'ox', s: i + 1 })) });
const T0 = '2026-10-25T10:00:00+09:00', T1 = '2026-10-25T10:03:00+09:00';
function played(pattern, { id = 'r1', mode = 'normal', zone = 'Z1', hintAt = [], retryHint = false, rng = () => 0, endedAt = T1, prefix = 'c010' } = {}) {
  let r = newRound(plan(pattern.length, mode, zone, prefix), { id, player: 'p1', agent: 'jett', startedAt: T0 });
  pattern.forEach((okFirst, i) => {
    if (hintAt.includes(i)) r = useHint(r, i, { retry: false, balance: 30 }).round;
    r = answer(r, i, okFirst ? YES : NO, OX);
    if (!okFirst) {
      r = startRetry(r, i, { f: 'ox', s: 9, x: [] });
      if (retryHint) r = useHint(r, i, { retry: true, balance: 30 }).round;
      r = answerRetry(r, i, YES, OX);
    }
  });
  return finishRound(r, { endedAt, rng });
}

test('toLine은 §6.2 키 집합만 담는다', () => {
  const line = toLine(played([true, false, true]));
  eq(Object.keys(line).sort(), ['ace', 'agent', 'creds', 'cv', 'endedAt', 'finished', 'gv', 'id', 'mode', 'player', 'q', 'startedAt', 'streakMax', 'tickets', 'v', 'zone']);
  eq(line.v, 1);
  eq(Object.keys(line.q[0]).sort(), ['a', 'boost', 'c', 'f', 'hint', 'oh', 'ok', 'qh', 'retry', 's', 'x']);
  eq(Object.keys(line.q[1].retry).sort(), ['a', 'f', 'hint', 'oh', 'ok', 'qh', 's', 'x']);
  ok(!('idx' in line) && !('streak' in line) && !('boostNext' in line));
});

test('chain → verifyChain ok, 본문을 바꾸면 breakAt', async () => {
  const bodies = [toLine(played([true, true, true], { id: 'a' })), toLine(played([true, false, true], { id: 'b' }))];
  const lines = await chain(bodies);
  eq(lines[0].prev, 'GENESIS');
  eq(lines[1].prev, lines[0].hash);
  eq(await verifyChain(lines), { ok: true, breakAt: null });
  const bad = lines.map((l) => ({ ...l }));
  bad[1].creds = 9999;
  eq((await verifyChain(bad)).breakAt, 1);
  const cut = [lines[1]];
  eq((await verifyChain(cut)).breakAt, 0);
});

test('body/sameBody는 prev·hash를 무시한다', async () => {
  const b = toLine(played([true]));
  const [l] = await chain([b]);
  ok(!('prev' in body(l)) && !('hash' in body(l)));
  ok(sameBody(l, b));
  ok(!sameBody(l, { ...b, creds: 1 }));
});

test('parseJsonl/toJsonl 왕복, 빈 줄 무시, 깨진 줄은 예외', async () => {
  const lines = await chain([toLine(played([true], { id: 'a' })), toLine(played([false], { id: 'b' }))]);
  const text = toJsonl(lines);
  ok(text.endsWith('\n') && !text.endsWith('\n\n'));
  eq(parseJsonl(text + '\n\n'), lines);
  let threw = false; try { parseJsonl('{bad'); } catch { threw = true; }
  ok(threw);
});

test('merge: 같은 id 같은 본문은 하나, 다른 본문은 격리, 첫 등장 순', async () => {
  const a = toLine(played([true], { id: 'a' }));
  const b = toLine(played([true, true], { id: 'b' }));
  const [la] = await chain([a]);
  const m = merge([la], [a, b]);
  eq(m.lines.map((l) => l.id), ['a', 'b']);
  eq(m.quarantine, []);
  const b2 = { ...b, creds: 777 };
  const m2 = merge([la, await chain([b], la.hash).then((x) => x[0])], [b2]);
  eq(m2.lines.map((l) => l.id), ['a']);
  eq(m2.quarantine.length, 1);
  eq(m2.quarantine[0].id, 'b');
  eq(m2.quarantine[0].b, b2);
});

test('deriveState: earned·redeemed·balance·rounds', () => {
  const l1 = toLine(played([true, true, true, true, true], { id: 'a' }));   // rng 0 → 전부 당첨 50×5 + 100
  const l2 = toLine(abandonRound(newRound(plan(5), { id: 'b', player: 'p1', agent: 'jett', startedAt: T0 }), { endedAt: T1 }));
  const s = deriveState([l1, l2], [{ ts: T1, creds: 100, label: 'VP 475', memo: '' }]);
  eq([s.earned, s.redeemed, s.balance, s.rounds], [350, 100, 250, 1]);
});

test('deriveState: 숙련도는 첫 시도·재도전 정답 각 +1, 미응답 0', () => {
  const l1 = toLine(played([true, false, true], { id: 'a' }));
  const s = deriveState([l1]);
  eq(s.mastery.get('c0101'), 1); eq(s.mastery.get('c0102'), 1); eq(s.mastery.get('c0103'), 1);
  let r = answer(newRound(plan(3), { id: 'c', player: 'p1', agent: 'jett', startedAt: T0 }), 0, YES, OX);
  const l2 = toLine(abandonRound(r, { endedAt: T1 }));
  const s2 = deriveState([l2]);
  eq(s2.mastery.get('c0101'), 1); eq(s2.mastery.get('c0102') || 0, 0);
});

test('deriveState: 힌트 포인트 순서(−3 → +1 → 상한 30)', () => {
  const l = toLine(played(Array(5).fill(true), { id: 'a', hintAt: [0] }));
  eq(deriveState([l]).hintPts, 2, '0에서 시작: 힌트 −3 → −2, 이후 +1×5 → 2');
  const many = Array.from({ length: 8 }, (_, i) => toLine(played(Array(5).fill(true), { id: `r${i}` })));
  eq(deriveState(many).hintPts, 30, '상한');
  const h = toLine(abandonRound(useHint(newRound(plan(2), { id: 'h', player: 'p1', agent: 'jett', startedAt: T0 }), 0, { retry: false, balance: 30 }).round, { endedAt: T1 }));
  eq(deriveState([...many, h]).hintPts, 27, '힌트만 쓰고 이탈 → −3');
  const rh = toLine(played([false], { id: 'rh', retryHint: true }));
  eq(deriveState([rh]).hintPts, -2, '재도전 힌트 −3 → 재도전 정답 +1');
});

test('deriveState: recent는 최신이 앞, 길이 RECENT', () => {
  const lines = [toLine(played(Array(5).fill(true), { id: 'a' })), toLine(played(Array(5).fill(true), { id: 'b', prefix: 'c020' }))];
  const s = deriveState(lines);
  eq(s.recent.length, RULES.RECENT);
  eq(s.recent[0], 'c0205');
  eq(s.recent[7], 'c0103', '중복 없이 최신부터 8장');
});

test('deriveState: bonusDone은 완주한 보너스 작전 수, 이탈은 제외', () => {
  const b1 = toLine(played(Array(8).fill(true), { id: 'b1', mode: 'bonus' }));
  const b2 = toLine(abandonRound(newRound(plan(8, 'bonus'), { id: 'b2', player: 'p1', agent: 'jett', startedAt: T0 }), { endedAt: T1 }));
  const s = deriveState([b1, b2]);
  eq(s.bonusDone.get('Z1'), 1);
});

test('checkRules: 정상 줄 통과, 정상 최대 에이스(1,400) 통과', () => {
  eq(checkRules(toLine(played([true, false, true, true, true]))), []);
  let i = 0;
  const max = played(Array(5).fill(true), { rng: () => [0, 0.999][i++ % 2] });
  eq(max.creds, 1400);
  eq(checkRules(toLine(max)), []);
});

test('checkRules: 조작 탐지', () => {
  const base = toLine(played([true, false, true, true, true]));
  ok(checkRules({ ...base, creds: 9999 }).includes('creds-sum'));
  const fat = { ...base, tickets: base.tickets.map((t) => ({ ...t, won: true, size: 100000 })), creds: 100000 * base.tickets.length };
  ok(checkRules(fat).includes('size-invalid'));
  const extra = { ...base, tickets: [...base.tickets, { kind: 'q', i: 1, p: 0.25, won: true, size: 50 }], creds: base.creds + 50 };
  ok(checkRules(extra).includes('tickets-mismatch'));
  const boosted = JSON.parse(JSON.stringify(base));
  boosted.q[1].retry = null; boosted.q[2].boost = true;
  boosted.tickets = boosted.tickets.map((t) => (t.i === 2 ? { ...t, p: 0.35 } : t));
  ok(checkRules(boosted).includes('boost-invalid'));
  const fakeAce = { ...base, ace: true, tickets: [...base.tickets, { kind: 'ace', p: 0.25, won: true, size: 100 }], creds: base.creds + 100 };
  ok(checkRules(fakeAce).includes('ace-invalid'));
  const fast = toLine(played(Array(5).fill(true), { endedAt: '2026-10-25T10:00:10+09:00' }));
  ok(checkRules(fast).includes('too-fast'));
  const ab = toLine(abandonRound(newRound(plan(5), { id: 'x', player: 'p1', agent: 'jett', startedAt: T0 }), { endedAt: T1 }));
  ok(checkRules({ ...ab, tickets: [{ kind: 'q', i: 0, p: 0.25, won: true, size: 50 }], creds: 50 }).includes('abandoned-tickets'));
});
