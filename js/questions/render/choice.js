import { h } from '../../dom.js';

const NO = ['①', '②', '③', '④', '⑤'];

// 선다·빈칸: 보기 하나를 고르면 draft에 담고, 확정 버튼이 onConfirm을 부른다
export function renderChoice(q, { draft, setDraft, done, chosen }) {
  const sel = Array.isArray(draft) ? draft[0] : null;
  return h('div', { class: `choices ${q.form}` }, q.options.map((o, i) => {
    const cls = ['choice'];
    if (!done && sel === i) cls.push('sel');
    if (done && i === q.answer) cls.push('correct');
    if (done && chosen && chosen[0] === i && i !== q.answer) cls.push('wrong');
    return h('button', { class: cls.join(' '), disabled: done, 'aria-pressed': sel === i ? 'true' : 'false', onclick: () => setDraft([i]) },
      h('span', { class: 'choice-no', 'aria-hidden': 'true' }, q.form === 'blank' ? String.fromCharCode(65 + i) : NO[i]),
      h('span', { class: 'choice-text' }, o.text));
  }));
}
