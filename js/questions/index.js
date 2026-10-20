import { makeRng } from '../rng.js';
import { canonical, sha256Hex, short } from '../hash.js';
import { genMcqData, genMcqSent, genMcqNeg, genMcqCombo } from './mcq.js';
import { genOx } from './ox.js';
import { genBlank } from './blank.js';
import { genOrder } from './order.js';
import { genMatch } from './match.js';

// 생성 결과가 달라지는 변경마다 올린다(설계 §4.2)
export const GENERATOR_VERSION = '1';

const GEN = { 'mcq-data': genMcqData, 'mcq-sent': genMcqSent, 'mcq-neg': genMcqNeg, 'mcq-combo': genMcqCombo,
  ox: genOx, blank: genBlank, order: genOrder, match: genMatch };

// 입력은 (card, helpers, form, seed)뿐 — 숨은 입력 없음. scene은 넣지 않는다(표시 단계가 붙임)
export function generate({ card, helpers = [], form, seed }) {
  const gen = GEN[form];
  if (!gen) throw new Error(`알 수 없는 form: ${form}`);
  return gen({ card, helpers, seed, rng: makeRng(seed) });
}

export function canonicalAnswer(q) {
  return Array.isArray(q.answer) ? q.answer.slice() : [q.answer];
}

const isPerm = (a, n) => Array.isArray(a) && a.length === n && a.every((v) => Number.isInteger(v) && v >= 0 && v < n) && new Set(a).size === n;

export function grade(q, a) {
  if (!Array.isArray(a)) return false;
  if (q.form === 'order') return isPerm(a, q.items.length) && a.every((v, i) => v === q.answer[i]);
  if (q.form === 'match') return isPerm(a, q.pairs.length) && a.every((v, i) => v === q.answer[i]);
  return a.length === 1 && a[0] === q.answer;
}

// 표시 순서의 보기 텍스트(order는 items, match는 rightOrder를 따른 오른쪽)
export function displayedTexts(q) {
  if (q.form === 'order') return q.items.slice();
  if (q.form === 'match') return q.rightOrder.map((i) => q.pairs[i][1]);
  return q.options.map((o) => o.text);
}

export async function questionHash(q) {
  const body = { form: q.form, text: q.text, passage: q.passage ?? null, statements: q.statements ?? null,
    options: q.options.map((o) => o.text), items: q.items ?? null, pairs: q.pairs ?? null, answer: q.answer };
  return short(await sha256Hex(canonical(body)), 16);
}

export async function optionHashes(q) {
  return Promise.all(displayedTexts(q).map(async (t) => short(await sha256Hex(t), 8)));
}
