import { h } from '../dom.js';
import { agentOf, fmt, topbar } from './common.js';

export function renderResult(app) {
  const st = app.state;
  const r = st.result;
  const agent = agentOf(app, r?.agent);
  if (!r) return h('div', { class: 'page' }, topbar(app, '결산'), h('p', { class: 'sub' }, '결산할 라운드가 없어요.'));
  const kills = r.q.filter((x) => x.ok === true).length;
  const tickets = r.tickets || [];
  const ticketEls = tickets.map((t, i) => h('button', { class: `ticket ${t.kind}`, 'aria-label': `티켓 ${i + 1}`,
    onclick: (e) => { e.currentTarget.classList.add('flip'); e.currentTarget.querySelector('.back').textContent = t.won ? `+${fmt(t.size)}` : '꽝'; } },
    h('span', { class: 'front' }, t.kind === 'ace' ? '에이스' : '드롭'), h('span', { class: 'back' }, '')));
  return h('div', { class: 'page result', style: `--ac:${agent.color}` },
    topbar(app, r.finished ? '라운드 결산' : '이탈', { back: null }),
    st.saveError ? h('p', { class: 'error' }, '저장 실패 — 저장 공간을 확인한 뒤 "다시 저장"을 누르세요.') : null,
    h('section', { class: 'card stats' },
      h('div', { class: 'stat' }, h('strong', {}, String(kills)), h('span', {}, '킬')),
      h('div', { class: 'stat' }, h('strong', {}, String(r.streakMax)), h('span', {}, '최고 연속')),
      h('div', { class: 'stat' }, h('strong', {}, r.ace ? '에이스' : '—'), h('span', {}, '에이스'))),
    r.finished ? h('section', { class: 'card' },
      h('h2', {}, '드롭 티켓'),
      tickets.length ? h('div', { class: 'tickets' }, ticketEls) : h('p', { class: 'sub' }, '이번 라운드엔 티켓이 없어요.'),
      h('p', { class: 'creds' }, `획득 크레드 +${fmt(r.creds)}`)) : h('p', { class: 'sub' }, '끝내지 않은 라운드는 드롭이 없어요. 푼 문제의 숙련도는 남아요.'),
    h('footer', { class: 'play-foot' },
      st.saveError ? h('button', { class: 'btn primary grow', onclick: () => app.finish() }, '다시 저장') : null,
      h('button', { class: 'btn grow', onclick: () => app.go('map') }, '지도로'),
      !st.saveError ? h('button', { class: 'btn primary grow', onclick: () => app.startRound(r.zone, r.mode === 'bonus' && app.bonusAvailable(r.zone) ? 'bonus' : 'normal') },
        r.mode === 'bonus' && !app.bonusAvailable(r.zone) ? '한 판 더 (일반)' : '한 판 더') : null));
}
