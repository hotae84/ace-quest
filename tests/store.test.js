import { test, eq, ok } from './harness.js';
import { Store, KEYS } from '../js/store.js';

function fakeStorage({ throwOnSet = false } = {}) {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (throwOnSet) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

test('KEYS', () => eq(KEYS, { settings: 'aq.settings', queue: 'aq.queue', cache: 'aq.cache', round: 'aq.round', quarantine: 'aq.quarantine', adminChecks: 'aq.admin.checks' }));

test('기본값', () => {
  const s = new Store(fakeStorage());
  eq(s.getSettings(), { token: null, owner: 'hotae84', repo: 'ace-quest-scores', playerId: null, nick: null, agent: null, remember: false, everSynced: false });
  eq(s.getQueue(), []);
  eq(s.getCache(), { lines: [], redemptions: [], fetchedAt: null });
  eq(s.getRound(), null);
  eq(s.getQuarantine(), []);
  eq(s.getAdminChecks(), {});
  eq(s.broken, []);
});

test('저장·재읽기 왕복, setSettings는 병합', () => {
  const st = fakeStorage();
  const s = new Store(st);
  eq(s.setSettings({ playerId: 'p1', agent: 'jett' }), { ok: true });
  eq(s.setSettings({ token: 't' }).ok, true);
  eq(new Store(st).getSettings().playerId, 'p1');
  eq(new Store(st).getSettings().token, 't');
  s.setQueue([{ id: 'a' }]); eq(new Store(st).getQueue(), [{ id: 'a' }]);
  s.setCache({ lines: [{ id: 'a' }], redemptions: [{ creds: 1 }], fetchedAt: 'now' }); eq(new Store(st).getCache().lines.length, 1);
  s.setRound({ id: 'r' }); eq(new Store(st).getRound(), { id: 'r' });
  s.setRound(null); eq(new Store(st).getRound(), null);
  s.addQuarantine([{ id: 'q', a: {}, b: {} }]); s.addQuarantine([{ id: 'q2', a: {}, b: {} }]);
  eq(new Store(st).getQuarantine().map((x) => x.id), ['q', 'q2']);
  s.setAdminChecks({ 'records/p1.jsonl': { lineCount: 3, prefixHash: 'abc', checkedAt: 'now' } });
  eq(new Store(st).getAdminChecks()['records/p1.jsonl'].lineCount, 3);
});

test('깨진 JSON·형식 불일치는 기본값 + broken 기록', () => {
  const st = fakeStorage();
  st.m.set(KEYS.queue, '{not json');
  st.m.set(KEYS.cache, '"string"');
  st.m.set(KEYS.settings, '[1,2]');
  const s = new Store(st);
  eq(s.getQueue(), []);
  eq(s.getCache(), { lines: [], redemptions: [], fetchedAt: null });
  eq(s.getSettings().owner, 'hotae84');
  eq(s.broken.slice().sort(), [KEYS.cache, KEYS.queue, KEYS.settings]);
});

test('setItem 실패는 {ok:false}', () => {
  const s = new Store(fakeStorage({ throwOnSet: true }));
  eq(s.setQueue([]), { ok: false });
  eq(s.setRound({ id: 'r' }).ok, false);
});

test('clearAll은 모든 키를 지운다', () => {
  const st = fakeStorage();
  const s = new Store(st);
  s.setQueue([{ id: 'a' }]); s.setSettings({ token: 't' });
  s.clearAll();
  eq(st.m.size, 0);
});
