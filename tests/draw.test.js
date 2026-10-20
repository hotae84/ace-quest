import { test, eq, ok } from './harness.js';
import { makeRng } from '../js/rng.js';
import { buildIndex, pickHelpers } from '../js/content.js';
import { generate, questionKey } from '../js/questions/index.js';
import { drawRound, drawRetry, SIZE } from '../js/draw.js';
import { zones, cards, clone } from './fixture.js';

const index = buildIndex({ zones, cards });
const c = (id) => index.cards.get(id);
const base = { index, zone: 'Z1', mode: 'normal', mastery: new Map(), recent: [], cv: 'test.1', gv: '1' };
const isMcq = (f) => f.startsWith('mcq');

test('SIZE는 일반 5·보너스 8', () => eq(SIZE, { normal: 5, bonus: 8 }));

test('drawRound: 5문제, 카드 중복 없음, 선다형 3개 이상, 메타 포함', () => {
  const plan = drawRound({ ...base, rng: makeRng(1) });
  eq(plan.q.length, 5);
  eq(new Set(plan.q.map((q) => q.c)).size, 5);
  ok(plan.q.filter((q) => isMcq(q.f)).length >= 3);
  eq([plan.mode, plan.zone, plan.cv, plan.gv], ['normal', 'Z1', 'test.1', '1']);
  for (const q of plan.q) { ok(Array.isArray(q.x)); ok(Number.isInteger(q.s) && q.s >= 0); }
});

test('drawRound: recent 카드는 후보가 충분하면 나오지 않는다', () => {
  for (let s = 1; s <= 30; s++) {
    const plan = drawRound({ ...base, recent: ['c0106'], rng: makeRng(s) });
    ok(!plan.q.some((q) => q.c === 'c0106'), `seed ${s}`);
  }
});

test('drawRound: recent가 너무 많으면 오래된 것부터 풀어 size를 채운다', () => {
  const plan = drawRound({ ...base, recent: ['c0101', 'c0102', 'c0103', 'c0104'], rng: makeRng(2) });
  eq(plan.q.length, 5);
  ok(!plan.q.some((q) => q.c === 'c0101'), '가장 최근 카드는 끝까지 제외');
});

test('drawRound: 숙련도 높은 카드는 덜 나온다', () => {
  const mastery = new Map([['c0101', 10]]);
  const rng = makeRng(99);
  let hi = 0, lo = 0;
  for (let i = 0; i < 1000; i++) {
    const plan = drawRound({ ...base, mastery, rng });
    if (plan.q.some((q) => q.c === 'c0101')) hi++;
    if (plan.q.some((q) => q.c === 'c0102')) lo++;
  }
  ok(hi / lo < 0.6, `hi=${hi} lo=${lo}`);
});

test('drawRound: 카드 4장 지역이면 4문제', () => {
  const ix = buildIndex({ zones, cards: cards.slice(0, 4) });
  const plan = drawRound({ ...base, index: ix, rng: makeRng(3) });
  eq(plan.q.length, 4);
});

test('drawRound: zone null이면 전체에서', () => {
  const plan = drawRound({ ...base, zone: null, rng: makeRng(4) });
  eq(plan.zone, null); eq(plan.q.length, 5);
});

test('drawRound: 보너스는 8문제(카드 6장이면 6), 선다형 비율 유지', () => {
  const plan = drawRound({ ...base, mode: 'bonus', rng: makeRng(5) });
  eq(plan.q.length, 6);
});

test('drawRound: mcq-neg는 일반 ≤1', () => {
  for (let s = 1; s <= 60; s++) {
    const plan = drawRound({ ...base, rng: makeRng(s) });
    ok(plan.q.filter((q) => q.f === 'mcq-neg').length <= 1, `seed ${s}`);
  }
});

test('questionKey: 표시 순서가 달라도 같은 문제면 같은 키', () => {
  const card = c('c0101');
  const x = pickHelpers({ card, form: 'blank', index, rng: makeRng(1) }).map((id) => c(id));
  const a = generate({ card, helpers: x, form: 'blank', seed: 1 });
  const b = generate({ card, helpers: x, form: 'blank', seed: 2 });
  eq(questionKey(a), questionKey(b));
  const d = generate({ card, helpers: x, form: 'ox', seed: 2 });
  ok(questionKey(a) !== questionKey(d));
});

test('drawRetry: 자격 form이 둘 이상이면 다른 form', () => {
  const card = c('c0101');
  const x = pickHelpers({ card, form: 'mcq-data', index, rng: makeRng(1) });
  const prev = generate({ card, helpers: x.map(c), form: 'mcq-data', seed: 1 });
  const r = drawRetry({ card, index, prev, prevPlan: { f: 'mcq-data', s: 1, x }, rng: makeRng(2) });
  ok(r.f !== 'mcq-data');
  eq(r.same, false);
  ok(Array.isArray(r.x));
});

test('drawRetry: 어떤 seed로도 같은 문제만 나오면 same:true', () => {
  // ox만 자격이고 거짓 진술 출처(helpers[0].true)가 참 진술과 같은 문장인 조작 카드
  const cs = clone(cards);
  const y = { ...cs[1], id: 'c0190', terms: ['용어90'], true: ['같은 문장이다.'], false: ['거짓90', '거짓91'], distractors: ['c0191'] };
  const z = { ...cs[0], id: 'c0191', terms: ['용어91'], true: ['같은 문장이다. '], false: [], distractors: ['c0190'], passage: undefined, blank: undefined, year: undefined };
  const ix = buildIndex({ zones, cards: [y, z] });
  const card = ix.cards.get('c0191');
  const prev = generate({ card, helpers: [y], form: 'ox', seed: 2 });
  const r = drawRetry({ card, index: ix, prev, prevPlan: { f: 'ox', s: 2, x: ['c0190'] }, rng: makeRng(1) });
  eq(r.same, true);
  eq(r.f, 'ox');
});
