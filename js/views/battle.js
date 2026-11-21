import { h } from '../dom.js';
import { RULES } from '../game.js';
import { agentOf, sceneText, topbar } from './common.js';
import { renderChoice } from '../questions/render/choice.js';
import { renderOx } from '../questions/render/ox.js';
import { renderOrder } from '../questions/render/order.js';
import { renderMatch } from '../questions/render/match.js';
import { renderTarget, hpOf, roundKills } from '../fx/target.js';
import { renderPortrait } from '../fx/portrait.js';
import { totalMastery } from '../fx/rank.js';

const RENDER = { 'mcq-data': renderChoice, 'mcq-combo': renderChoice, 'mcq-sent': renderChoice, 'mcq-neg': renderChoice, 'mcq-fixed': renderChoice, blank: renderChoice, ox: renderOx, order: renderOrder, match: renderMatch };
const NEG = /(옳지 않은|아닌|틀린)/;
const STREAK = { 2: '더블 킬', 3: '트리플 킬', 4: '쿼드라 킬' };
const L = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'];

function questionText(text) {
  return text.split(NEG).map((part) => (NEG.test(part) ? h('strong', { class: 'neg' }, part) : part));
}

function passageBox(q) {
  if (q.form === 'mcq-combo') {
    return h('figure', { class: 'passage boxed' }, h('figcaption', {}, '〈보기〉'),
      h('ul', { class: 'statements' }, q.statements.map((s, i) => h('li', {}, h('b', {}, `${L[i]}. `), s))));
  }
  if (!q.passage) return null;
  return h('figure', { class: 'passage source' }, h('figcaption', {}, '📜 자료'), h('div', { class: 'passage-body' }, q.passage));
}

const draftReady = (q, draft) => {
  if (q.form === 'order') return Array.isArray(draft) && draft.length === q.items.length;
  if (q.form === 'match') return Array.isArray(draft?.map) && draft.map.every((v) => v !== null);
  return Array.isArray(draft) && draft.length === 1;
};
const toAnswer = (q, draft) => (q.form === 'match' ? draft.map.slice() : draft.slice());

export function renderBattle(app) {
  const st = app.state;
  const r = st.round;
  const q = st.inRetry ? st.retryQuestion : st.question;
  const slot = st.inRetry ? r.q[r.idx].retry : r.q[r.idx];
  const target = app.currentTarget();
  const agent = agentOf(app, r.agent);
  const n = r.q.length;
  const kills = r.q.filter((x) => x.ok === true).length;
  const balance = app.hintBalance();
  let draft = null;
  let body = null;
  const confirm = h('button', { class: 'btn primary', disabled: true }, '확정');
  const redrawChoices = () => {
    if (q.form === 'order' || q.form === 'match') return; // 자체적으로 다시 그린다
    const nb = RENDER[q.form](q, { draft, setDraft, done: false, chosen: null });
    body.replaceWith(nb); body = nb;
  };
  const setDraft = (d) => { draft = d; confirm.disabled = !draftReady(q, d); redrawChoices(); };
  confirm.onclick = () => { if (draftReady(q, draft)) (st.inRetry ? app.submitRetry : app.submit)(toAnswer(q, draft)); };
  const hintBox = h('div', { class: 'hint-box' });
  const hintBtn = h('button', { class: 'btn ghost small', disabled: slot.hint || balance < RULES.HINT_COST,
    onclick: () => { const res = app.hint(); if (res.ok) { hintBox.replaceChildren(h('p', { class: 'hint-text' }, `💡 ${target.hint}`)); hintBtn.disabled = true; } else app.toast?.(res.reason === 'insufficient' ? '힌트 포인트가 모자라요' : '지금은 쓸 수 없어요'); } },
    `💡 힌트 ${RULES.HINT_COST} (남은 포인트 ${balance})`);
  if (slot.hint) hintBox.replaceChildren(h('p', { class: 'hint-text' }, `💡 ${target.hint}`));
  body = RENDER[q.form](q, { draft, setDraft, done: false, chosen: null });
  // 연출(표적 카드·포트레이트)은 별도 슬롯에 비동기로 그린다 — 기록·해시와 무관
  const mastery = (st.derived?.mastery.get(target.id) || 0) + roundKills(r, target.id, r.idx);
  const targetSlot = h('div', { class: 'fx-slot' });
  renderTarget({ name: target.name, hp: hpOf(mastery), emblem: null, motion: false }).then((el) => targetSlot.replaceChildren(el));
  const portraitSlot = h('div', { class: 'fx-slot' });
  renderPortrait(agent, totalMastery(st.derived?.mastery || new Map())).then((el) => portraitSlot.replaceChildren(el));

  return h('div', { class: 'page battle', style: `--ac:${agent.color}` },
    topbar(app, `${r.mode === 'bonus' ? '보너스 작전' : '출격'} · ${r.zone ? (st.index.zones.find((z) => z.id === r.zone)?.title || '') : '전체'}`,
      { back: null, right: h('button', { class: 'icon-btn', 'aria-label': '지도로(라운드는 이어 풀 수 있어요)', onclick: () => app.go('map') }, '✕') }),
    h('div', { class: 'progress', 'aria-label': `문제 ${r.idx + 1} / ${n}` }, r.q.map((x, i) =>
      h('span', { class: `cell ${x.ok === true ? 'ok' : x.ok === false ? 'no' : ''} ${i === r.idx ? 'current' : ''}` }))),
    h('div', { class: 'battle-hud' }, portraitSlot, targetSlot),
    h('div', { class: 'feed' },
      h('span', { class: 'kills' }, `킬 ${kills}`),
      r.streak >= 2 ? h('span', { class: 'chip streak' }, STREAK[r.streak] || `${r.streak}연속`) : null,
      st.inRetry ? h('span', { class: 'chip retry' }, st.retrySame ? '재도전 · 같은 문제, 보기 순서만 달라요' : '재도전') : null),
    h('main', { class: 'q-area' },
      h('p', { class: 'scene' }, target.scene ? sceneText(target.scene, agent) : `표적: ${target.name}`),
      passageBox(q),
      h('p', { class: 'q-text' }, questionText(q.text)),
      body,
      hintBox),
    h('footer', { class: 'play-foot' }, hintBtn, confirm));
}
