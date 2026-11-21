import { test, eq, ok } from './harness.js';
import { readFileSync } from 'node:fs';
import { importHistoryQuest } from '../../tools/import-history-quest.mjs';

const world = (n) => JSON.parse(readFileSync(new URL(`../../../app/data/world-${n}.json`, import.meta.url), 'utf8'));

test('importHistoryQuest: 월드4 → F4, 개념 12·문항 25, 보스 무시', () => {
  const f = importHistoryQuest(world(4), 'F4');
  eq(f.zone, 'F4');
  eq(f.concepts.length, 12);
  eq(f.concepts.reduce((s, c) => s + c.questions.length, 0), 25);
  eq(f.concepts.map((c) => c.id), Array.from({ length: 12 }, (_, i) => `fx04${String(i + 1).padStart(2, '0')}`));
  eq(f.concepts[0].name, '아편 전쟁과 중국의 개항');
  ok(f.concepts.every((c) => c.ref && c.name && c.zone === 'F4'));
});

test('importHistoryQuest: 문항 본문·fixedOrder·items·pairs 보존, id 중복 없음', () => {
  const f = importHistoryQuest(world(4), 'F4');
  const all = f.concepts.flatMap((c) => c.questions);
  const orig = world(4).stages.flatMap((s) => s.questions || []);
  eq(all.length, orig.length);
  for (const q of orig) {
    const got = all.find((x) => x.id === q.id);
    eq(got, q, q.id);
  }
  eq(new Set(all.map((q) => q.id)).size, all.length);
  ok(orig.some((q) => q.fixedOrder) ? all.some((q) => q.fixedOrder) : true);
});

test('importHistoryQuest: 네 월드 합계 100, 월드 번호가 zone·개념 id에 반영', () => {
  let n = 0;
  for (const [w, z] of [[1, 'F1'], [2, 'F2'], [3, 'F3'], [4, 'F4']]) {
    const f = importHistoryQuest(world(w), z);
    n += f.concepts.reduce((s, c) => s + c.questions.length, 0);
    ok(f.concepts.every((c) => c.id.startsWith(`fx0${w}`)));
  }
  eq(n, 100);
});
