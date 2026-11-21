import { test, eq, ok } from './harness.js';
import { scoreView, tweenNumber, animateCount } from '../js/fx/score.js';
import { crateRevealed, resetCrates } from '../js/fx/crate.js';

test('scoreView: 전/후 잔액·막대·환전선·승급(저장 성공, 끝낸 라운드)', () => {
  const v = scoreView({ balanceAfter: 1000, creds: 250, threshold: 1000, finished: true, masteryTotalAfter: 16, killsThisRound: 3 });
  eq([v.before, v.after, v.creds, v.pct0, v.pct1, v.remaining, v.crossed], [750, 1000, 250, 75, 100, 0, true]);
  eq([v.rankBefore.name, v.rankAfter.name, v.rankUp], ['신병', '대원', true]);
  const w = scoreView({ balanceAfter: 900, creds: 250, threshold: 1000, finished: true, masteryTotalAfter: 10, killsThisRound: 3 });
  eq([w.crossed, w.remaining, w.rankUp, w.pct1], [false, 100, false, 90]);
});

test('scoreView: 경계 — 정확히 도달, 이탈 라운드, 저장 실패 보류, 상한 100%', () => {
  eq(scoreView({ balanceAfter: 1000, creds: 1000, threshold: 1000, finished: true, masteryTotalAfter: 5, killsThisRound: 5 }).crossed, true, 'after == threshold');
  const a = scoreView({ balanceAfter: 500, creds: 0, threshold: 1000, finished: false, masteryTotalAfter: 7, killsThisRound: 2 });
  eq([a.before, a.after, a.creds, a.crossed, a.rankBefore.name], [500, 500, 0, false, '신병'], '이탈: 크레드 0, 숙련도는 차감');
  const p = scoreView({ balanceAfter: 750, creds: 250, threshold: 1000, finished: true, masteryTotalAfter: 3, killsThisRound: 3, pending: true });
  eq(p, { pending: true }, '저장 실패 중엔 수치 없음');
  eq(scoreView({ balanceAfter: 2600, creds: 100, threshold: 1000, finished: true, masteryTotalAfter: 0, killsThisRound: 0 }).pct1, 100);
  eq(scoreView({ balanceAfter: 2600, creds: 100, threshold: 1000, finished: true, masteryTotalAfter: 0, killsThisRound: 0 }).crossed, false, '이미 넘어 있었으면 돌파 아님');
});

test('tweenNumber: easeOut, 양 끝 고정, 정수', () => {
  eq(tweenNumber(0, 100, 0), 0); eq(tweenNumber(0, 100, 1), 100); eq(tweenNumber(0, 100, 2), 100);
  ok(tweenNumber(0, 100, .5) > 50 && tweenNumber(0, 100, .5) < 100);
  ok(Number.isInteger(tweenNumber(0, 333, .37)));
  eq(tweenNumber(750, 1000, .5) > 875, true);
});

test('animateCount: 가짜 rAF로 끝값 도달, 분리된 요소면 중단, 모션 꺼짐이면 즉시', async () => {
  const q = []; const raf = (fn) => q.push(fn);
  let t = 0; const now = () => t;
  const el = { textContent: '', isConnected: true };
  const done = animateCount(el, 0, 100, 100, { motion: true, raf, now });
  while (q.length) { t += 25; q.shift()(); }
  await done; eq(el.textContent, '100');
  const el2 = { textContent: '', isConnected: true };
  const d2 = animateCount(el2, 0, 100, 100, { motion: true, raf, now: () => 0 });
  el2.isConnected = false; q.shift()(); await d2; ok(el2.textContent !== '100', '분리되면 멈춤');
  const el3 = { textContent: '', isConnected: true };
  await animateCount(el3, 0, 42, 100, { motion: false, raf, now, fmt: (n) => `+${n}` }); eq(el3.textContent, '+42');
});

test('crateRevealed: 공개 완료 전에는 거짓(개봉 시작과 구분)', () => {
  resetCrates();
  eq(crateRevealed('r1:0'), false);
});
