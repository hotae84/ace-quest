// 요원 포트레이트 — 공식 초상(실패 시 이니셜)·테마색·계급장. 정적
import { h } from '../dom.js';
import { avatarImg } from './avatar.js';
import { rankOf, RANKS } from './rank.js';

export async function renderPortrait(agent, total, { size = 'sm' } = {}) {
  const rank = rankOf(total);
  return h('div', { class: `portrait ${size}`, style: `--ac:${agent.color}`, 'aria-label': `${agent.name} · ${rank.name}` },
    h('div', { class: 'pt-emblem' }, avatarImg(agent, { cls: 'avatar' })),
    h('div', { class: 'pt-meta' },
      h('span', { class: 'pt-name' }, agent.name),
      h('span', { class: 'pt-rank' }, RANKS.map((r) => h('i', { class: `pip ${r.level <= rank.level ? 'on' : ''}` })), h('b', {}, rank.name))));
}
