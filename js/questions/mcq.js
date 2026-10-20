import { shuffle, pick, pickN } from '../rng.js';

const LABELS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'];

// 오답 n개: 주 카드 false에서 최대 maxFalse개, 나머지는 helpers 각 1문장(사용 순서 = helpers 순서)
function distractors(card, helpers, n, maxFalse, rng) {
  const out = pickN(card.false, Math.min(maxFalse, card.false.length, n), rng);
  for (const h of helpers) {
    if (out.length >= n) break;
    out.push(pick(h.true, rng));
  }
  if (out.length < n) throw new Error(`오답 부족: ${card.id}`);
  return out;
}

function base(card, form, negative) {
  return { form, ref: card.ref, explain: card.true[0], negative };
}

export function genMcqData({ card, helpers, rng }) {
  const answerText = pick(card.true, rng);
  const wrong = distractors(card, helpers, 3, 2, rng);
  const options = shuffle([answerText, ...wrong], rng).map((text) => ({ text }));
  return { ...base(card, 'mcq-data', false), passage: card.passage, passageLabel: '자료',
    text: '이 자료와 관련된 설명으로 옳은 것은?', options, answer: options.findIndex((o) => o.text === answerText) };
}

export function genMcqSent({ card, helpers, rng }) {
  const answerText = pick(card.true, rng);
  const wrong = distractors(card, helpers, 3, 2, rng);
  const options = shuffle([answerText, ...wrong], rng).map((text) => ({ text }));
  return { ...base(card, 'mcq-sent', false), text: `${card.subject}에 대한 설명으로 옳은 것은?`,
    options, answer: options.findIndex((o) => o.text === answerText) };
}

export function genMcqNeg({ card, helpers, rng }) {
  const trues = pickN(card.true, 3, rng);
  const [wrong] = distractors(card, helpers, 1, 1, rng);
  const options = shuffle([...trues, wrong], rng).map((text) => ({ text }));
  return { ...base(card, 'mcq-neg', true), text: `${card.subject}에 대한 설명으로 옳지 않은 것은?`,
    options, answer: options.findIndex((o) => o.text === wrong) };
}

function combos(n, k) {
  const out = [];
  const walk = (start, acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i < n; i++) { acc.push(i); walk(i + 1, acc); acc.pop(); }
  };
  walk(0, []);
  return out;
}

export function genMcqCombo({ card, helpers, rng }) {
  const trues = pickN(card.true, 2, rng);
  const wrong = distractors(card, helpers, 2, 1, rng);
  const statements = shuffle([...trues, ...wrong], rng);
  const correct = statements.map((s, i) => (trues.includes(s) ? i : -1)).filter((i) => i >= 0);
  const label = (cmb) => cmb.map((i) => LABELS[i]).join(', ');
  const all = combos(4, 2);
  const correctLabel = label(correct);
  const others = pickN(all.filter((cmb) => label(cmb) !== correctLabel), 3, rng);
  const options = [correctLabel, ...others.map(label)].sort().map((text) => ({ text }));
  return { ...base(card, 'mcq-combo', false), passageLabel: '보기', statements,
    text: `〈보기〉에서 ${card.subject}에 대한 설명으로 옳은 것을 고른 것은?`,
    options, answer: options.findIndex((o) => o.text === correctLabel) };
}
