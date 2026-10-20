import { shuffle } from '../rng.js';

export function genBlank({ card, helpers, rng }) {
  const answerText = card.blank.answer;
  const options = shuffle([answerText, ...helpers.slice(0, 3).map((h) => h.terms[0])], rng).map((text) => ({ text }));
  return { form: 'blank', text: card.blank.text, options, answer: options.findIndex((o) => o.text === answerText),
    explain: card.true[0], ref: card.ref, negative: false };
}
