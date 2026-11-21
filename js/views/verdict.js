import { h } from '../dom.js';
import { agentOf, refText, topbar } from './common.js';
import { renderChoice } from '../questions/render/choice.js';
import { renderOx } from '../questions/render/ox.js';
import { renderOrder } from '../questions/render/order.js';
import { renderMatch } from '../questions/render/match.js';
import { renderTarget, hpOf, roundKills } from '../fx/target.js';
import { renderKillCut, pickVariant, pickAbility, roundSalt, killSeq } from '../fx/killcut.js';
import { hitVignette } from '../fx/hit.js';
import { motionEnabled } from '../fx/motion.js';
import { once } from '../fx/once.js';

const RENDER = { 'mcq-data': renderChoice, 'mcq-combo': renderChoice, 'mcq-sent': renderChoice, 'mcq-neg': renderChoice, 'mcq-fixed': renderChoice, blank: renderChoice, ox: renderOx, order: renderOrder, match: renderMatch };

export function renderVerdict(app) {
  const st = app.state;
  const r = st.round;
  const main = r.q[r.idx];
  const slot = st.inRetry ? main.retry : main;
  const q = st.inRetry ? st.retryQuestion : st.question;
  const target = app.currentTarget();
  const agent = agentOf(app, r.agent);
  const ok = slot.ok === true;
  const last = r.idx === r.q.length - 1;
  const canRetry = !st.inRetry && app.offerRetry();
  // 연출은 같은 시도에 한 번만(동기화 등으로 다시 그려져도 재생하지 않는다)
  const motion = motionEnabled(st.settings);
  const first = once(`${r.id}:${r.idx}:${st.inRetry ? 'r' : 'm'}`);
  const before = (st.derived?.mastery.get(target.id) || 0) + roundKills(r, target.id, r.idx) + (st.inRetry && main.ok === true ? 1 : 0);
  const hpAfter = hpOf(before + (ok ? 1 : 0));
  const targetSlot = h('div', { class: 'fx-slot' });
  renderTarget({ name: target.name, hp: hpAfter, emblem: null, motion: motion && first, breakCell: ok && first ? hpAfter + 1 : null }).then((el) => targetSlot.replaceChildren(el));
  const cutSlot = h('div', { class: 'fx-slot' });
  if (ok) {
    // 변형은 라운드 id·이번 시도 이전 정답 수로 결정적(재렌더링에도 같다). 기록과 무관
    const seq = killSeq(r, r.idx, st.inRetry); const salt = roundSalt(r.id);
    cutSlot.append(renderKillCut({ agent, target: target.name, streak: r.streak, variant: pickVariant({ seq, salt }), ability: pickAbility(agent.abilities, { seq, salt }), masteryAfter: Math.min(before + 1, 5), motion: motion && first }));
  }
  if (!ok && first) hitVignette(document.body, { motion });
  return h('div', { class: `page verdict ${ok ? 'ok' : 'no'}`, style: `--ac:${agent.color}` },
    topbar(app, ok ? '클리어' : '피격', { back: null }),
    cutSlot,
    targetSlot,
    h('div', { class: 'verdict-banner' },
      h('strong', {}, ok ? `${agent.name} — ${target.name} 클리어` : `${target.name}에 피격`),
      r.streak >= 2 && ok ? h('span', { class: 'chip streak' }, `${r.streak}연속`) : null),
    h('main', { class: 'q-area' },
      h('p', { class: 'q-text' }, q.text),
      RENDER[q.form](q, { draft: null, setDraft: () => {}, done: true, chosen: slot.a }),
      h('div', { class: 'explain' }, h('p', {}, q.explain), h('p', { class: 'sub' }, refText(q.ref)))),
    h('footer', { class: 'play-foot' },
      canRetry ? h('button', { class: 'btn', onclick: () => app.startRetry() }, '재도전 (같은 주제, 다른 문제)') : null,
      h('button', { class: 'btn primary grow', onclick: () => app.next() }, last ? '결산' : '다음')));
}
