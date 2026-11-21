// 보급 상자 — 결산 티켓을 상자로. 에이스 티켓은 붉은 상자. 탭하면 열리고 결과가 보인다
import { h } from '../dom.js';
import { play } from './motion.js';
import { FX } from './config.js';

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
export const crateLabel = (t) => (t.won ? `+${fmt(t.size)}` : '꽝');

const opened = new Set(); // `${roundId}:${i}` — 재렌더링(동기화 등) 뒤에도 열린 상자는 열린 채로
export const crateOpened = (key) => opened.has(key);
export const resetCrates = () => opened.clear();

export function renderCrate(t, i, { motion = true, key = null } = {}) {
  const result = h('span', { class: 'crate-result' }, '');
  const was = key && opened.has(key);
  const btn = h('button', { class: `crate ${t.kind} ${was ? `open fx-done ${t.won ? 'won' : 'lost'}` : ''}`, 'aria-label': `보급 상자 ${i + 1}${t.kind === 'ace' ? ' (에이스)' : ''}` },
    h('span', { class: 'crate-lid' }), h('span', { class: 'crate-body' }, t.kind === 'ace' ? '에이스' : '드롭'), result);
  if (was) result.textContent = crateLabel(t);
  btn.onclick = async () => {
    if (btn.classList.contains('open')) return;
    btn.classList.add('open');
    if (key) opened.add(key);
    await play(btn, 'crate', FX.crate, { motion });
    result.textContent = crateLabel(t);
    btn.classList.add(t.won ? 'won' : 'lost');
  };
  return btn;
}
