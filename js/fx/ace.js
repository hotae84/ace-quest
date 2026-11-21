// 에이스 — 결산 진입 시 전체 화면 장면(요원 초상 + ACE + 파편). 탭으로 건너뛴다
import { h } from '../dom.js';
import { svgNode } from './svg.js';
import { avatarImg } from './avatar.js';
import { FX } from './config.js';

export const clearAce = (root = document.body) => { for (const el of root.querySelectorAll('.ace-overlay')) el.remove(); };

// alive(): 엠블럼을 기다리는 동안 화면이 바뀌었으면 띄우지 않는다
export async function showAce(root = document.body, agent, { motion = true, alive = () => true, setTimeout: st = globalThis.setTimeout } = {}) {
  if (!motion) return;
  const em = await svgNode(`emblem-${agent.id}`);
  if (!alive()) return;
  clearAce(root);
  const shards = Array.from({ length: 16 }, (_, i) => h('span', { class: `ace-shard s${i}` }));
  const box = h('div', { class: 'ace-overlay fx-ace', style: `--ac:${agent.color}`, role: 'dialog', 'aria-label': '에이스! 탭해서 건너뛰기' },
    h('div', { class: 'ace-shards' }, shards),
    h('div', { class: 'ace-emblem' }, avatarImg(agent, { cls: 'avatar', fallback: () => em || h('span', { class: 'ace-initial' }, agent.name.slice(0, 1)) })),
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
