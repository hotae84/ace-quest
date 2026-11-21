import { h } from '../dom.js';
import { avatarImg } from '../fx/avatar.js';

export const refText = (ref) => `📖 교과서 ${String(ref).replace(/-/g, '~').replace(/,/g, ', ')}쪽`;

export function agentOf(app, id = app.state.settings.agent) {
  return app.state.agents.find((a) => a.id === id) || { id, name: id || '요원', color: '#9aa5b1', line: '' };
}

// 요원 배지: 공식 초상, 실패 시 이니셜
export function agentBadge(agent, size = 'sm') {
  const initial = () => h('span', { class: 'ab-initial' }, agent.name.slice(0, 1));
  return h('span', { class: `agent-badge ${size}`, style: `--ac:${agent.color}`, 'aria-hidden': 'true' }, avatarImg(agent, { cls: 'avatar', fallback: initial }));
}

export function topbar(app, title, { back = 'map', right = null } = {}) {
  return h('header', { class: 'topbar' },
    back ? h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: () => app.go(back) }, '←') : h('span', { class: 'topbar-spacer' }),
    h('h1', { class: 'topbar-title' }, title),
    right || h('span', { class: 'topbar-spacer', 'aria-hidden': 'true' }));
}

// scene의 {agent}를 요원 이름으로(표시 단계에서만, 설계 §6.2)
export const sceneText = (scene, agent) => String(scene || '').replaceAll('{agent}', agent.name);

export const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
