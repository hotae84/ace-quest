import { h } from '../../dom.js';

export function renderOx(q, { draft, setDraft, done, chosen }) {
  const sel = Array.isArray(draft) ? draft[0] : null;
  return h('div', { class: 'ox' }, q.options.map((o, i) => {
    const cls = ['ox-btn'];
    if (!done && sel === i) cls.push('sel');
    if (done && i === q.answer) cls.push('correct');
    if (done && chosen && chosen[0] === i && i !== q.answer) cls.push('wrong');
    return h('button', { class: cls.join(' '), disabled: done, 'aria-pressed': sel === i ? 'true' : 'false', onclick: () => setDraft([i]) }, o.text);
  }));
}
