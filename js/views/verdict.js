import { h } from '../dom.js';
import { agentOf, refText, topbar } from './common.js';
import { renderChoice } from '../questions/render/choice.js';
import { renderOx } from '../questions/render/ox.js';
import { renderOrder } from '../questions/render/order.js';
import { renderMatch } from '../questions/render/match.js';

const RENDER = { 'mcq-data': renderChoice, 'mcq-combo': renderChoice, 'mcq-sent': renderChoice, 'mcq-neg': renderChoice, blank: renderChoice, ox: renderOx, order: renderOrder, match: renderMatch };

export function renderVerdict(app) {
  const st = app.state;
  const r = st.round;
  const main = r.q[r.idx];
  const slot = st.inRetry ? main.retry : main;
  const q = st.inRetry ? st.retryQuestion : st.question;
  const card = st.index.cards.get(main.c);
  const agent = agentOf(app, r.agent);
  const ok = slot.ok === true;
  const last = r.idx === r.q.length - 1;
  const canRetry = !st.inRetry && app.offerRetry();
  return h('div', { class: `page verdict ${ok ? 'ok' : 'no'}`, style: `--ac:${agent.color}` },
    topbar(app, ok ? '클리어' : '피격', { back: null }),
    h('div', { class: 'verdict-banner' },
      h('strong', {}, ok ? `${agent.name} — ${card.subject} 클리어` : `${card.subject}에 피격`),
      r.streak >= 2 && ok ? h('span', { class: 'chip streak' }, `${r.streak}연속`) : null),
    h('main', { class: 'q-area' },
      h('p', { class: 'q-text' }, q.text),
      RENDER[q.form](q, { draft: null, setDraft: () => {}, done: true, chosen: slot.a }),
      h('div', { class: 'explain' }, h('p', {}, q.explain), h('p', { class: 'sub' }, refText(q.ref)))),
    h('footer', { class: 'play-foot' },
      canRetry ? h('button', { class: 'btn', onclick: () => app.startRetry() }, '재도전 (같은 주제, 다른 문제)') : null,
      h('button', { class: 'btn primary grow', onclick: () => app.next() }, last ? '결산' : '다음')));
}
