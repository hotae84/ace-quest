import { test, eq, ok } from './harness.js';
import { FX } from '../js/fx/config.js';
import { motionEnabled, play } from '../js/fx/motion.js';
import { rankOf, RANKS } from '../js/fx/rank.js';
import { validateSvg } from '../../tools/validate-svg.mjs';

test('FX 상수(설계 v2 §4)', () => {
  eq([FX.killcut, FX.streak, FX.ace, FX.hit, FX.crate, FX.maxNodes, FX.maxShards], [600, 900, 3000, 400, 800, 60, 24]);
});

test('motionEnabled: 설정 off 또는 OS reduced-motion이면 false', () => {
  ok(motionEnabled({ motion: true }, { matches: false }));
  ok(!motionEnabled({ motion: false }, { matches: false }));
  ok(!motionEnabled({ motion: true }, { matches: true }));
  ok(motionEnabled({}, { matches: false }), '설정이 없으면 켜짐');
});

test('play: motion off면 대기 없이 이미 이행된 Promise, 클래스는 최종 상태', async () => {
  const el = { classList: { add() { this.added = (this.added || []).concat([...arguments]); }, remove() {} }, addEventListener() { throw new Error('motion off에서는 리스너를 달지 않는다'); } };
  let settled = false;
  const p = play(el, 'killcut', 600, { motion: false });
  p.then(() => { settled = true; });
  await Promise.resolve();
  ok(settled, '마이크로태스크 한 번에 이행');
  ok(el.classList.added.includes('fx-done'));
});

test('play: motion on이면 animationend 또는 timeout으로 끝난다', async () => {
  let handler = null;
  const el = { classList: { add() {}, remove() {} }, addEventListener(type, fn) { handler = fn; }, removeEventListener() {} };
  const p = play(el, 'hit', 50, { motion: true, setTimeout: (fn) => { setTimeout(fn, 5); } });
  handler?.({ target: el });
  await p;
  ok(true);
  const el2 = { classList: { add() {}, remove() {} }, addEventListener() {}, removeEventListener() {} };
  await play(el2, 'hit', 10, { motion: true });
  ok(true, 'timeout으로도 끝난다');
});

test('rankOf: 숙련도 합산 경계(5단계)', () => {
  eq(RANKS.map((r) => r.name), ['신병', '대원', '정예', '베테랑', '에이스']);
  eq(rankOf(0).name, '신병');
  eq(rankOf(RANKS[1].min).name, '대원');
  eq(rankOf(RANKS[1].min - 1).name, '신병');
  eq(rankOf(RANKS[4].min).level, 5);
  eq(rankOf(10 ** 6).name, '에이스');
});

const GOOD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><g class="ac"><path d="M0 0h10v10H0z" fill="currentColor"/><circle cx="5" cy="5" r="2" class="ac2"/></g></svg>';
test('validateSvg: 정상 SVG 통과', () => eq(validateSvg(GOOD).errors, []));
for (const [name, bad] of [
  ['script', GOOD.replace('</svg>', '<script>1</script></svg>')],
  ['style 요소', GOOD.replace('</svg>', '<style>.a{}</style></svg>')],
  ['foreignObject', GOOD.replace('</svg>', '<foreignObject/></svg>')],
  ['image', GOOD.replace('</svg>', '<image href="x.png"/></svg>')],
  ['a', GOOD.replace('</svg>', '<a href="#x"><rect/></a></svg>')],
  ['filter', GOOD.replace('</svg>', '<filter id="f"/></svg>')],
  ['text', GOOD.replace('</svg>', '<text>hi</text></svg>')],
  ['style 속성', GOOD.replace('<circle ', '<circle style="fill:red" ')],
  ['on* 속성', GOOD.replace('<circle ', '<circle onclick="x()" ')],
  ['외부 href', GOOD.replace('</svg>', '<use href="https://x/y.svg#a"/></svg>')],
  ['외부 url()', GOOD.replace('fill="currentColor"', 'fill="url(https://x/p)"')],
  ['고정 색', GOOD.replace('fill="currentColor"', 'fill="#ff0000"')],
  ['viewBox 없음', GOOD.replace(' viewBox="0 0 256 256"', '')],
]) test(`validateSvg: ${name} 거부`, () => ok(validateSvg(bad).errors.length > 0, name));
test('validateSvg: 용량·노드 상한', () => {
  const big = GOOD.replace('<g class="ac">', '<g class="ac">' + '<rect width="1" height="1"/>'.repeat(70));
  ok(validateSvg(big, { maxBytes: 8192, maxNodes: 60 }).errors.some((e) => e.includes('노드')));
  const fat = GOOD.replace('<g class="ac">', '<g class="ac"><!--' + 'x'.repeat(9000) + '-->');
  ok(validateSvg(fat, { maxBytes: 8192 }).errors.some((e) => e.includes('용량')));
});
test('validateSvg: 내부 참조(#id)와 currentColor·클래스·none은 허용', () => {
  const ok1 = GOOD.replace('</svg>', '<defs><linearGradient id="g"><stop offset="0" stop-color="currentColor"/></linearGradient></defs><use href="#g"/><rect fill="none" stroke="currentColor"/></svg>');
  eq(validateSvg(ok1).errors, []);
});
test('validateSvg: 대소문자 URL()·자기 참조 use 거부', () => {
  ok(validateSvg(GOOD.replace('fill="currentColor"', 'fill="URL(https://x/p)"')).errors.length > 0, 'URL() 대문자');
  const loop = GOOD.replace('</svg>', '<g id="loop"><use href="#loop"/></g></svg>');
  ok(validateSvg(loop).errors.some((e) => e.includes('use')), '자기 참조 use');
});
test('validateSvg: 직접 자기 참조 use 거부', () => {
  ok(validateSvg(GOOD.replace('</svg>', '<use id="loop" href="#loop"/></svg>')).errors.some((e) => e.includes('use')));
});
