// 킬 컷 — 정답 판정 위의 작은 장면. 연속 킬이면 조금 길고 배지가 붙는다(설계 v2 §4)
import { h } from '../dom.js';
import { svgNode } from './svg.js';
import { play } from './motion.js';
import { FX } from './config.js';

const STREAK = { 2: '더블 킬', 3: '트리플 킬', 4: '쿼드라 킬' };
export const streakLabel = (n) => (n >= 2 ? STREAK[n] || `${n}연속 킬` : null);
export const killcutDuration = (streak) => (streak >= 2 ? FX.streak : FX.killcut);

export async function renderKillCut({ agent, streak = 1, motion = true, variant = 'basic', target = '' }) {
  const box = h('div', { class: `killcut ${streak >= 2 ? 'streak' : ''}`, style: `--ac:${agent.color}`, 'aria-hidden': 'true' });
  const svg = await svgNode(`killcut-${variant}`);
  if (svg) { svg.setAttribute('class', 'kc-svg'); box.append(svg); }
  const label = streakLabel(streak);
  if (target) box.append(h('div', { class: 'kc-tag' }, `✕ ${target}`));
  box.append(h('div', { class: 'kc-feed' }, h('span', { class: 'kc-icon' }, '✦'), h('span', {}, `${agent.name} ▸ 표적`)));
  if (label) box.append(h('div', { class: 'kc-badge' }, label));
  play(box, streak >= 2 ? 'streak' : 'killcut', killcutDuration(streak), { motion });
  return box;
}
