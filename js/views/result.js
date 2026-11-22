import { h } from '../dom.js';
import { agentOf, fmt, topbar } from './common.js';
import { renderCrate, crateRevealed } from '../fx/crate.js';
import { showAce } from '../fx/ace.js';
import { motionEnabled } from '../fx/motion.js';
import { once } from '../fx/once.js';
import { scoreView, animateCount, animateBar } from '../fx/score.js';
import { RANKS, totalMastery } from '../fx/rank.js';

export function renderResult(app) {
  const st = app.state;
  const r = st.result;
  const agent = agentOf(app, r?.agent);
  if (!r) return h('div', { class: 'page' }, topbar(app, '결산'), h('p', { class: 'sub' }, '결산할 라운드가 없어요.'));
  const kills = r.q.filter((x) => x.ok === true).length;
  const tickets = r.tickets || [];
  const motion = motionEnabled(st.settings);
  // 성취 수치(설계 0.3.0 §4.2): 상자 전부 공개 뒤 카운트업 → 잔액 막대 → 환전 가능 → 승급. 저장 실패 중엔 보류
  const killsThisRound = r.q.filter((x) => x.ok === true || x.retry?.ok === true).length;
  const label = st.exchange?.label || 'VP 475';
  const view = scoreView({ balanceAfter: st.derived?.balance || 0, creds: r.creds, threshold: st.exchange?.creds || 1000, finished: Boolean(r.finished), masteryTotalAfter: totalMastery(st.derived?.mastery || new Map()), killsThisRound, pending: Boolean(st.saveError) });
  const keys = tickets.map((_, i) => `${r.id}:${i}`);
  const allRevealed = () => keys.every(crateRevealed);
  const scoreBox = h('section', { class: 'card score' });
  const drawScore = async (final, animate) => {
    if (view.pending) { scoreBox.replaceChildren(h('h2', {}, '성과'), h('p', { class: 'sub' }, '저장이 끝나면 크레드·잔액이 표시됩니다.')); return; }
    const num = h('strong', { class: 'score-num' }, final ? (animate ? '0' : `+${fmt(view.creds)}`) : '?');
    const fill = h('i', { class: `${animate ? '' : 'nt'}` });
    const bar = h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(final ? view.pct1 : view.pct0) }, fill);
    const shown = final ? view.after : view.before;
    const rows = [
      h('h2', {}, '성과'),
      h('div', { class: 'score-row' }, h('span', {}, r.finished ? '획득 크레드' : '이탈 — 드롭 없음'), num),
      h('div', { class: 'score-row small' }, h('span', {}, `잔액 ${fmt(view.before)}${final && view.creds ? ` → ${fmt(view.after)}` : ''}`), h('span', {}, `다음 환전(${label})까지 ${fmt(Math.max(0, view.threshold - shown))}`)),
      bar,
      final && view.crossed ? h('p', { class: 'chip exch-ready' }, `${label} 환전 가능!`) : null,
      final && view.rankUp ? h('div', { class: 'rank-up' }, h('strong', {}, `승급 — ${view.rankAfter.name}`), h('span', { class: 'pt-rank' }, RANKS.map((k) => h('i', { class: `pip ${k.level <= view.rankAfter.level ? 'on' : ''}` })))) : null,
    ];
    scoreBox.replaceChildren(...rows.filter(Boolean));
    fill.style.width = `${final && !animate ? view.pct1 : view.pct0}%`;
    if (final && animate) {
      await animateCount(num, 0, view.creds, 800, { motion, fmt: (n) => `+${fmt(n)}` });
      await animateBar(fill, view.pct0, view.pct1, { motion });
    }
  };
  // 상자를 먼저 만든다 — 개봉 도중 재렌더링이면 renderCrate가 공개 완료로 복원하므로, 그 뒤에 settled를 판정해야 "?"에 멈추지 않는다(코드 리뷰 v1 Medium)
  const onRevealed = () => { if (!view.pending && allRevealed() && scoreBox.isConnected && once(`score:${r.id}`)) drawScore(true, true); };
  const crates = tickets.map((t, i) => renderCrate(t, i, { motion, key: keys[i], onRevealed }));
  const settled = tickets.length === 0 || allRevealed();
  if (view.pending) drawScore(false, false);
  else if (settled) { const first = once(`score:${r.id}`); drawScore(true, first && motion && tickets.length > 0); }
  else drawScore(false, false);
  if (r.ace && r.finished && once(`ace:${r.id}`)) showAce(document.body, agent, { motion, alive: () => st.view === 'result' && st.result?.id === r.id });
  return h('div', { class: 'page result', style: `--ac:${agent.color}` },
    topbar(app, r.finished ? '라운드 결산' : '이탈', { back: null }),
    st.saveError ? h('p', { class: 'error' }, '저장 실패 — 저장 공간을 확인한 뒤 "다시 저장"을 누르세요.') : null,
    h('section', { class: 'card stats' },
      h('div', { class: 'stat' }, h('strong', {}, String(kills)), h('span', {}, '킬')),
      h('div', { class: 'stat' }, h('strong', {}, String(r.streakMax)), h('span', {}, '최고 연속')),
      h('div', { class: 'stat' }, h('strong', {}, r.ace ? '에이스' : '—'), h('span', {}, '에이스'))),
    r.ace && r.finished ? h('div', { class: 'ace-banner' }, `ACE — ${agent.name}, 전원 제압`) : null,
    r.finished ? h('section', { class: 'card' },
      h('h2', {}, '보급 상자'),
      tickets.length ? h('div', { class: 'crates' }, crates) : h('p', { class: 'sub' }, '이번 라운드엔 보급 상자가 없어요.')) : h('p', { class: 'sub' }, '끝내지 않은 라운드는 드롭이 없어요. 푼 문제의 숙련도는 남아요.'),
    scoreBox,
    h('footer', { class: 'play-foot' },
      st.saveError ? h('button', { class: 'btn primary grow', onclick: () => app.finish() }, '다시 저장') : null,
      h('button', { class: 'btn grow', onclick: () => app.go('map') }, '지도로'),
      !st.saveError ? h('button', { class: 'btn primary grow', onclick: () => app.startRound(r.zone, r.mode === 'bonus' && app.bonusAvailable(r.zone) ? 'bonus' : 'normal') },
        r.mode === 'bonus' && !app.bonusAvailable(r.zone) ? '한 판 더 (일반)' : '한 판 더') : null));
}
