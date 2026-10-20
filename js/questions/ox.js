import { pick } from '../rng.js';

// seed 짝수 = 참 진술(O), 홀수 = 거짓 진술(X)
export function genOx({ card, helpers, seed, rng }) {
  const isTrue = seed % 2 === 0;
  let text;
  if (isTrue) text = pick(card.true, rng);
  else if (card.false.length) text = pick(card.false, rng);
  else text = pick(helpers[0].true, rng);
  return { form: 'ox', text, options: [{ text: 'O' }, { text: 'X' }], answer: isTrue ? 0 : 1,
    explain: card.true[0], ref: card.ref, negative: false };
}
