export const KEYS = { settings: 'aq.settings', queue: 'aq.queue', cache: 'aq.cache', round: 'aq.round', quarantine: 'aq.quarantine', adminChecks: 'aq.admin.checks' };

const DEFAULT_SETTINGS = () => ({ token: null, owner: 'hotae84', repo: 'ace-quest-scores', playerId: null, nick: null, agent: null, remember: false, everSynced: false });
const DEFAULT_CACHE = () => ({ lines: [], redemptions: [], fetchedAt: null });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// localStorage 래퍼. 읽기는 깨지면 기본값 + broken 기록, 쓰기는 실패 시 {ok:false}
export class Store {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.broken = [];
  }

  read(key, check, fallback) {
    let raw = null;
    try { raw = this.storage.getItem(key); } catch { raw = null; }
    if (raw === null || raw === undefined) return fallback();
    try {
      const v = JSON.parse(raw);
      if (!check(v)) throw new Error('shape');
      return v;
    } catch {
      if (!this.broken.includes(key)) this.broken.push(key);
      return fallback();
    }
  }

  write(key, value) {
    try {
      if (value === null) this.storage.removeItem(key);
      else this.storage.setItem(key, JSON.stringify(value));
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  getSettings() { return { ...DEFAULT_SETTINGS(), ...this.read(KEYS.settings, isObj, () => ({})) }; }
  setSettings(partial) { return this.write(KEYS.settings, { ...this.getSettings(), ...partial }); }

  getQueue() { return this.read(KEYS.queue, Array.isArray, () => []); }
  setQueue(list) { return this.write(KEYS.queue, list); }

  getCache() {
    const c = this.read(KEYS.cache, (v) => isObj(v) && Array.isArray(v.lines), DEFAULT_CACHE);
    return { ...DEFAULT_CACHE(), ...c, redemptions: Array.isArray(c.redemptions) ? c.redemptions : [] };
  }
  setCache(c) { return this.write(KEYS.cache, c); }

  getRound() { return this.read(KEYS.round, (v) => v === null || isObj(v), () => null); }
  setRound(r) { return this.write(KEYS.round, r); }

  getQuarantine() { return this.read(KEYS.quarantine, Array.isArray, () => []); }
  addQuarantine(items) { return this.write(KEYS.quarantine, [...this.getQuarantine(), ...items]); }

  getAdminChecks() { return this.read(KEYS.adminChecks, isObj, () => ({})); }
  setAdminChecks(c) { return this.write(KEYS.adminChecks, c); }

  clearAll() { for (const k of Object.values(KEYS)) { try { this.storage.removeItem(k); } catch {} } }
}
