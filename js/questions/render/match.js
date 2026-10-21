import { h } from '../../dom.js';

// 짝 맞추기: 왼쪽을 누른 뒤 오른쪽(표시 순서 rightOrder)을 누른다. draft = { map: [왼쪽 i → 오른쪽 표시 index|null], sel }
export function renderMatch(q, { draft, setDraft, done, chosen }) {
  const n = q.pairs.length;
  const rightText = (disp) => q.pairs[q.rightOrder[disp]][1];
  if (done) {
    const ans = chosen || [];
    return h('div', { class: 'match done' },
      h('ul', { class: 'match-result' }, q.pairs.map((p, i) => {
        const good = ans[i] === q.answer[i];
        return h('li', { class: good ? 'correct' : 'wrong' },
          h('span', {}, p[0]), h('span', { class: 'arrow' }, good ? '✓' : '✗'), h('span', {}, ans[i] === undefined ? '' : rightText(ans[i])),
          good ? null : h('span', { class: 'fix' }, `→ 정답: ${p[1]}`));
      })));
  }
  const map = Array.isArray(draft?.map) ? draft.map.slice() : Array(n).fill(null);
  let sel = Number.isInteger(draft?.sel) ? draft.sel : null;
  const root = h('div', { class: 'match' });
  const save = () => setDraft({ map: map.slice(), sel });
  const draw = () => {
    root.replaceChildren(
      h('p', { class: 'hint-text' }, '왼쪽을 누른 뒤 짝이 되는 오른쪽을 누르세요. 연결된 것을 다시 누르면 풀려요.'),
      h('div', { class: 'match-cols' },
        h('div', { class: 'col' }, q.pairs.map((p, i) =>
          h('button', { class: `m-item left ${sel === i ? 'sel' : ''} ${map[i] !== null ? 'paired' : ''}`,
            onclick: () => { if (map[i] !== null) { map[i] = null; sel = null; } else sel = sel === i ? null : i; save(); draw(); } },
            map[i] !== null ? h('span', { class: 'badge' }, String(i + 1)) : null, p[0]))),
        h('div', { class: 'col' }, q.rightOrder.map((_, disp) => {
          const owner = map.indexOf(disp);
          return h('button', { class: `m-item right ${owner >= 0 ? 'paired' : ''}`, disabled: sel === null && owner < 0,
            onclick: () => {
              if (sel === null) { if (owner >= 0) { map[owner] = null; save(); draw(); } return; }
              if (owner >= 0) map[owner] = null;
              map[sel] = disp; sel = null; save(); draw();
            } }, owner >= 0 ? h('span', { class: 'badge' }, String(owner + 1)) : null, rightText(disp));
        }))));
  };
  draw();
  return root;
}
