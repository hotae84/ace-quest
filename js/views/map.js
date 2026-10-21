import { h } from '../dom.js';
import { bonusOpen } from '../game.js';
import { agentOf, agentBadge, fmt } from './common.js';

const LEVEL = (m) => (m >= 5 ? 'l3' : m >= 3 ? 'l2' : m >= 1 ? 'l1' : 'l0');

export function renderMap(app) {
  const st = app.state;
  const d = st.derived;
  const agent = agentOf(app);
  const ex = st.exchange || { creds: 1000, label: 'VP 475' };
  const pct = Math.min(100, Math.round((d.balance / ex.creds) * 100));
  const zones = st.index.zones.map((z) => {
    const cards = st.index.byZone.get(z.id) || [];
    const bonus = bonusOpen(cards, d.mastery, d.bonusDone.get(z.id) || 0);
    const cleared = cards.filter((c) => (d.mastery.get(c.id) || 0) >= 5).length;
    return h('section', { class: `card zone ${cards.length ? '' : 'empty'}` },
      h('div', { class: 'zone-head' },
        h('h2', {}, z.title),
        bonus.open ? h('span', { class: 'chip bonus' }, '보너스 작전 개방') : null),
      h('p', { class: 'sub' }, cards.length ? `제압 ${cleared}/${cards.length} · 보너스 준비 ${bonus.ready}/${bonus.total} (기준 ${bonus.threshold})` : '준비 중'),
      h('div', { class: 'dots' }, cards.map((c) => h('span', { class: `dot ${LEVEL(d.mastery.get(c.id) || 0)}`, title: c.subject }))),
      cards.length ? h('div', { class: 'row' },
        h('button', { class: 'btn primary grow', onclick: () => app.startRound(z.id, 'normal') }, '출격'),
        bonus.open ? h('button', { class: 'btn grow bonus-btn', onclick: () => app.startRound(z.id, 'bonus') }, '보너스 작전') : null) : null);
  });
  const red = (st.cache.redemptions || []).slice(-5).reverse();
  return h('div', { class: 'page map' },
    h('header', { class: 'hud' },
      agentBadge(agent, 'md'),
      h('div', { class: 'hud-name' }, h('strong', {}, st.settings.nick || st.settings.playerId), h('span', { class: 'sub' }, ` · ${agent.name}`)),
      h('div', { class: 'hud-stats' },
        h('span', { class: 'chip' }, `💰 ${fmt(d.balance)}`),
        h('span', { class: 'chip hint' }, `💡 ${d.hintPts}`),
        st.queue.length ? h('span', { class: 'chip warn', title: '미전송 기록' }, `⇡ ${st.queue.length}`) : null),
      h('button', { class: 'icon-btn', 'aria-label': '설정', onclick: () => app.go('settings') }, '⚙')),
    h('section', { class: 'card exchange' },
      h('div', { class: 'row between' }, h('span', {}, `다음 환전(${ex.label})까지`), h('strong', {}, `${fmt(d.balance)} / ${fmt(ex.creds)}`)),
      h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${pct}%` }))),
    h('button', { class: 'btn block all', onclick: () => app.startRound(null, 'normal') }, '전체 출격'),
    zones,
    h('section', { class: 'card' },
      h('h2', {}, '환전 내역'),
      red.length ? h('ul', { class: 'plain' }, red.map((r) => h('li', {}, `${String(r.ts).slice(0, 10)} · ${r.label} 지급 · −${fmt(r.creds)} 크레드`))) : h('p', { class: 'sub' }, '아직 없어요.')));
}
