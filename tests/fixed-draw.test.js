import { test, eq, ok } from './harness.js';
import { readFileSync } from 'node:fs';
import { makeRng } from '../js/rng.js';
import { buildIndex, targetsOf } from '../js/content.js';
import { buildFixedIndex, innerType } from '../js/fixed.js';
import { drawRound, drawRetry, pickFixedQuestion, seenInRound } from '../js/draw.js';
import { newRound, answer, startRetry, attachQuestion, bonusOpen } from '../js/game.js';
import { toLine, deriveState, checkRules, merge, chain } from '../js/records.js';
import { summarize } from '../js/admin-core.js';
import { generate } from '../js/questions/index.js';
import { zones as fxZones, cards as fxCards } from './fixture.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/fixed-${n}.json`, import.meta.url), 'utf8'));
const realZones = JSON.parse(readFileSync(new URL('../data/zones.json', import.meta.url), 'utf8'));
const fixedIndex = buildFixedIndex([load('f1'), load('f2'), load('f3'), load('f4')]);
// 카드 fixture(Z1)를 실제 지역 메타와 합친 색인
const index = buildIndex({ zones: realZones, cards: fxCards });
const OX = { form: 'ox', options: [{ text: 'O' }, { text: 'X' }], answer: 0 };
const T0 = '2026-11-25T10:00:00+09:00';
const plan = (q) => ({ mode: 'normal', zone: 'F4', cv: 'x', gv: '2', q });
const seenOf = (list) => new Map(list.map(([k, v]) => [k, v]));
const isMcqType = (t) => t === 'mcq' || t === 'blank';

test('targetsOf: F4는 개념 12, Z1은 카드 6, 모르는 지역은 []', () => {
  const f4 = targetsOf('F4', { index, fixedIndex });
  eq(f4.length, 12); eq(f4[0].kind, 'concept'); eq(f4[0].id, 'fx0401'); eq(f4[0].zone, 'F4');
  const z1 = targetsOf('Z1', { index, fixedIndex });
  eq(z1.length, 6); eq(z1[0].kind, 'card');
  eq(targetsOf('ZZ', { index, fixedIndex }), []);
});

test('newRound·startRetry·toLine이 fq를 복사한다(원 시도·재도전 각각)', () => {
  let r = newRound(plan([{ c: 'fx0401', x: [], f: 'fixed', s: 1, fq: 'q0401' }]), { id: 'r', player: 'p1', agent: 'jett', startedAt: T0 });
  eq(r.q[0].fq, 'q0401');
  r = answer(r, 0, [1], OX);
  r = startRetry(r, 0, { f: 'fixed', s: 2, x: [], fq: 'q0402' });
  eq(r.q[0].retry.fq, 'q0402');
  const line = toLine({ ...r, endedAt: T0, finished: false, tickets: [], creds: 0, ace: false });
  eq(line.q[0].fq, 'q0401'); eq(line.q[0].retry.fq, 'q0402');
  ok(Object.keys(line.q[0]).includes('fq'));
  const cardLine = toLine(newRound({ mode: 'normal', zone: 'Z1', cv: 'x', gv: '2', q: [{ c: 'c0101', x: [], f: 'ox', s: 1 }] }, { id: 'r2', player: 'p1', agent: 'jett', startedAt: T0 }));
  eq(cardLine.q[0].fq, null);
});

test('deriveState.seenFq: qh가 있는 원 시도·재도전만, 이탈 줄 포함, 같은 id 중복 1회', async () => {
  let r = newRound(plan([{ c: 'fx0401', x: [], f: 'fixed', s: 1, fq: 'q0401' }, { c: 'fx0402', x: [], f: 'fixed', s: 2, fq: 'q0404' }]), { id: 'a', player: 'p1', agent: 'jett', startedAt: T0 });
  r = attachQuestion(r, 0, { qh: 'h', oh: ['x'] });
  r = answer(r, 0, [1], OX);
  r = startRetry(r, 0, { f: 'fixed', s: 3, x: [], fq: 'q0402' });
  r = attachQuestion(r, 0, { qh: 'h2', oh: ['y'] }, { retry: true });
  const line = toLine({ ...r, endedAt: T0, finished: false, tickets: [], creds: 0, ace: false }); // q[1]은 qh null
  const s = deriveState(merge([line], [line]).lines);
  eq(s.seenFq.get('q0401'), 1); eq(s.seenFq.get('q0402'), 1); eq(s.seenFq.get('q0404'), undefined);
});

test('seenInRound: 진행 중 라운드의 노출 fq', () => {
  let r = newRound(plan([{ c: 'fx0401', x: [], f: 'fixed', s: 1, fq: 'q0401' }, { c: 'fx0402', x: [], f: 'fixed', s: 2, fq: 'q0404' }]), { id: 'a', player: 'p1', agent: 'jett', startedAt: T0 });
  r = attachQuestion(r, 0, { qh: 'h', oh: ['x'] });
  eq([...seenInRound(r).keys()], ['q0401']);
});

test('pickFixedQuestion: 미출제 우선 → 동률은 seed → 전부 본 경우 최소 횟수, exclude 존중', () => {
  const concept = fixedIndex.concepts.get('fx0401'); // 문항 2~3개
  const ids = concept.questions.map((q) => q.id);
  const seen = seenOf([[ids[0], 2], [ids[1], 0]]);
  eq(pickFixedQuestion({ concept, seen, rng: makeRng(1) }), ids[1]);
  const allSeen = seenOf(ids.map((id, i) => [id, i === 1 ? 1 : 3]));
  eq(pickFixedQuestion({ concept, seen: allSeen, rng: makeRng(1) }), ids[1]);
  const picked = new Set();
  for (let s = 1; s <= 30; s++) picked.add(pickFixedQuestion({ concept, seen: new Map(), rng: makeRng(s) }));
  ok(picked.size > 1, '동률이면 seed에 따라 달라진다');
  const ex = pickFixedQuestion({ concept, seen: new Map(), rng: makeRng(1), exclude: ids[0] });
  ok(ex !== ids[0]);
});

test('drawRound(F4): 5문제 전부 fixed, 개념 중복 없음, fq는 그 개념 소속, 선다형 ≥3·부정형 ≤1', () => {
  for (let s = 1; s <= 40; s++) {
    const p = drawRound({ index, fixedIndex, zone: 'F4', mode: 'normal', rng: makeRng(s), cv: 'x', gv: '2' });
    eq(p.q.length, 5);
    ok(p.q.every((q) => q.f === 'fixed' && q.x.length === 0 && fixedIndex.questionById.get(q.fq).concept.id === q.c), `seed ${s}`);
    eq(new Set(p.q.map((q) => q.c)).size, 5);
    const types = p.q.map((q) => innerType(fixedIndex, q.fq));
    ok(types.filter(isMcqType).length >= 3, `seed ${s} 선다형 ${types}`);
    ok(p.q.filter((q) => /옳지 않은|아닌|틀린/.test(fixedIndex.questionById.get(q.fq).question.q)).length <= 1, `seed ${s} 부정형`);
  }
  const b = drawRound({ index, fixedIndex, zone: 'F4', mode: 'bonus', rng: makeRng(3), cv: 'x', gv: '2' });
  eq(b.q.length, 8);
  ok(b.q.map((q) => innerType(fixedIndex, q.fq)).filter(isMcqType).length >= 5);
});

test('drawRound: 유형 할당이 미출제보다 먼저(본 mcq vs 안 본 ox), 충족 불가 지역은 예외 없이 진행', () => {
  const synth = buildFixedIndex([{ zone: 'FX', concepts: [{ id: 'fx9901', name: '합성', ref: '1', questions: [
    { id: 'qa', concept: '합성', type: 'mcq', ref: '1', q: '?', choices: ['a', 'b', 'c', 'd'], answer: 0, explain: '' },
    { id: 'qb', concept: '합성', type: 'ox', ref: '1', q: '?', answer: true, explain: '' }] }] }]);
  const ix = buildIndex({ zones: { ...realZones, zones: [...realZones.zones, { id: 'FX', label: 'X', title: 'x', pages: '1~2', group: 'exam', source: 'fixed' }] }, cards: fxCards });
  const p = drawRound({ index: ix, fixedIndex: synth, zone: 'FX', mode: 'normal', seen: seenOf([['qa', 1]]), rng: makeRng(1), cv: 'x', gv: '2' });
  eq(p.q.length, 1); eq(p.q[0].fq, 'qa', '선다형 할당이 미출제(ox)보다 먼저');
  const onlyOx = buildFixedIndex([{ zone: 'FY', concepts: [{ id: 'fx9902', name: 'ox만', ref: '1', questions: [{ id: 'qc', concept: 'ox만', type: 'ox', ref: '1', q: '?', answer: false, explain: '' }] }] }]);
  const iy = buildIndex({ zones: { ...realZones, zones: [...realZones.zones, { id: 'FY', label: 'Y', title: 'y', pages: '1~2', group: 'exam', source: 'fixed' }] }, cards: fxCards });
  const py = drawRound({ index: iy, fixedIndex: onlyOx, zone: 'FY', mode: 'normal', rng: makeRng(1), cv: 'x', gv: '2' });
  eq(py.q.length, 1); eq(py.q[0].fq, 'qc');
});

test('drawRound(zone null)은 exam 지역만 섞는다(archive 제외), 카드와 개념 혼합', () => {
  const zonesHit = new Set();
  for (let s = 1; s <= 60; s++) {
    const p = drawRound({ index, fixedIndex, zone: null, mode: 'normal', rng: makeRng(s), cv: 'x', gv: '2' });
    for (const q of p.q) zonesHit.add(q.c.startsWith('fx') ? fixedIndex.concepts.get(q.c).zone : index.cards.get(q.c).zone);
  }
  ok(zonesHit.has('F4') && zonesHit.has('Z1'), [...zonesHit].join());
  ok(!zonesHit.has('F1') && !zonesHit.has('F2') && !zonesHit.has('F3'), 'archive 제외');
});

test('bonusOpen(targetsOf F4): 전 개념 숙련도 ≥2면 개방', () => {
  const targets = targetsOf('F4', { index, fixedIndex });
  const mastery = new Map(targets.map((t) => [t.id, 2]));
  eq(bonusOpen(targets, mastery, 0).open, true);
  mastery.set('fx0405', 1);
  eq(bonusOpen(targets, mastery, 0).open, false);
});

test('drawRetry(fixed): 같은 개념 다른 문항 우선, 하나뿐이면 same:true', () => {
  const concept = fixedIndex.concepts.get('fx0401');
  const first = concept.questions[0];
  const prev = generate({ form: 'fixed', fixed: first, seed: 1 });
  const r = drawRetry({ concept, fixedIndex, index, prev, prevPlan: { c: concept.id, f: 'fixed', s: 1, x: [], fq: first.id }, seen: new Map(), rng: makeRng(2) });
  eq(r.f, 'fixed'); ok(r.fq !== first.id); eq(r.same, false); eq(r.x, []);
  const single = { id: 'fxS', name: 's', zone: 'F4', ref: '1', questions: [first] };
  const r2 = drawRetry({ concept: single, fixedIndex, index, prev, prevPlan: { c: 'fxS', f: 'fixed', s: 1, x: [], fq: first.id }, seen: new Map(), rng: makeRng(2) });
  eq(r2.fq, first.id); eq(r2.same, true); ok(r2.s !== 1);
});

function fixedLine({ fq = 'q0401', c = 'fx0401', retryFq = undefined, finished = true } = {}) {
  let r = newRound(plan([{ c, x: [], f: 'fixed', s: 1, fq }]), { id: 'L', player: 'p1', agent: 'jett', startedAt: T0 });
  r = attachQuestion(r, 0, { qh: 'h', oh: ['x'] });
  if (retryFq !== undefined) { r = answer(r, 0, [1], OX); r = startRetry(r, 0, { f: 'fixed', s: 2, x: [], fq: retryFq }); r = { ...r, q: r.q.map((q) => ({ ...q, retry: { ...q.retry, a: [0], ok: true } })) }; }
  else r = answer(r, 0, [0], OX);
  const base = { ...r, endedAt: '2026-11-25T10:03:00+09:00', finished, tickets: [], creds: 0, ace: false };
  return toLine(base);
}

test('checkRules: fixed의 fq 누락·불일치·미검증·이탈 줄·구기록', () => {
  const concepts = fixedIndex.concepts;
  const bad = fixedLine(); delete bad.q[0].fq;
  ok(checkRules(bad).includes('fq-invalid'), '색인 없이도 누락 검출');
  ok(checkRules(fixedLine({ fq: 'q0404' }), undefined, { concepts }).includes('fq-invalid'), '개념 불일치');
  ok(checkRules(fixedLine(), undefined, { concepts }).every((c) => !c.startsWith('fq')), '정상');
  ok(checkRules(fixedLine()).includes('fq-unverified'), '색인 없으면 미검증 표시');
  ok(checkRules(fixedLine({ retryFq: 'q0404' }), undefined, { concepts }).includes('fq-invalid'), '재도전도 검사');
  const ab = fixedLine({ finished: false }); delete ab.q[0].fq;
  ok(checkRules(ab).includes('fq-invalid'), '이탈 줄도 검사');
  const old = toLine(newRound({ mode: 'normal', zone: 'Z1', cv: 'x', gv: '1', q: [{ c: 'c0101', x: [], f: 'ox', s: 1 }] }, { id: 'o', player: 'p1', agent: 'jett', startedAt: T0 }));
  delete old.q[0].fq;
  ok(!checkRules({ ...old, finished: false, tickets: [], creds: 0 }).some((c) => c.startsWith('fq')), '구기록 통과');
});

test('summarize에 concepts를 넘기면 fq-invalid가 anomaly로 나온다', async () => {
  const lines = await chain([fixedLine({ fq: 'q0404' })]);
  const s = await summarize([{ id: 'p1', nick: 'n' }], { p1: lines }, {}, { concepts: fixedIndex.concepts });
  ok(s.players[0].anomalies.some((a) => a.code === 'fq-invalid'));
});
