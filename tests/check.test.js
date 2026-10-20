import { test, eq, ok } from './harness.js';
import { buildIndex } from '../js/content.js';
import { exhaustiveCheck } from '../js/check.js';
import { zones, cards, clone } from './fixture.js';

test('exhaustiveCheck: 정상 fixture는 오류 없음, 생성 수를 센다', () => {
  const r = exhaustiveCheck(buildIndex({ zones, cards }), { seeds: 10 });
  eq(r.errors, []);
  ok(r.generated > 0);
});

test('exhaustiveCheck: 정답이 오답에도 있으면 잡는다', () => {
  const cs = clone(cards);
  cs[1].true[0] = cs[0].true[0] + ' '; // c0102의 진술이 c0101 정답과 공백만 다름 → 정규화 비교로 잡힘
  const r = exhaustiveCheck(buildIndex({ zones, cards: cs }), { seeds: 10 });
  ok(r.errors.some((e) => e.includes('c0101') && (e.includes('오답') || e.includes('중복'))), r.errors.slice(0, 3).join('\n'));
});
