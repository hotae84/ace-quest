import { test, eq, ok } from './harness.js';
import { chain, toJsonl, parseJsonl } from '../js/records.js';
import { AUTHOR, ScoresRepo, RepoError, ConflictError, syncQueue } from '../js/github.js';

const TOKEN = 'github_pat_SECRET123';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const line = (id, creds = 50) => ({ v: 1, id, player: 'p1', agent: 'jett', zone: 'Z1', mode: 'normal', startedAt: 's', endedAt: 'e', finished: true,
  cv: 'test.1', gv: '1', q: [], streakMax: 0, ace: false, tickets: [], creds });

// 가짜 GitHub: 파일 상태를 들고 Contents API를 흉내 낸다
function fakeGitHub({ players = [{ id: 'p1', nick: 'n' }], files = {}, putFail = [], putThrowOnce = false } = {}) {
  const state = { files: { ...files }, calls: [], puts: 0 };
  if (players) state.files['players.json'] = JSON.stringify(players);
  const res = (status, body, text) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => text ?? JSON.stringify(body), headers: { get: () => null } });
  const fetch = async (url, init = {}) => {
    state.calls.push({ url, init });
    const m = url.match(/\/repos\/o\/r\/contents\/(.+?)(\?.*)?$/);
    if (!m) return res(404, { message: 'no route' });
    const path = decodeURIComponent(m[1]);
    const accept = init.headers?.Accept || '';
    if ((init.method || 'GET') === 'GET') {
      if (!(path in state.files)) return res(404, { message: 'Not Found' });
      const text = state.files[path];
      if (accept.includes('raw')) return res(200, null, text);
      return res(200, { sha: `sha-${path}-${text.length}`, size: text.length, encoding: 'none', content: '' });
    }
    if (init.method === 'PUT') {
      state.puts++;
      const bodyJ = JSON.parse(init.body);
      if (putFail.length) { const code = putFail.shift(); return res(code, { message: 'conflict' }); }
      const text = Buffer.from(bodyJ.content, 'base64').toString('utf8');
      state.files[path] = text;
      if (putThrowOnce) { putThrowOnce = false; throw new Error('network lost after write'); }
      return res(200, { content: { sha: `sha-${path}-${text.length}` } });
    }
    return res(405, {});
  };
  return { state, fetch };
}

function fakeStore({ queue = [], cache = { player: 'p1', lines: [], redemptions: [], fetchedAt: null }, settings = {}, failCache = false, failQuarantine = false } = {}) {
  const s = { settings: { owner: 'o', repo: 'r', syncedPlayers: [], ...settings }, queue, cache, quarantine: [], failCache, failQuarantine };
  return {
    s,
    getSettings: () => s.settings, setSettings: (p) => { s.settings = { ...s.settings, ...p }; return { ok: true }; },
    getQueue: () => s.queue, setQueue: (q) => { s.queue = q; return { ok: true }; },
    getCache: () => s.cache, setCache: (c) => { if (s.failCache) return { ok: false }; s.cache = c; return { ok: true }; },
    getQuarantine: () => s.quarantine, addQuarantine: (items) => { if (s.failQuarantine) return { ok: false }; s.quarantine.push(...items); return { ok: true }; },
  };
}

const repoOf = (gh, extra = {}) => new ScoresRepo({ owner: 'o', repo: 'r', token: TOKEN, fetch: gh.fetch, sleep: async () => {}, ...extra });

test('AUTHOR는 비식별 고정값', () => eq(AUTHOR, { name: 'ace-quest', email: 'ace-quest@users.noreply.invalid' }));

test('① 정상: GET→PUT 1회, author 고정, 메시지 round <id8>', async () => {
  const gh = fakeGitHub();
  const r = await repoOf(gh).appendLines({ path: 'records/p1.jsonl', pending: [line('abcdefgh-1234')], bootstrap: true });
  eq(r.sent, ['abcdefgh-1234']); eq(r.skipped, []); eq(r.quarantine, []);
  eq(gh.state.puts, 1);
  const put = gh.state.calls.find((c) => c.init.method === 'PUT');
  const body = JSON.parse(put.init.body);
  eq(body.author.name, 'ace-quest'); eq(body.committer.email, AUTHOR.email);
  eq(body.message, 'round abcdefgh');
  const written = parseJsonl(gh.state.files['records/p1.jsonl']);
  eq(written.length, 1); eq(written[0].prev, 'GENESIS'); ok(written[0].hash.length === 64);
});

test('② PUT 409 두 번 뒤 성공 → PUT 3회', async () => {
  const gh = fakeGitHub({ putFail: [409, 412] });
  const r = await repoOf(gh).appendLines({ path: 'records/p1.jsonl', pending: [line('a')], bootstrap: true });
  eq(r.sent, ['a']); eq(gh.state.puts, 3);
});

test('② 409가 계속되면 ConflictError', async () => {
  const gh = fakeGitHub({ putFail: [409, 409, 409, 409] });
  let err = null;
  try { await repoOf(gh).appendLines({ path: 'records/p1.jsonl', pending: [line('a')], bootstrap: true }); } catch (e) { err = e; }
  ok(err instanceof ConflictError);
});

test('③ 원격에 이미 있는 id는 skipped, 전부 중복이면 PUT 없음', async () => {
  const [l] = await chain([line('a')]);
  const gh = fakeGitHub({ files: { 'records/p1.jsonl': toJsonl([l]) } });
  const r = await repoOf(gh).appendLines({ path: 'records/p1.jsonl', pending: [line('a')], bootstrap: false });
  eq(r.skipped, ['a']); eq(r.sent, []); eq(gh.state.puts, 0);
});

test('③ 원격 뒤에 새 줄을 이어 붙이고 prev가 이어진다', async () => {
  const [l] = await chain([line('a')]);
  const gh = fakeGitHub({ files: { 'records/p1.jsonl': toJsonl([l]).trimEnd() } }); // 끝 개행 없음도 처리
  const r = await repoOf(gh).appendLines({ path: 'records/p1.jsonl', pending: [line('a'), line('b')], bootstrap: false });
  eq(r.sent, ['b']); eq(r.skipped, ['a']);
  const written = parseJsonl(gh.state.files['records/p1.jsonl']);
  eq(written.length, 2); eq(written[1].prev, l.hash);
});

test('④ PUT 성공 응답 유실 뒤 재호출 → 원격에서 발견해 skipped, 중복 없음', async () => {
  const gh = fakeGitHub({ putThrowOnce: true });
  const repo = repoOf(gh);
  let err = null;
  try { await repo.appendLines({ path: 'records/p1.jsonl', pending: [line('a')], bootstrap: true }); } catch (e) { err = e; }
  ok(err && !(err instanceof RepoError), '네트워크 오류는 그대로 전파');
  const r = await repo.appendLines({ path: 'records/p1.jsonl', pending: [line('a')], bootstrap: true });
  eq(r.skipped, ['a']); eq(r.sent, []);
  eq(parseJsonl(gh.state.files['records/p1.jsonl']).length, 1);
});

test('⑤ players.json 404 → RepoError, PUT 없음', async () => {
  const gh = fakeGitHub({ players: null });
  let err = null;
  try { await repoOf(gh).appendLines({ path: 'records/p1.jsonl', pending: [line('a')], bootstrap: true }); } catch (e) { err = e; }
  ok(err instanceof RepoError); eq(err.code, 'no-access'); eq(gh.state.puts, 0);
});

test('⑥ 원장 404 + bootstrap:false → RepoError(missing-ledger), PUT 없음', async () => {
  const gh = fakeGitHub();
  let err = null;
  try { await repoOf(gh).appendLines({ path: 'records/p1.jsonl', pending: [line('a')], bootstrap: false }); } catch (e) { err = e; }
  ok(err instanceof RepoError); eq(err.code, 'missing-ledger'); eq(gh.state.puts, 0);
});

test('⑦ bootstrap:true → 빈 원장에서 PUT', async () => {
  const gh = fakeGitHub();
  const r = await repoOf(gh).appendLines({ path: 'records/p1.jsonl', pending: [line('a')], bootstrap: true });
  eq(r.sent, ['a']); eq(gh.state.puts, 1);
});

test('⑧ 토큰은 헤더에만, URL·본문에 없음', async () => {
  const gh = fakeGitHub();
  await repoOf(gh).appendLines({ path: 'records/p1.jsonl', pending: [line('a')], bootstrap: true });
  for (const c of gh.state.calls) {
    ok(!c.url.includes(TOKEN)); ok(!(c.init.body || '').includes(TOKEN));
    eq(c.init.headers.Authorization, `Bearer ${TOKEN}`);
  }
});

test('readRaw: 404는 missing, 500은 RepoError', async () => {
  const gh = fakeGitHub();
  eq(await repoOf(gh).readRaw('nothing.jsonl'), { missing: true });
  const bad = { fetch: async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '', headers: { get: () => null } }) };
  let err = null; try { await repoOf(bad).readRaw('x'); } catch (e) { err = e; }
  ok(err instanceof RepoError); eq(err.status, 500);
});

test('syncQueue: 성공하면 캐시 갱신·everSynced·큐 정리, 격리는 먼저 보존', async () => {
  const [la] = await chain([line('a')]);
  const gh = fakeGitHub({ files: { 'records/p1.jsonl': toJsonl([la]) } });
  const store = fakeStore({ queue: [{ ...line('a'), creds: 999 }, line('b')], cache: { player: 'p1', lines: [la], redemptions: [], fetchedAt: null } });
  const r = await syncQueue({ repo: repoOf(gh), player: 'p1', store, quarantineIds: new Set() });
  eq(r.error, null);
  eq(r.sent, ['b']);
  eq(store.s.quarantine.map((q) => q.id), ['a']);
  eq(store.s.queue, [], '격리된 a도 큐에서 빠진다(격리 보관으로 이동)');
  eq(store.s.cache.lines.map((l) => l.id), ['a', 'b']);
  eq(store.s.settings.syncedPlayers, ['p1']);
});

test('⑨ 원격·캐시·큐 세 본문이 다르면 격리, PUT 없음', async () => {
  const [la] = await chain([line('a', 50)]);
  const gh = fakeGitHub({ files: { 'records/p1.jsonl': toJsonl([la]) } });
  const store = fakeStore({ queue: [line('a', 70)], cache: { player: 'p1', lines: [{ ...la, creds: 60 }], redemptions: [], fetchedAt: null } });
  const r = await syncQueue({ repo: repoOf(gh), player: 'p1', store, quarantineIds: new Set() });
  eq(r.sent, []); eq(gh.state.puts, 0);
  ok(store.s.quarantine.length >= 1);
});

test('⑩ 격리된 id는 다음 syncQueue에서 제외된다', async () => {
  const gh = fakeGitHub();
  const store = fakeStore({ queue: [line('a'), line('b')] });
  const r = await syncQueue({ repo: repoOf(gh), player: 'p1', store, quarantineIds: new Set(['a']) });
  eq(r.sent, ['b']);
  eq(parseJsonl(gh.state.files['records/p1.jsonl']).map((l) => l.id), ['b']);
});

test('⑪ setCache 실패면 큐를 지우지 않는다', async () => {
  const gh = fakeGitHub();
  const store = fakeStore({ queue: [line('a')], failCache: true });
  const r = await syncQueue({ repo: repoOf(gh), player: 'p1', store, quarantineIds: new Set() });
  eq(r.sent, ['a']);
  eq(store.s.queue.map((l) => l.id), ['a'], '다음 동기화에서 skipped로 정리된다');
});

test('⑫ 원격 파싱 실패 → error, 큐·캐시 보존, PUT 없음', async () => {
  const gh = fakeGitHub({ files: { 'records/p1.jsonl': '{broken\n' } });
  const store = fakeStore({ queue: [line('a')], settings: { syncedPlayers: ['p1'] } });
  const r = await syncQueue({ repo: repoOf(gh), player: 'p1', store, quarantineIds: new Set() });
  ok(r.error instanceof RepoError); eq(r.error.code, 'parse');
  eq(store.s.queue.length, 1); eq(gh.state.puts, 0);
});

test('⑫ 네트워크 오류도 error로 돌려주고 큐 보존', async () => {
  const repo = repoOf({ fetch: async () => { throw new Error('offline'); } });
  const store = fakeStore({ queue: [line('a')] });
  const r = await syncQueue({ repo, player: 'p1', store, quarantineIds: new Set() });
  ok(r.error); eq(store.s.queue.length, 1);
});

test('appendOnlyCheck: 커밋별 deletions와 최신 두 버전 접두부 비교', async () => {
  const [la] = await chain([line('a')]);
  const [lb] = await chain([line('b')], la.hash);
  const v1 = toJsonl([la]), v2 = toJsonl([la, lb]);
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push(url);
    const R = (body, text, link) => ({ ok: true, status: 200, json: async () => body, text: async () => text ?? JSON.stringify(body), headers: { get: (k) => (k.toLowerCase() === 'link' ? link || null : null) } });
    if (url.includes('/commits?')) {
      if (url.includes('page=2')) return R([{ sha: 'c1' }]);
      return R([{ sha: 'c2' }], null, '<https://api.github.com/repos/o/r/commits?path=records%2Fp1.jsonl&per_page=100&page=2>; rel="next"');
    }
    if (url.endsWith('/commits/c2')) return R({ sha: 'c2', files: [{ filename: 'records/p1.jsonl', deletions: 0 }] });
    if (url.endsWith('/commits/c1')) return R({ sha: 'c1', files: [{ filename: 'records/p1.jsonl', deletions: 0 }] });
    const isObj = (init.headers?.Accept || '').includes('object');
    if (url.includes('ref=c2')) return isObj ? R({ sha: 'blob2' }) : R(null, v2);
    if (url.includes('ref=c1')) return isObj ? R({ sha: 'blob1' }) : R(null, v1);
    return { ok: false, status: 404, json: async () => ({}), text: async () => '', headers: { get: () => null } };
  };
  const repo = new ScoresRepo({ owner: 'o', repo: 'r', token: TOKEN, fetch });
  const r = await repo.appendOnlyCheck('records/p1.jsonl');
  eq(r.commits, [{ sha: 'c2', deletions: 0 }, { sha: 'c1', deletions: 0 }]);
  eq(r.prefixOk, true);
  ok(calls.some((u) => u.includes('page=2')), '페이지를 끝까지 순회');
});

test('#1 빈 큐로 최초 동기화해도 전송 이력이 생기지 않아 첫 기록을 bootstrap으로 보낸다', async () => {
  const gh = fakeGitHub();
  const store = fakeStore({ queue: [] });
  const r0 = await syncQueue({ repo: repoOf(gh), player: 'p1', store, quarantineIds: new Set() });
  eq(r0.error, null); eq(store.s.settings.syncedPlayers, []);
  store.s.queue = [line('a')];
  const r1 = await syncQueue({ repo: repoOf(gh), player: 'p1', store, quarantineIds: new Set() });
  eq(r1.error, null); eq(r1.sent, ['a']); eq(store.s.settings.syncedPlayers, ['p1']);
});

test('#2 전송 중 결산된 라운드는 큐 정리에서 살아남는다', async () => {
  const gh = fakeGitHub();
  const store = fakeStore({ queue: [line('a')] });
  const slowFetch = async (url, init) => { const res = await gh.fetch(url, init); if (init?.method === 'PUT') store.s.queue = [...store.s.queue, line('late')]; return res; };
  const r = await syncQueue({ repo: repoOf({ fetch: slowFetch }), player: 'p1', store, quarantineIds: new Set() });
  eq(r.sent, ['a']);
  eq(store.s.queue.map((l) => l.id), ['late']);
});

test('#4 다른 플레이어의 기록은 보내지 않고 큐에 남긴다', async () => {
  const gh = fakeGitHub({ players: [{ id: 'p1' }, { id: 'p2' }] });
  const store = fakeStore({ queue: [{ ...line('a'), player: 'p2' }, line('b')] });
  const r = await syncQueue({ repo: repoOf(gh), player: 'p1', store, quarantineIds: new Set() });
  eq(r.sent, ['b']);
  eq(store.s.queue.map((l) => l.id), ['a']);
  eq(parseJsonl(gh.state.files['records/p1.jsonl']).map((l) => l.id), ['b']);
});

test('#5 캐시와 원격의 같은 id 다른 본문은 격리되고 캐시는 원격으로 갱신된다', async () => {
  const [la] = await chain([line('a', 50)]);
  const gh = fakeGitHub({ files: { 'records/p1.jsonl': toJsonl([la]) } });
  const store = fakeStore({ queue: [], cache: { player: 'p1', lines: [{ ...la, creds: 999 }], redemptions: [], fetchedAt: null } });
  const r = await syncQueue({ repo: repoOf(gh), player: 'p1', store, quarantineIds: new Set() });
  eq(r.error, null);
  eq(store.s.quarantine.map((q) => q.id), ['a']);
  eq(store.s.cache.lines[0].creds, 50);
});

test('#6 격리 저장이 실패하면 큐를 건드리지 않고 오류를 돌려준다', async () => {
  const [la] = await chain([line('a', 50)]);
  const gh = fakeGitHub({ files: { 'records/p1.jsonl': toJsonl([la]) } });
  const store = fakeStore({ queue: [line('a', 70), line('b')], failQuarantine: true });
  const r = await syncQueue({ repo: repoOf(gh), player: 'p1', store, quarantineIds: new Set() });
  ok(r.error);
  eq(store.s.queue.map((l) => l.id), ['a', 'b']);
});

test('다른 플레이어의 캐시는 쓰지 않는다(hasHistory 판단·병합 제외)', async () => {
  const gh = fakeGitHub();
  const store = fakeStore({ queue: [line('a')], cache: { player: 'p2', lines: [line('zzz')], redemptions: [], fetchedAt: null } });
  const r = await syncQueue({ repo: repoOf(gh), player: 'p1', store, quarantineIds: new Set() });
  eq(r.sent, ['a'], 'p2 캐시가 있어도 p1은 bootstrap으로 전송');
  eq(store.s.cache.player, 'p1');
});

test('v2#5 원격에 없는 id의 캐시↔큐 충돌도 격리되고 전송되지 않는다', async () => {
  const [lz] = await chain([line('z')]);
  const gh = fakeGitHub({ files: { 'records/p1.jsonl': toJsonl([lz]) } });
  const store = fakeStore({ queue: [line('a', 70), line('b')], cache: { player: 'p1', lines: [lz, { ...line('a', 60), prev: lz.hash, hash: 'x' }], redemptions: [], fetchedAt: null }, settings: { syncedPlayers: ['p1'] } });
  const r = await syncQueue({ repo: repoOf(gh), player: 'p1', store, quarantineIds: new Set() });
  eq(r.error, null);
  eq(r.sent, ['b']);
  eq(store.s.quarantine.map((q) => q.id), ['a']);
  eq(store.s.queue, []);
});
