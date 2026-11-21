// 에이스 — 결산 진입 시 전체 화면 장면(요원 초상 + ACE + 파편). 탭으로 건너뛴다
import { h } from '../dom.js';
import { avatarImg, fullUrl } from './avatar.js';
import { FX } from './config.js';

// 전신 일러스트 → 실패 시 초상 아이콘 → 실패 시 이니셜
function fullImg(agent) {
  const src = fullUrl(agent.id);
  const icon = () => avatarImg(agent, { cls: 'avatar ace-icon', fallback: () => h('span', { class: 'ace-initial' }, agent.name.slice(0, 1)) });
  if (!src) return icon();
  const img = h('img', { class: 'ace-full', src, alt: '', decoding: 'async', draggable: 'false' });
  img.addEventListener('error', () => img.replaceWith(icon()), { once: true });
  return img;
}

export const clearAce = (root = document.body) => { for (const el of root.querySelectorAll('.ace-overlay')) el.remove(); };

// alive(): 호출 뒤 화면이 바뀌었으면 띄우지 않는다(동기 호출이지만 호출자가 await 할 수 있게 async 유지)
export async function showAce(root = document.body, agent, { motion = true, alive = () => true, setTimeout: st = globalThis.setTimeout } = {}) {
  if (!motion) return;
  if (!alive()) return;
  clearAce(root);
  const shards = Array.from({ length: 16 }, (_, i) => h('span', { class: `ace-shard s${i}` }));
  const box = h('div', { class: 'ace-overlay fx-ace', style: `--ac:${agent.color}`, role: 'dialog', 'aria-label': '에이스! 탭해서 건너뛰기' },
    h('div', { class: 'ace-shards' }, shards),
    h('div', { class: 'ace-art' }, fullImg(agent)),
    h('div', { class: 'ace-word' }, 'ACE'),
    h('div', { class: 'ace-sub' }, `${agent.name} — 전원 제압`),
    h('div', { class: 'ace-skip' }, '탭해서 건너뛰기'));
  root.append(box);
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; box.remove(); resolve(); };
    box.addEventListener('click', finish, { once: true });
    st(finish, FX.ace);
  });
}
