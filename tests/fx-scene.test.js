import { test, eq, ok } from './harness.js';
import { FX } from '../js/fx/config.js';
import { hpOf, roundKills } from '../js/fx/target.js';
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
import { readFileSync, existsSync, statSync } from 'node:fs';
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

// ---- 0.3.0: 전신·능력 아이콘 ----
import { fullUrl, abilityUrl, ABILITY_SLOTS } from '../js/fx/avatar.js';

test('fullUrl/abilityUrl: 검증된 id·slot만 경로로, 아니면 null', () => {
  eq(fullUrl('jett'), 'assets/agents/jett-full.webp');
  eq(abilityUrl('sova', 'grenade'), 'assets/abilities/sova-grenade.webp');
  eq(ABILITY_SLOTS, ['ability1', 'ability2', 'grenade', 'ultimate']);
  eq([fullUrl('../x'), fullUrl(''), abilityUrl('sova', 'passive'), abilityUrl('Sova', 'ability1'), abilityUrl('sova', '../a')], [null, null, null, null, null]);
});

test('agents.json: 요원마다 abilities 4개(slot 순서 고정), 전신·능력 파일 존재·sw 프리캐시 포함', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const agents = JSON.parse(readFileSync(`${root}data/agents.json`, 'utf8'));
  const sw = readFileSync(`${root}sw.js`, 'utf8');
  let bytes = 0;
  for (const a of agents) {
    eq(a.abilities.map((x) => x.slot), ABILITY_SLOTS, `${a.id} slot 순서`);
    ok(a.abilities.every((x) => typeof x.name === 'string' && x.name.length > 0), `${a.id} 능력 이름`);
    for (const p of [fullUrl(a.id), ...a.abilities.map((x) => abilityUrl(a.id, x.slot))]) {
      ok(existsSync(`${root}${p}`), `${p} 파일`);
      ok(sw.includes(`'${p}'`), `${p} 프리캐시`);
      bytes += statSync(`${root}${p}`).size;
    }
  }
  ok(bytes <= 700 * 1024, `전신+능력 합계 ${bytes}B ≤ 700KB`);
  ok(sw.includes("APP_VERSION = '0.3.0'"), 'sw 0.3.0');
});

test('sw 프리캐시: 0.3.0 신규 모듈·CSS 포함', () => {
  const sw = readFileSync(fileURLToPath(new URL('../sw.js', import.meta.url)), 'utf8');
  for (const p of ['js/fx/score.js', 'js/fx/avatar.js', 'js/fx/killcut.js', 'css/killcut.css']) ok(sw.includes(`'${p}'`), `${p} 프리캐시`);
  ok(!sw.includes('emblem-') && !sw.includes('killcut-basic'), '삭제된 SVG는 프리캐시에 없음');
});
