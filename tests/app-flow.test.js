import { test, eq, ok } from './harness.js';
import { buildIndex } from '../js/content.js';
import { Store } from '../js/store.js';
import { createApp } from '../js/app.js';
import { zones, cards } from './fixture.js';

const index = buildIndex({ zones, cards });
const agents = [{ id: 'jett', name: '제트', color: '#fff', line: '' }];
function fakeStorage() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
function make({ storage = fakeStorage(), index: ix = index, failQueue = false } = {}) {
  const store = new Store(storage);
  if (failQueue) store.setQueue = () => ({ ok: false });
  store.setSettings({ playerId: 'p1', nick: '테스터', agent: 'jett' });
  const app = createApp({ index: ix, store, repo: null, agents, ticketRng: () => 0, seed: (() => { let s = 1; return () => s++; })(), now: () => '2026-10-25T10:00:00+09:00' });
  return { app, store, storage };
}
const correct = (app) => [app.state.question.answer].flat();
const wrong = (app) => (app.state.question.form === 'ox' ? [1 - app.state.question.answer] : [(app.state.question.answer + 1) % 2]);

test('startRound: 5문제·문제 생성·battle 뷰', async () => {
  const { app } = make();
  await app.boot();
  await app.startRound('Z1', 'normal');
  eq(app.state.round.q.length, 5);
  ok(app.state.question && app.state.question.form === app.state.round.q[0].f);
  eq(app.state.view, 'battle');
  ok(app.state.round.q[0].qh && app.state.round.q[0].oh.length > 0, '해시가 붙어 있다');
});

test('submit 정답 → verdict, streak 1; 오답 → offerRetry', async () => {
  const { app } = make();
  await app.boot();
  await app.startRound('Z1', 'normal');
  await app.submit(correct(app));
  eq(app.state.view, 'verdict'); eq(app.state.round.streak, 1);
  await app.next();
  eq(app.state.round.idx, 1);
  const q = app.state.question;
  const bad = q.form === 'order' || q.form === 'match' ? q.answer.slice().reverse() : wrong(app);
  await app.submit(bad);
  ok(app.state.round.q[1].ok === false);
  ok(app.offerRetry());
  await app.startRetry();
  ok(app.state.inRetry && app.state.retryQuestion);
  await app.submitRetry([app.state.retryQuestion.answer].flat());
  ok(app.state.round.q[1].retry.ok === true);
});

async function playAll(app) {
  while (app.state.round && app.state.round.finished === null) {
    const q = app.state.question;
    await app.submit([q.answer].flat());
    await app.next();
  }
}

test('finish → 큐 1, round null, earned 반영; 두 번 finish해도 큐 1', async () => {
  const { app, store } = make();
  await app.boot();
  await app.startRound('Z1', 'normal');
  await playAll(app);
  eq(app.state.view, 'result');
  eq(store.getQueue().length, 1);
  eq(app.state.round, null);
  eq(app.state.derived.earned, 50 * 5 + 100);
  const body1 = store.getQueue()[0];
  await app.finish();
  eq(store.getQueue().length, 1);
  eq(store.getQueue()[0], body1);
});

test('setQueue 실패면 라운드가 남고 큐는 비어 있음 → 재시작 시 복구되어 큐 1', async () => {
  const { app, store, storage } = make({ failQueue: true });
  await app.boot();
  await app.startRound('Z1', 'normal');
  await playAll(app);
  ok(store.getRound() && store.getRound().finished === true, '확정 라운드가 남아 있다');
  eq(storage.m.has('aq.queue') ? JSON.parse(storage.m.get('aq.queue')).length : 0, 0);
  ok(app.state.saveError);
  const again = make({ storage });
  await again.app.boot();
  eq(again.store.getQueue().length, 1);
  eq(again.store.getRound(), null);
});

test('확정 라운드 저장 뒤 종료(큐 저장 전)를 흉내 → 재시작 시 큐 1·같은 본문', async () => {
  const { app, store, storage } = make();
  await app.boot();
  await app.startRound('Z1', 'normal');
  await playAll(app);
  const body1 = store.getQueue()[0];
  // 큐 저장 전 상태로 되돌린다
  storage.m.delete('aq.queue');
  store.setRound({ ...body1, idx: 4, streak: 0, boostNext: false, q: body1.q.map((q) => ({ ...q })) });
  const again = make({ storage });
  await again.app.boot();
  eq(again.store.getQueue().length, 1);
  eq(again.store.getQueue()[0].id, body1.id);
  eq(again.store.getQueue()[0].creds, body1.creds);
});

test('미완 라운드는 같은 버전이면 battle로 복귀, 다른 버전이면 이탈 줄로', async () => {
  const { app, store, storage } = make();
  await app.boot();
  await app.startRound('Z1', 'normal');
  await app.submit(correct(app));
  await app.next();
  const sameV = make({ storage });
  await sameV.app.boot();
  eq(sameV.app.state.view, 'battle');
  eq(sameV.app.state.round.idx, 1);
  ok(sameV.app.state.question, '문제를 다시 만든다');
  const other = buildIndex({ zones: { ...zones, contentVersion: 'test.2' }, cards });
  const diffV = make({ storage, index: other });
  await diffV.app.boot();
  eq(diffV.app.state.round, null);
  const q = diffV.store.getQueue();
  eq(q.length, 1); eq(q[0].finished, false); eq(q[0].creds, 0);
});

test('새 라운드 시작 시 미완 라운드는 이탈 처리', async () => {
  const { app, store } = make();
  await app.boot();
  await app.startRound('Z1', 'normal');
  await app.submit(correct(app));
  await app.startRound(null, 'normal');
  eq(store.getQueue().length, 1);
  eq(store.getQueue()[0].finished, false);
  eq(app.state.round.q.length, 5);
});

test('hint: 잔액 부족이면 거부, 충분하면 사용', async () => {
  const { app } = make();
  await app.boot();
  await app.startRound('Z1', 'normal');
  eq(app.hint().ok, false);
  app.state.derived.hintPts = 3;
  eq(app.hint().ok, true);
  ok(app.state.round.q[0].hint);
});
