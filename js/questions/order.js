import { shuffle } from '../rng.js';

export function genOrder({ card, helpers, rng }) {
  const all = [card, ...helpers.slice(0, 3)];
  const shown = shuffle(all, rng);
  const items = shown.map((k) => k.terms[0]);
  const answer = shown.map((k, i) => ({ y: k.year, i })).sort((a, b) => a.y - b.y).map((o) => o.i);
  const explain = all.slice().sort((a, b) => a.year - b.year).map((k) => `${k.year} ${k.terms[0]} (📖 ${k.ref}쪽)`).join(' → ');
  return { form: 'order', text: '다음 사건을 먼저 일어난 것부터 순서대로 나열하시오.', items, options: [], answer,
    explain, ref: card.ref, negative: false };
}
