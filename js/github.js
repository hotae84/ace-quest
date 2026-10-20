import { parseJsonl, toJsonl, merge, chain } from './records.js';

// 모든 커밋의 author·committer — 생략하면 토큰 소유자 정보가 들어간다(설계 §6.1)
export const AUTHOR = { name: 'ace-quest', email: 'ace-quest@users.noreply.invalid' };
const API = 'https://api.github.com';
const ACCEPT_OBJ = 'application/vnd.github.object+json';
const ACCEPT_RAW = 'application/vnd.github.raw+json';
const ACCEPT_JSON = 'application/vnd.github+json';

export class RepoError extends Error {
  constructor(message, { status = 0, code = 'repo' } = {}) { super(message); this.name = 'RepoError'; this.status = status; this.code = code; }
}
export class ConflictError extends RepoError {
  constructor(message, opts = {}) { super(message, { ...opts, code: 'conflict' }); this.name = 'ConflictError'; }
}

function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ScoresRepo {
  constructor({ owner, repo, token, fetch = globalThis.fetch, sleep = defaultSleep }) {
    this.base = `${API}/repos/${owner}/${repo}`;
    this.token = token;
    this.fetch = fetch;
    this.sleep = sleep;
  }

  headers(accept) {
    // 토큰은 헤더에만. URL·본문·로그에 넣지 않는다
    return { Authorization: `Bearer ${this.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };
  }

  async get(url, accept) {
    return this.fetch(url, { method: 'GET', headers: this.headers(accept) });
  }

  contentsUrl(path, ref) {
    return `${this.base}/contents/${path.split('/').map(encodeURIComponent).join('/')}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
  }

  // 메타(sha) + raw 본문. 404 → missing. 그 밖 비정상 → RepoError
  async readRaw(path, ref) {
    const meta = await this.get(this.contentsUrl(path, ref), ACCEPT_OBJ);
    if (meta.status === 404) return { missing: true };
    if (!meta.ok) throw new RepoError(`읽기 실패 ${meta.status}`, { status: meta.status, code: 'read' });
    const { sha } = await meta.json();
    const raw = await this.get(this.contentsUrl(path, ref), ACCEPT_RAW);
    if (!raw.ok) throw new RepoError(`읽기 실패 ${raw.status}`, { status: raw.status, code: 'read' });
    return { sha, text: await raw.text() };
  }

  async writeFile(path, text, { sha, message }) {
    const body = { message, content: toBase64Utf8(text), author: AUTHOR, committer: AUTHOR };
    if (sha) body.sha = sha;
    const res = await this.fetch(this.contentsUrl(path), { method: 'PUT', headers: this.headers(ACCEPT_JSON), body: JSON.stringify(body) });
    if (res.status === 409 || res.status === 412 || res.status === 422) throw new ConflictError(`쓰기 충돌 ${res.status}`, { status: res.status });
    if (!res.ok) throw new RepoError(`쓰기 실패 ${res.status}`, { status: res.status, code: 'write' });
    const json = await res.json();
    return { sha: json?.content?.sha };
  }

  // 저장소 접근 확인을 겸한다 — 404도 권한 없음으로 취급(설계 §6.3)
  async readPlayers() {
    const r = await this.readRaw('players.json');
    if (r.missing) throw new RepoError('players.json을 읽을 수 없음(권한 또는 저장소 확인)', { status: 404, code: 'no-access' });
    try { return JSON.parse(r.text); } catch { throw new RepoError('players.json 형식 오류', { code: 'parse' }); }
  }

  async appendLines({ path, pending, bootstrap }) {
    await this.readPlayers();
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await this.readRaw(path);
      let remote = [];
      let sha;
      let prefix = '';
      if (r.missing) {
        if (!bootstrap) throw new RepoError('기록 파일이 없음 — 최초 생성이 아니면 권한 문제', { status: 404, code: 'missing-ledger' });
      } else {
        try { remote = parseJsonl(r.text); } catch { throw new RepoError('기록 파일 파싱 실패', { code: 'parse' }); }
        sha = r.sha;
        prefix = r.text === '' || r.text.endsWith('\n') ? r.text : `${r.text}\n`;
      }
      const m = merge(remote, pending);
      const bad = new Set(m.quarantine.map((q) => q.id));
      const remoteIds = new Set(remote.map((l) => l.id));
      const skipped = pending.filter((p) => !bad.has(p.id) && remoteIds.has(p.id)).map((p) => p.id);
      const toSend = pending.filter((p) => !bad.has(p.id) && !remoteIds.has(p.id));
      if (!toSend.length) return { sent: [], skipped, quarantine: m.quarantine, remoteLines: remote, sentLines: [] };
      const lastHash = remote.length ? remote[remote.length - 1].hash : 'GENESIS';
      const lines = await chain(toSend, lastHash);
      try {
        await this.writeFile(path, prefix + toJsonl(lines), { sha, message: `round ${String(lines[0].id).slice(0, 8)}` });
        return { sent: lines.map((l) => l.id), skipped, quarantine: m.quarantine, remoteLines: remote, sentLines: lines };
      } catch (e) {
        if (!(e instanceof ConflictError)) throw e;
        lastErr = e;
        await this.sleep(1000 * 2 ** attempt);
      }
    }
    throw lastErr;
  }

  // --- 관리 페이지용(설계 §6.4 ⑥) ---
  async commitsFor(path) {
    let url = `${this.base}/commits?path=${encodeURIComponent(path)}&per_page=100`;
    const out = [];
    while (url) {
      const res = await this.get(url, ACCEPT_JSON);
      if (!res.ok) throw new RepoError(`커밋 목록 실패 ${res.status}`, { status: res.status, code: 'read' });
      out.push(...(await res.json()).map((c) => ({ sha: c.sha })));
      const link = res.headers?.get?.('Link') || res.headers?.get?.('link') || '';
      const next = link.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    }
    return out;
  }

  async commitDetail(sha, path) {
    const res = await this.get(`${this.base}/commits/${sha}`, ACCEPT_JSON);
    if (!res.ok) throw new RepoError(`커밋 상세 실패 ${res.status}`, { status: res.status, code: 'read' });
    const json = await res.json();
    const f = (json.files || []).find((x) => x.filename === path);
    return { sha, deletions: f ? Number(f.deletions) || 0 : 0 };
  }

  async appendOnlyCheck(path) {
    const list = await this.commitsFor(path);
    const commits = [];
    for (const c of list) commits.push(await this.commitDetail(c.sha, path));
    let prefixOk = true;
    if (commits.length >= 2) {
      const newer = await this.readRaw(path, commits[0].sha);
      const older = await this.readRaw(path, commits[1].sha);
      if (newer.missing || older.missing) prefixOk = false;
      else prefixOk = newer.text.startsWith(older.text);
    }
    return { commits, prefixOk };
  }
}

const failed = (r) => r && r.ok === false;

// 큐 → 저장소 전송(설계 §6.3). 격리 보존 → 캐시 갱신 성공 뒤에만 큐 정리
export async function syncQueue({ repo, player, store, quarantineIds = new Set(), now = () => new Date().toISOString() }) {
  const settings = store.getSettings();
  const cache = store.getCache();
  const hasHistory = (cache.lines || []).length > 0 || Boolean(settings.everSynced);
  const queue = store.getQueue();
  const pending = queue.filter((b) => !quarantineIds.has(b.id));
  let res;
  try {
    res = await repo.appendLines({ path: `records/${player}.jsonl`, pending, bootstrap: !hasHistory });
  } catch (e) {
    return { sent: [], skipped: [], quarantine: [], error: e, remoteLines: null };
  }
  if (res.quarantine.length) store.addQuarantine(res.quarantine);
  const bad = new Set(res.quarantine.map((q) => q.id));
  const lines = merge(res.remoteLines, res.sentLines).lines;
  const okCache = store.setCache({ ...cache, lines, fetchedAt: now() });
  const okSettings = store.setSettings({ everSynced: true });
  if (!failed(okCache) && !failed(okSettings)) {
    const done = new Set([...res.sent, ...res.skipped]);
    store.setQueue(queue.filter((b) => !done.has(b.id) && !bad.has(b.id)));
  }
  return { ...res, error: null };
}
