import { test, eq, ok } from './harness.js';
import { readFileSync } from 'node:fs';
import { buildFixedIndex, innerType } from '../js/fixed.js';
import { genFixed } from '../js/questions/fixed.js';
import { generate, grade, canonicalAnswer, displayedTexts, questionHash, optionHashes, questionKey, GENERATOR_VERSION, isMcqForm } from '../js/questions/index.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/fixed-${n}.json`, import.meta.url), 'utf8'));
const fixedIndex = buildFixedIndex([load('f1'), load('f2'), load('f3'), load('f4')]);
const allQ = [...fixedIndex.questionById.values()].map((v) => v.question);
const byType = (t) => allQ.filter((q) => q.type === t);

test('GENERATOR_VERSION은 "2", isMcqForm은 mcq-fixed·blank 포함', () => {
  eq(GENERATOR_VERSION, '2');
  ok(isMcqForm('mcq-fixed') && isMcqForm('mcq-data') && isMcqForm('blank') && !isMcqForm('ox') && !isMcqForm('order'));
});

test('buildFixedIndex: 개념 48·문항 100, byZone, questionById → concept', () => {
  eq(fixedIndex.concepts.size, 48);
  eq(fixedIndex.questionById.size, 100);
  eq(fixedIndex.byZone.get('F4').length, 12);
  const { concept, question } = fixedIndex.questionById.get('q0401');
  eq(concept.id, 'fx0401'); eq(question.id, 'q0401');
  eq(innerType(fixedIndex, 'q0401'), 'mcq');
});

for (const t of ['mcq', 'blank', 'ox', 'order', 'match']) {
  test(`genFixed(${t}): 실제 displayedTexts·questionHash·optionHashes·grade 통과, 같은 seed 동일`, async () => {
    const src = byType(t)[0];
    ok(src, `${t} 문항이 있어야 함`);
    const q = genFixed({ question: src, seed: 7 });
    eq(q.fq, src.id);
    ok(displayedTexts(q).length >= 2);
    const h = await questionHash(q); eq(h.length, 16);
    eq((await optionHashes(q)).length, displayedTexts(q).length);
    ok(grade(q, canonicalAnswer(q)) === true);
    eq(JSON.stringify(q), JSON.stringify(genFixed({ question: src, seed: 7 })));
    eq(q.explain, src.explain); eq(q.ref, src.ref);
  });
}

test('mcq: 정답 텍스트 보존, 보기 수 보존, fixedOrder면 원순서, 부정형 표시', () => {
  for (const src of byType('mcq')) {
    for (const seed of [1, 2, 3]) {
      const q = genFixed({ question: src, seed });
      eq(q.form, 'mcq-fixed');
      eq(q.options.length, src.choices.length, src.id);
      eq(q.options[q.answer].text, src.choices[src.answer], src.id);
      if (src.fixedOrder) eq(q.options.map((o) => o.text), src.choices, src.id);
      eq(q.negative, /옳지 않은|아닌|틀린/.test(src.q), src.id);
      if (src.passage) { eq(q.passage, src.passage); eq(q.passageLabel, src.passageLabel); }
    }
  }
  ok(byType('mcq').some((s) => s.fixedOrder), '검증용 fixedOrder 문항 존재');
  ok(byType('mcq').some((s) => s.choices.length === 5), '5지 문항 존재');
});

test('blank: 정답 텍스트 보존·섞기', () => {
  for (const src of byType('blank')) {
    const q = genFixed({ question: src, seed: 11 });
    eq(q.form, 'blank'); eq(q.text, src.q);
    eq(q.options[q.answer].text, src.choices[src.answer]);
    eq(q.options.length, src.choices.length);
  }
});

test('ox: boolean → index', () => {
  for (const src of byType('ox')) {
    const q = genFixed({ question: src, seed: 1 });
    eq(q.form, 'ox'); eq(q.options.map((o) => o.text), ['O', 'X']);
    eq(q.answer, src.answer ? 0 : 1, src.id);
    eq(q.text, src.q);
  }
});

test('order: 원본이 정답 순서, 표시는 항등 아님(seed 1..200), 정답 복원', () => {
  for (const src of byType('order')) {
    for (let seed = 1; seed <= 200; seed++) {
      const q = genFixed({ question: src, seed });
      eq(q.form, 'order'); eq(q.options, []);
      ok(JSON.stringify(q.items) !== JSON.stringify(src.items), `${src.id} seed ${seed} 항등`);
      eq(q.answer.map((i) => q.items[i]), src.items, src.id);
    }
  }
});

test('match: pairs 보존, rightOrder 항등 아님, 정답 매핑', () => {
  const srcs = byType('match');
  ok(srcs.length >= 1);
  for (const src of srcs) {
    for (let seed = 1; seed <= 200; seed++) {
      const q = genFixed({ question: src, seed });
      eq(q.form, 'match'); eq(q.options, []);
      eq(q.pairs, src.pairs);
      ok(q.rightOrder.some((v, i) => v !== i), `${src.id} seed ${seed} 항등`);
      q.answer.forEach((disp, i) => eq(q.rightOrder[disp], i));
    }
  }
});

test('generate({form:"fixed", fixed, seed})가 genFixed와 같고 questionKey에 fq가 들어간다', () => {
  const a = byType('mcq')[0], b = byType('mcq')[1];
  const qa = generate({ form: 'fixed', fixed: a, seed: 3 });
  eq(JSON.stringify(qa), JSON.stringify(genFixed({ question: a, seed: 3 })));
  ok(questionKey(qa) !== questionKey(generate({ form: 'fixed', fixed: b, seed: 3 })));
  ok(questionKey(qa).includes(a.id));
});
