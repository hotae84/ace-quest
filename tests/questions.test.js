import { test, eq, ok } from './harness.js';
import { makeRng } from '../js/rng.js';
import { canonical } from '../js/hash.js';
import { buildIndex, pickHelpers, FORMS } from '../js/content.js';
import { GENERATOR_VERSION, generate, grade, canonicalAnswer, questionHash, optionHashes } from '../js/questions/index.js';
import { zones, cards } from './fixture.js';

const index = buildIndex({ zones, cards });
const c = (id) => index.cards.get(id);
function make(cardId, form, seed) {
  const card = c(cardId);
  const x = pickHelpers({ card, form, index, rng: makeRng(seed) });
  return generate({ card, helpers: x.map((id) => c(id)), form, seed });
}
const SIZE = { 'mcq-data': 4, 'mcq-combo': 4, 'mcq-sent': 4, 'mcq-neg': 4, ox: 2, blank: 4, order: 4, match: 3 };
const texts = (q) => (q.form === 'order' ? q.items : q.form === 'match' ? q.pairs.map((p) => p[1]) : q.options.map((o) => o.text));

test('GENERATOR_VERSION은 "1"', () => eq(GENERATOR_VERSION, '1'));

for (const form of FORMS) {
  test(`${form}: 같은 입력이면 같은 문제`, () => {
    eq(canonical(make('c0101', form, 7)), canonical(make('c0101', form, 7)));
  });
  test(`${form}: 정답으로 채점하면 참`, () => {
    const q = make('c0101', form, 7);
    ok(grade(q, canonicalAnswer(q)) === true);
  });
  test(`${form}: 보기 수`, () => {
    const q = make('c0101', form, 7);
    eq(texts(q).length, SIZE[form]);
  });
  test(`${form}: optionHashes 길이 = 보기 수, 8자`, async () => {
    const q = make('c0101', form, 7);
    const oh = await optionHashes(q);
    eq(oh.length, SIZE[form]);
    ok(oh.every((h) => h.length === 8));
  });
  test(`${form}: questionHash 16자, seed 바꾸면 달라짐`, async () => {
    const a = await questionHash(make('c0101', form, 7));
    const b = await questionHash(make('c0101', form, 8));
    eq(a.length, 16);
    ok(a !== b, 'seed가 다르면 해시가 달라야 함');
  });
  test(`${form}: scene을 넣지 않는다`, () => {
    ok(!('scene' in make('c0101', form, 7)));
  });
}

test('mcq-data: 정답 텍스트가 오답에 없고 passage·자료 라벨', () => {
  const q = make('c0101', 'mcq-data', 3);
  const t = q.options.map((o) => o.text);
  eq(t.filter((s) => s === t[q.answer]).length, 1);
  ok(c('c0101').true.includes(t[q.answer]));
  ok(q.passage && q.passageLabel === '자료');
  ok(q.negative === false);
});

test('mcq-sent: 옳은 것 — 정답은 주 카드 true, 나머지는 false·허용 카드 true', () => {
  const q = make('c0101', 'mcq-sent', 5);
  const t = q.options.map((o) => o.text);
  ok(c('c0101').true.includes(t[q.answer]));
  const others = t.filter((_, i) => i !== q.answer);
  const pool = [...c('c0101').false, ...c('c0102').true, ...c('c0103').true, ...c('c0104').true];
  ok(others.every((s) => pool.includes(s)));
  ok(q.text.includes('옳은 것'));
});

test('mcq-neg: 옳지 않은 것 — 정답 하나만 거짓, 나머지 셋은 주 카드 true', () => {
  const q = make('c0101', 'mcq-neg', 5);
  const t = q.options.map((o) => o.text);
  ok(q.negative === true && q.text.includes('옳지 않은'));
  ok(!c('c0101').true.includes(t[q.answer]));
  eq(t.filter((s) => c('c0101').true.includes(s)).length, 3);
});

test('mcq-combo: ㄱ~ㄹ 4개, 조합 보기 사전순, 정답 조합 = 참 진술 둘', () => {
  const q = make('c0101', 'mcq-combo', 9);
  eq(q.statements.length, 4);
  const labels = q.options.map((o) => o.text);
  eq(labels, labels.slice().sort());
  const trueIdx = q.statements.map((s, i) => (c('c0101').true.includes(s) ? i : -1)).filter((i) => i >= 0);
  eq(trueIdx.length, 2);
  const L = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'];
  eq(labels[q.answer], `${L[trueIdx[0]]}, ${L[trueIdx[1]]}`);
  eq(q.passageLabel, '보기');
});

test('ox: seed 짝수면 참 진술(O), 홀수면 거짓 진술(X)', () => {
  const a = make('c0101', 'ox', 4);
  eq(a.answer, 0); ok(c('c0101').true.includes(a.text));
  const b = make('c0101', 'ox', 5);
  eq(b.answer, 1); ok(!c('c0101').true.includes(b.text));
  eq(b.options.map((o) => o.text), ['O', 'X']);
});

test('ox: false가 없으면 helpers[0]의 true를 거짓 진술로', () => {
  const card = { ...c('c0101'), false: [] };
  const q = generate({ card, helpers: [c('c0102')], form: 'ox', seed: 5 });
  ok(c('c0102').true.includes(q.text));
});

test('blank: 정답 용어 + 허용 카드 용어 3개', () => {
  const q = make('c0101', 'blank', 2);
  const t = q.options.map((o) => o.text);
  eq(t[q.answer], '용어1');
  eq(new Set(t).size, 4);
  eq(q.text, c('c0101').blank.text);
});

test('order: 정답은 연도 오름차순, 해설에 연도와 쪽', () => {
  const q = make('c0101', 'order', 11);
  const yearOf = (term) => cards.find((k) => k.terms[0] === term).year;
  const ys = q.answer.map((i) => yearOf(q.items[i]));
  eq(ys, ys.slice().sort((a, b) => a - b));
  ok(q.explain.includes('1914') && q.explain.includes('180~181'));
});

test('match: 세 짝, rightOrder 순열, 정답은 왼쪽 i → 오른쪽 표시 index', () => {
  const q = make('c0101', 'match', 13);
  eq(q.pairs.length, 3);
  eq(q.rightOrder.slice().sort(), [0, 1, 2]);
  q.answer.forEach((disp, i) => eq(q.rightOrder[disp], i));
});

test('helpers 밖 카드의 진술은 보기에 나오지 않는다', () => {
  const unique = c('c0106').true[0];
  for (const form of ['mcq-data', 'mcq-sent', 'mcq-combo', 'mcq-neg', 'ox']) {
    for (let s = 1; s <= 20; s++) {
      const q = make('c0101', form, s);
      ok(!texts(q).includes(unique) && q.text !== unique && !(q.statements || []).includes(unique), `${form} seed ${s}`);
    }
  }
});

test('grade: 잘못된 표현은 false', () => {
  const m = make('c0101', 'mcq-data', 1);
  ok(grade(m, [99]) === false);
  ok(grade(m, []) === false);
  const o = make('c0101', 'order', 1);
  ok(grade(o, o.answer.slice(0, 3)) === false);
  ok(grade(o, [0, 0, 1, 2]) === false);
  const t = make('c0101', 'match', 1);
  ok(grade(t, [t.answer[1], t.answer[0], t.answer[2]]) === false || t.answer[0] === t.answer[1]);
});
