import { test, eq, ok } from './harness.js';
import { readFileSync } from 'node:fs';
import { buildIndex } from '../js/content.js';
import { buildFixedIndex } from '../js/fixed.js';
import { Store } from '../js/store.js';
import { createApp } from '../js/app.js';
import { toLine, chain } from '../js/records.js';
import { newRound, attachQuestion, answer, finishRound } from '../js/game.js';
import { cards } from './fixture.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/fixed-${n}.json`, import.meta.url), 'utf8'));
const realZones = JSON.parse(readFileSync(new URL('../data/zones.json', import.meta.url), 'utf8'));
const fixedIndex = buildFixedIndex([load('f1'), load('f2'), load('f3'), load('f4')]);
const index = buildIndex({ zones: realZones, cards });
const agents = [{ id: 'jett', name: '제트', color: '#fff', line: '' }];
function fakeStorage() { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; }
function make({ storage = fakeStorage(), player = 'p1', settings = {} } = {}) {
  const store = new Store(storage);
  store.setSettings({ playerId: player, nick: 'n', agent: 'jett', ...settings });
  const app = createApp({ index, fixedIndex, store, repo: null, agents, ticketRng: () => 0, seed: (() => { let s = 1; return () => s++; })(), now: () => '2026-11-25T10:00:00+09:00' });
  return { app, store, storage };
}
const wrongFor = (q) => (q.form === 'order' || q.form === 'match' ? q.answer.slice().reverse() : [(q.answer + 1) % q.options.length]);
const FORMS = ['mcq-fixed', 'blank', 'ox', 'order', 'match'];

test('startRound(F4): 5문제 전부 fixed, 변환 form, 표적 이름·힌트 제공', async () => {
  const { app } = make();
  await app.boot();
  ok(await app.startRound('F4', 'normal'));
  eq(app.state.round.q.length, 5);
  ok(app.state.round.q.every((q) => q.f === 'fixed' && q.fq));
  ok(FORMS.includes(app.state.question.form));
  eq(app.state.question.fq, app.state.round.q[0].fq);
  const t = app.currentTarget();
  ok(t.name && t.hint.includes(t.name));
});

test('고정 문항 오답 → 재도전은 같은 개념 다른 문항(있으면), fq가 기록된다', async () => {
  const { app } = make();
  await app.boot();
  await app.startRound('F4', 'normal');
  const slot = app.state.round.q[0];
  const concept = fixedIndex.concepts.get(slot.c);
  await app.submit(wrongFor(app.state.question));
  ok(app.offerRetry());
  await app.startRetry();
  const r = app.state.round.q[0].retry;
  ok(r.fq, '재도전 fq');
  if (concept.questions.length >= 2) { ok(r.fq !== slot.fq); eq(app.state.retrySame, false); } else { eq(r.fq, slot.fq); eq(app.state.retrySame, true); }
  eq(app.state.retryQuestion.fq, r.fq);
});

test('seen: 재부팅 뒤에도 노출된 fq가 유지되고 qh:null 문항은 제외', async () => {
  const { app, storage } = make();
  await app.boot();
  await app.startRound('F4', 'normal');
  const shown = app.state.round.q[0].fq;
  const notShown = app.state.round.q[1].fq;
  const again = make({ storage });
  await again.app.boot();
  const seen = again.app.seenNow();
  eq(seen.get(shown), 1); eq(seen.get(notShown), undefined);
});

test('seen: 원격 캐시의 fixed 기록이 복원되어 뽑기에 반영되고, 확정 라운드가 round 저장과 큐에 함께 있어도 한 번만 센다', async () => {
  const { app, store, storage } = make();
  // F4의 fx0401 문항 전부를 본 기록을 캐시에 넣는다
  const concept = fixedIndex.concepts.get('fx0401');
  let r = newRound({ mode: 'normal', zone: 'F4', cv: 'x', gv: '2', q: concept.questions.map((q, i) => ({ c: 'fx0401', x: [], f: 'fixed', s: i + 1, fq: q.id })) }, { id: 'cached', player: 'p1', agent: 'jett', startedAt: '2026-11-24T10:00:00+09:00' });
  for (let i = 0; i < r.q.length; i++) { r = attachQuestion(r, i, { qh: 'h', oh: ['x'] }); r = answer(r, i, [0], { form: 'ox', options: [{ text: 'O' }, { text: 'X' }], answer: 0 }); }
  const fin = finishRound(r, { endedAt: '2026-11-24T10:03:00+09:00', rng: () => 0 });
  const [line] = await chain([toLine(fin)]);
  store.setCache({ player: 'p1', lines: [line], redemptions: [], fetchedAt: null });
  store.setQueue([toLine(fin)]);      // 같은 id가 큐에도
  store.setRound(fin);                 // 확정 라운드가 저장에도
  await app.boot();
  for (const q of concept.questions) eq(app.seenNow().get(q.id), 1, q.id);
});

test('showArchive가 꺼져도 archive 지역은 직접 출격 가능하지만 전체 출격 후보에는 없다', async () => {
  const { app } = make();
  await app.boot();
  ok(await app.startRound('F1', 'normal'));
  ok(app.state.round.q.every((q) => fixedIndex.concepts.get(q.c).zone === 'F1'));
  for (let i = 0; i < 20; i++) {
    await app.startRound(null, 'normal');
    for (const q of app.state.round.q) {
      const zone = q.f === 'fixed' ? fixedIndex.concepts.get(q.c).zone : index.cards.get(q.c).zone;
      ok(['F4', 'Z1'].includes(zone), zone);
    }
  }
});

test('bonusAvailable(F4): 전 개념 숙련도 ≥2면 열린다', async () => {
  const { app } = make();
  await app.boot();
  ok(!app.bonusAvailable('F4'));
  for (const c of fixedIndex.byZone.get('F4')) app.state.derived.mastery.set(c.id, 2);
  ok(app.bonusAvailable('F4'));
  ok(await app.startRound('F4', 'bonus'));
  eq(app.state.round.q.length, 8);
});

test('0.1.0 형식 큐(fq 없음)를 읽어도 부팅·집계가 된다', async () => {
  const { app, store } = make();
  const old = { v: 1, id: 'old', player: 'p1', agent: 'jett', zone: 'Z1', mode: 'normal', startedAt: 's', endedAt: 'e', finished: true, cv: '2026-10-21.4', gv: '1',
    q: [{ c: 'c0101', x: [], f: 'ox', s: 1, qh: 'h', oh: ['a', 'b'], a: [0], ok: true, hint: false, boost: false, retry: null }], streakMax: 1, ace: false, tickets: [{ kind: 'q', i: 0, p: 0.25, won: true, size: 50 }], creds: 50 };
  store.setQueue([old]);
  await app.boot();
  eq(app.state.derived.earned, 50);
  eq(app.state.derived.mastery.get('c0101'), 1);
});

test('설정 기본값: motion true, showArchive false', () => {
  const s = new Store(fakeStorage()).getSettings();
  eq(s.motion, true); eq(s.showArchive, false);
});
