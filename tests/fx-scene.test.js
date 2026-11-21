import { test, eq, ok } from './harness.js';
import { FX } from '../js/fx/config.js';
import { hpOf, roundKills } from '../js/fx/target.js';
import { streakLabel, killcutDuration } from '../js/fx/killcut.js';
import { allowedTag, allowedAttr } from '../js/fx/svg.js';
import { once, resetOnce } from '../js/fx/once.js';
import { crateLabel } from '../js/fx/crate.js';

test('hpOf: HP = 5 − min(숙련도, 5), 바닥 0', () => {
  eq([hpOf(0), hpOf(1), hpOf(3), hpOf(5), hpOf(9)], [5, 4, 2, 0, 0]);
});

test('roundKills: 라운드 안에서 같은 표적을 맞힌 수(현재 문항 앞까지, 재도전 포함)', () => {
  const round = { q: [
    { c: 'c01', ok: true }, { c: 'c02', ok: false, retry: { ok: true } }, { c: 'c01', ok: null }, { c: 'c02', ok: true },
  ] };
  eq(roundKills(round, 'c01', 2), 1, '앞의 c01 정답 1');
  eq(roundKills(round, 'c01', 3), 1, '미응답은 세지 않음');
  eq(roundKills(round, 'c02', 4), 2, '재도전 정답도 센다');
  eq(roundKills(round, 'c02', 1), 0);
  eq(roundKills(null, 'c01', 0), 0);
});

test('streakLabel·killcutDuration: 더블·트리플·쿼드라, 연속이면 길어진다', () => {
  eq([streakLabel(1), streakLabel(2), streakLabel(3), streakLabel(4), streakLabel(5)], [null, '더블 킬', '트리플 킬', '쿼드라 킬', '5연속 킬']);
  eq(killcutDuration(1), FX.killcut);
  eq(killcutDuration(2), FX.streak);
});

test('allowedTag/allowedAttr: 검사 도구와 같은 허용 목록(런타임 재조립용)', () => {
  ok(allowedTag('g') && allowedTag('path') && allowedTag('use') && allowedTag('linearGradient'));
  ok(!allowedTag('script') && !allowedTag('style') && !allowedTag('foreignObject') && !allowedTag('image') && !allowedTag('text') && !allowedTag('a') && !allowedTag('filter'));
  ok(allowedAttr('d', 'M0 0h1') && allowedAttr('class', 'ac') && allowedAttr('fill', 'currentColor') && allowedAttr('fill', 'none') && allowedAttr('href', '#g') && allowedAttr('fill', 'url(#g)'));
  ok(!allowedAttr('style', 'fill:red') && !allowedAttr('onclick', 'x()') && !allowedAttr('href', 'https://x/y.svg') && !allowedAttr('fill', '#ff0000') && !allowedAttr('fill', 'url(https://x)'));
});

test('once: 같은 키는 한 번만 참(재렌더링에서 연출 중복 방지)', () => {
  resetOnce();
  ok(once('r1:0'));
  ok(!once('r1:0'));
  ok(once('r1:1'));
  resetOnce();
  ok(once('r1:0'));
});

test('crateLabel: 당첨은 +크레드, 아니면 꽝', () => {
  eq(crateLabel({ won: true, size: 1000 }), '+1,000');
  eq(crateLabel({ won: false, size: 1000 }), '꽝');
});
