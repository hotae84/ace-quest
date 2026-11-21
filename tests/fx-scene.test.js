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

test('allowedAttr: 대소문자 섞인 URL()·외부 참조도 거부', () => {
  ok(!allowedAttr('clip-path', 'URL(https://example.invalid/a.svg#x)'));
  ok(!allowedAttr('fill', 'Url( https://x )'));
  ok(allowedAttr('clip-path', 'url(#c)'));
});

test('crate: 개봉 상태는 키별로 기억되어 재렌더링 뒤 복원된다(순수 상태)', async () => {
  const { crateOpened, resetCrates } = await import('../js/fx/crate.js');
  resetCrates();
  ok(!crateOpened('r1:0'));
});

// ---- 요원 초상(공식 아이콘 WebP) ----
import { avatarUrl, IMAGE_NOTICE } from '../js/fx/avatar.js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('avatarUrl: 요원 id → assets/agents/<id>.webp, 이상한 id는 null(경로 조작 차단)', () => {
  eq(avatarUrl('jett'), 'assets/agents/jett.webp');
  eq(avatarUrl('kay-o2'), 'assets/agents/kay-o2.webp');
  eq([avatarUrl('../x'), avatarUrl('Jett'), avatarUrl(''), avatarUrl(null), avatarUrl('a b')], [null, null, null, null, null]);
});

test('IMAGE_NOTICE: 라이엇 저작권·비보증 고지 문구', () => {
  ok(IMAGE_NOTICE.includes('Riot Games') && IMAGE_NOTICE.includes('비상업'));
});

test('agents.json의 모든 요원에 초상 파일이 있고 sw PRECACHE에 들어 있다', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const agents = JSON.parse(readFileSync(`${root}data/agents.json`, 'utf8'));
  const sw = readFileSync(`${root}sw.js`, 'utf8');
  for (const a of agents) {
    const p = avatarUrl(a.id);
    ok(existsSync(`${root}${p}`), `${p} 파일`);
    ok(sw.includes(`'${p}'`), `${p} 프리캐시`);
  }
  ok(agents.length === 8);
});
