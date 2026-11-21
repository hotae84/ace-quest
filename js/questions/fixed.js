import { makeRng, shuffle } from '../rng.js';

const NEG = /옳지 않은|아닌|틀린/;
const identity = (perm) => perm.every((v, i) => v === i);
// 항등 순열이면 다시 섞는다(위에서부터 누르면 정답이 되지 않게)
function nonIdentityPerm(n, rng) {
  let perm = shuffle(Array.from({ length: n }, (_, i) => i), rng);
  let guard = 0;
  while (identity(perm) && n > 1 && guard++ < 20) perm = shuffle(perm, rng);
  if (identity(perm) && n > 1) perm = [perm[1], perm[0], ...perm.slice(2)];
  return perm;
}

// 역사 퀘스트 고정 문항 → Question 변환표(설계 v2 §3.2). 입력은 (question, seed)뿐.
export function genFixed({ question: src, seed }) {
  const rng = makeRng(seed);
  const base = { fq: src.id, explain: src.explain, ref: src.ref, negative: NEG.test(src.q || '') };
  if (src.type === 'mcq' || src.type === 'blank') {
    const order = src.fixedOrder ? src.choices.map((_, i) => i) : shuffle(src.choices.map((_, i) => i), rng);
    const options = order.map((i) => ({ text: src.choices[i] }));
    return { ...base, form: src.type === 'mcq' ? 'mcq-fixed' : 'blank', text: src.q,
      ...(src.passage ? { passage: src.passage, passageLabel: src.passageLabel || '자료' } : {}),
      options, answer: order.indexOf(src.answer) };
  }
  if (src.type === 'ox') {
    return { ...base, form: 'ox', text: src.q, options: [{ text: 'O' }, { text: 'X' }], answer: src.answer ? 0 : 1 };
  }
  if (src.type === 'order') {
    // 원본 items가 정답 순서. 표시는 섞고 answer는 표시 index를 정답 순서로 나열
    const perm = nonIdentityPerm(src.items.length, rng); // perm[pos] = 원본 index
    const items = perm.map((i) => src.items[i]);
    const answer = src.items.map((_, origIdx) => perm.indexOf(origIdx));
    return { ...base, form: 'order', text: src.q, items, options: [], answer };
  }
  if (src.type === 'match') {
    const rightOrder = nonIdentityPerm(src.pairs.length, rng);
    const answer = src.pairs.map((_, i) => rightOrder.indexOf(i));
    return { ...base, form: 'match', text: src.q, pairs: src.pairs.map((p) => p.slice()), rightOrder, options: [], answer };
  }
  throw new Error(`알 수 없는 고정 문항 유형: ${src.type}`);
}
