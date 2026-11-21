// 요원 포트레이트 — 실루엣 카드(테마색·엠블럼 또는 이니셜·계급장). 정적
import { h } from '../dom.js';
import { svgNode } from './svg.js';
import { rankOf, RANKS } from './rank.js';

export async function renderPortrait(agent, total, { size = 'sm' } = {}) {
  const rank = rankOf(total);
  const em = await svgNode(`emblem-${agent.id}`);
  return h('div', { class: `portrait ${size}`, style: `--ac:${agent.color}`, 'aria-label': `${agent.name} · ${rank.name}` },
    h('div', { class: 'pt-emblem' }, em || h('span', { class: 'pt-initial' }, agent.name.slice(0, 1))),
    h('div', { class: 'pt-meta' },
      h('span', { class: 'pt-name' }, agent.name),
      h('span', { class: 'pt-rank' }, RANKS.map((r) => h('i', { class: `pip ${r.level <= rank.level ? 'on' : ''}` })), h('b', {}, rank.name))));
}
