import { h } from '../../dom.js';

// 연표 순서: 항목을 먼저 일어난 것부터 차례로 누른다. draft = 누른 순서의 items index 배열
export function renderOrder(q, { draft, setDraft, done, chosen }) {
  const n = q.items.length;
  if (done) {
    const ans = chosen || [];
    return h('div', { class: 'order done' },
      h('ol', { class: 'slots' }, ans.map((orig, pos) =>
        h('li', { class: `slot filled ${orig === q.answer[pos] ? 'correct' : 'wrong'}` },
          h('span', { class: 'slot-no' }, String(pos + 1)), h('span', {}, q.items[orig])))));
  }
  const picked = Array.isArray(draft) ? draft.slice() : [];
  const root = h('div', { class: 'order' });
  const draw = () => {
    root.replaceChildren(
      h('p', { class: 'hint-text' }, '먼저 일어난 일부터 차례로 누르세요. 채운 칸을 누르면 되돌려요.'),
      h('ol', { class: 'slots' }, Array.from({ length: n }, (_, pos) => {
        const orig = picked[pos];
        if (orig === undefined) return h('li', { class: 'slot empty' }, h('span', { class: 'slot-no' }, String(pos + 1)));
        return h('li', { class: 'slot filled' },
          h('button', { class: 'slot-btn', onclick: () => { picked.splice(pos, 1); setDraft(picked.slice()); draw(); } },
            h('span', { class: 'slot-no' }, String(pos + 1)), h('span', {}, q.items[orig])));
      })),
      h('div', { class: 'pool' }, q.items.map((t, i) => (picked.includes(i) ? null :
        h('button', { class: 'card-chip', onclick: () => { picked.push(i); setDraft(picked.slice()); draw(); } }, t)))));
  };
  draw();
  return root;
}
