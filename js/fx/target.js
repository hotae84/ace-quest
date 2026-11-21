// 표적 카드 — 주제 이름·엠블럼·HP 5칸. HP = 5 − min(숙련도, 5). 기록·해시와 무관(설계 v2 §4)
import { h } from '../dom.js';
import { svgNode } from './svg.js';
import { play } from './motion.js';
import { FX } from './config.js';

export const MAX_HP = 5;
export const hpOf = (mastery) => Math.max(0, MAX_HP - Math.min(Number(mastery) || 0, MAX_HP));

// 라운드 안에서 같은 표적을 맞힌 수(upto 앞의 문항까지, 원 시도·재도전 모두)
export function roundKills(round, targetId, upto) {
  if (!round) return 0;
  let n = 0;
  for (let i = 0; i < Math.min(upto, round.q.length); i++) {
    const q = round.q[i];
    if (q.c !== targetId) continue;
    if (q.ok === true) n++;
    if (q.retry && q.retry.ok === true) n++;
  }
  return n;
}

// 표적 카드 DOM. hp 칸은 hp-1..hp-5 중 hp 개만 켜진다. breakIndex가 있으면 그 칸을 깨는 연출을 건다
export async function renderTarget({ name, hp, emblem = null, broken = false, motion = true, breakCell = null }) {
  const box = h('div', { class: `target-card ${hp <= 0 ? 'down' : ''}`, 'aria-label': `표적 ${name} · HP ${hp}/${MAX_HP}` });
  const svg = await svgNode('target-card');
  if (svg) {
    svg.setAttribute('class', 'tc-svg');
    for (let i = 1; i <= MAX_HP; i++) {
      const cell = svg.querySelector(`#hp-${i}`);
      if (!cell) continue;
      if (i > hp) cell.setAttribute('class', i === breakCell ? 'hp-cell hp-off hp-break' : 'hp-cell hp-off');
      else cell.setAttribute('class', 'hp-cell');
    }
    const stamp = svg.querySelector('#stamp');
    if (stamp) stamp.setAttribute('class', `danger ${broken || hp <= 0 ? 'stamp-on' : 'stamp-off'}`);
    box.append(svg);
  }
  const em = emblem ? await svgNode(`emblem-${emblem.id}`) : null;
  box.append(h('div', { class: 'tc-emblem' }, em || h('span', { class: 'tc-initial' }, (emblem?.name || name).slice(0, 1))));
  box.append(h('div', { class: 'tc-name' }, name));
  if (hp <= 0) box.append(h('div', { class: 'tc-stamp-text' }, '제압'));
  if (!svg) box.append(h('div', { class: 'tc-hp-text' }, `HP ${hp}/${MAX_HP}`));
  if (breakCell) play(box, 'hp-hit', FX.hit, { motion });
  return box;
}
