import { h } from '../dom.js';
import { bonusOpen } from '../game.js';
import { agentOf, agentBadge, fmt } from './common.js';
import { targetsOf } from '../content.js';
import { renderPortrait } from '../fx/portrait.js';
import { totalMastery } from '../fx/rank.js';

const LEVEL = (m) => (m >= 5 ? 'l3' : m >= 3 ? 'l2' : m >= 1 ? 'l1' : 'l0');

export function renderMap(app) {
  const st = app.state;
  const d = st.derived;
  const agent = agentOf(app);
  const ex = st.exchange || { creds: 1000, label: 'VP 475' };
  const pct = Math.min(100, Math.round((d.balance / ex.creds) * 100));
  const zoneCard = (z) => {
    const targets = targetsOf(z.id, { index: st.index, fixedIndex: st.fixedIndex });
    const bonus = bonusOpen(targets, d.mastery, d.bonusDone.get(z.id) || 0);
    const cleared = targets.filter((t) => (d.mastery.get(t.id) || 0) >= 5).length;
    return h('section', { class: `card zone ${targets.length ? '' : 'empty'}` },
      h('div', { class: 'zone-head' },
        h('h2', {}, `${z.label ? z.label + ' · ' : ''}${z.title}`),
        bonus.open ? h('span', { class: 'chip bonus' }, '보너스 작전 개방') : null),
      h('p', { class: 'sub' }, `📖 ${z.pages}쪽${z.unit ? ` · ${z.unit}` : ''} · ${targets.length ? `제압 ${cleared}/${targets.length} · 보너스 준비 ${bonus.ready}/${bonus.total} (기준 ${bonus.threshold})` : '준비 중'}`),
      h('div', { class: 'dots' }, targets.map((t) => h('span', { class: `dot ${LEVEL(d.mastery.get(t.id) || 0)}`, title: t.kind === 'card' ? t.card.subject : t.concept.name }))),
      targets.length ? h('div', { class: 'row' },
        h('button', { class: 'btn primary grow', onclick: () => app.startRound(z.id, 'normal') }, '출격'),
        bonus.open ? h('button', { class: 'btn grow bonus-btn', onclick: () => app.startRound(z.id, 'bonus') }, '보너스 작전') : null) : null);
  };
  const exam = st.index.zones.filter((z) => (z.group || 'exam') === 'exam').map(zoneCard);
  const archiveZones = st.index.zones.filter((z) => z.group === 'archive');
  const archive = st.settings.showArchive && archiveZones.length
    ? h('details', { class: 'archive' }, h('summary', {}, `이전 퀘스트 범위 (${archiveZones.length})`), archiveZones.map(zoneCard))
    : null;
  const red = (st.cache.player === st.settings.playerId ? st.cache.redemptions || [] : []).slice(-5).reverse();
  const unfinished = st.round && st.round.finished === null;
  const portraitSlot = h('div', { class: 'fx-slot' }, agentBadge(agent, 'md'));
  renderPortrait(agent, totalMastery(d.mastery), { size: 'md' }).then((el) => portraitSlot.replaceChildren(el));
  return h('div', { class: 'page map' },
    h('header', { class: 'hud' },
      portraitSlot,
      h('div', { class: 'hud-name' }, h('strong', {}, st.settings.nick || st.settings.playerId)),
      h('div', { class: 'hud-stats' },
        h('span', { class: 'chip' }, `💰 ${fmt(d.balance)}`),
        h('span', { class: 'chip hint' }, `💡 ${d.hintPts}`),
        st.queue.length ? h('span', { class: 'chip warn', title: '미전송 기록' }, `⇡ ${st.queue.length}`) : null),
      h('button', { class: 'icon-btn', 'aria-label': '설정', onclick: () => app.go('settings') }, '⚙')),
    h('section', { class: 'card exchange' },
      h('div', { class: 'row between' }, h('span', {}, `다음 환전(${ex.label})까지`), h('strong', {}, `${fmt(d.balance)} / ${fmt(ex.creds)}`)),
      h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${pct}%` }))),
    unfinished ? h('button', { class: 'btn block primary', onclick: () => app.resume() }, '▶ 이어 풀기 (진행 중인 라운드)') : null,
    h('button', { class: 'btn block all', onclick: () => app.startRound(null, 'normal') }, unfinished ? '전체 출격 (진행 중 라운드는 이탈)' : '전체 출격'),
    exam,
    archive,
    h('section', { class: 'card' },
      h('h2', {}, '환전 내역'),
      red.length ? h('ul', { class: 'plain' }, red.map((r) => h('li', {}, `${String(r.ts).slice(0, 10)} · ${r.label} 지급 · −${fmt(r.creds)} 크레드`))) : h('p', { class: 'sub' }, '아직 없어요.')));
}
