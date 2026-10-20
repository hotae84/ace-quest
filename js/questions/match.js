import { shuffle } from '../rng.js';

export function genMatch({ card, helpers, rng }) {
  const all = shuffle([card, ...helpers.slice(0, 2)], rng);
  const pairs = all.map((k) => [k.terms[0], k.true[0]]);
  const rightOrder = shuffle([0, 1, 2], rng);
  const answer = pairs.map((_, i) => rightOrder.indexOf(i));
  const explain = pairs.map((p) => `${p[0]} – ${p[1]}`).join(' / ');
  return { form: 'match', text: '용어와 설명을 알맞게 연결하시오.', pairs, rightOrder, options: [], answer,
    explain, ref: card.ref, negative: false };
}
