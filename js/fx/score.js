// 결산 성취 수치(설계 0.3.0 §4.2) — 규칙·기록 불변. derived(이번 라운드 포함)에서 "전" 값을 역산한다
import { rankOf } from './rank.js';

export function scoreView({ balanceAfter = 0, creds = 0, threshold = 1000, finished = true, masteryTotalAfter = 0, killsThisRound = 0, pending = false }) {
  if (pending) return { pending: true };
  const c = finished ? Math.max(0, Number(creds) || 0) : 0;
  const after = Number(balanceAfter) || 0;
  const before = after - c;
  const th = Math.max(1, Number(threshold) || 1000);
  const pct = (x) => Math.max(0, Math.min(100, Math.round((x / th) * 100)));
  const rankAfter = rankOf(masteryTotalAfter);
  const rankBefore = rankOf(Math.max(0, masteryTotalAfter - killsThisRound));
  return {
    pending: false, before, after, creds: c, threshold: th, pct0: pct(before), pct1: pct(after),
    remaining: Math.max(0, th - after), crossed: before < th && after >= th,
    rankBefore, rankAfter, rankUp: rankAfter.level > rankBefore.level,
  };
}

// easeOut(cubic) 보간, 정수
export function tweenNumber(from, to, t) {
  const u = Math.max(0, Math.min(1, Number(t) || 0));
  const e = 1 - (1 - u) ** 3;
  return Math.round(from + (to - from) * e);
}

// 카운트업. 요소가 화면에서 떨어지면(!isConnected) 멈춘다. 모션 꺼짐이면 즉시 끝값
export function animateCount(el, from, to, ms, { motion = true, raf = globalThis.requestAnimationFrame, now = () => performance.now(), fmt = (n) => String(n) } = {}) {
  if (!motion || typeof raf !== 'function') { el.textContent = fmt(to); return Promise.resolve(); }
  return new Promise((resolve) => {
    const t0 = now();
    const step = () => {
      if (!el.isConnected) return resolve();
      const t = (now() - t0) / Math.max(1, ms);
      el.textContent = fmt(tweenNumber(from, to, t));
      if (t >= 1) resolve(); else raf(step);
    };
    raf(step);
  });
}

// 막대 채우기(width 전이는 CSS). 모션 꺼짐이면 전이 없이 끝값
export function animateBar(fill, pct0, pct1, { motion = true, raf = globalThis.requestAnimationFrame, setTimeout: st = globalThis.setTimeout, ms = 600 } = {}) {
  fill.style.width = `${pct0}%`;
  if (!motion || typeof raf !== 'function') { fill.classList.add('nt'); fill.style.width = `${pct1}%`; return Promise.resolve(); }
  return new Promise((resolve) => { raf(() => { if (fill.isConnected) fill.style.width = `${pct1}%`; }); st(resolve, ms + 50); });
}
