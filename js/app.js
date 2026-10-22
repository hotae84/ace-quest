import { buildIndex } from './content.js';
import { makeRng, randomSeed, cryptoRng } from './rng.js';
import { drawRound, drawRetry } from './draw.js';
import { generate, questionHash, optionHashes, GENERATOR_VERSION } from './questions/index.js';
import * as G from './game.js';
import { bonusOpen } from './game.js';
import { toLine, merge, deriveState, parseJsonl } from './records.js';
import { ScoresRepo, syncQueue } from './github.js';
import { Store } from './store.js';

// 화면과 무관한 앱 상태 기계. main()만 DOM에 붙는다(테스트는 createApp만 쓴다)
export function createApp({ index, store, repo = null, agents = [], ticketRng = cryptoRng(), seed = randomSeed,
  now = () => new Date().toISOString(), isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
  onChange = () => {}, uuid = () => globalThis.crypto.randomUUID() }) {
  const state = {
    index, agents, settings: store.getSettings(), cache: store.getCache(), queue: store.getQueue(), quarantine: store.getQuarantine(),
    derived: null, round: null, question: null, retryQuestion: null, inRetry: false, view: 'map', pendingUpdate: false,
    broken: store.broken, players: null, exchange: null, saveError: null, result: null, syncing: false, syncError: null, lastSync: null,
  };
  let scores = repo;
  if (!scores && state.settings.token) scores = new ScoresRepo({ owner: state.settings.owner, repo: state.settings.repo, token: state.settings.token });

  const version = () => ({ cv: index.contentVersion, gv: GENERATOR_VERSION });
  let transitioning = false; // 출격·재도전·다음 전환의 공통 잠금
  const card = (id) => index.cards.get(id);
  const changed = () => onChange(state);

  function recompute() {
    state.cache = store.getCache();
    state.queue = store.getQueue();
    state.quarantine = store.getQuarantine();
    const me = state.settings.playerId;
    const bad = new Set(state.quarantine.map((q) => q.id));
    const cacheLines = state.cache.player === me ? state.cache.lines : [];
    const lines = merge(cacheLines, state.queue).lines.filter((l) => l.player === me && !bad.has(l.id));
    state.derived = deriveState(lines, state.cache.player === me ? state.cache.redemptions : []);
    if (state.players) state.exchange = state.players.find((p) => p.id === state.settings.playerId)?.exchange || null;
  }

  function persistRound() {
    const r = store.setRound(state.round);
    if (!r.ok) state.saveError = 'round';
    return r.ok;
  }

  // 비동기 해시 계산 뒤에는 준비를 시작한 라운드·문항·시도가 그대로일 때만 상태를 바꾼다
  async function prepare(retry = false) {
    const r = state.round;
    const i = r.idx;
    const main = r.q[i];
    const slot = retry ? main.retry : main;
    const q = generate({ card: card(main.c), helpers: slot.x.map(card), form: slot.f, seed: slot.s });
    if (!slot.qh) {
      const [qh, oh] = await Promise.all([questionHash(q), optionHashes(q)]);
      const cur = state.round;
      const still = cur && cur.id === r.id && cur.idx === i && (retry ? cur.q[i].retry && cur.q[i].retry.s === slot.s : cur.q[i].s === slot.s);
      if (!still) return false;
      state.round = G.attachQuestion(state.round, i, { qh, oh }, { retry });
    }
    if (retry) state.retryQuestion = q; else { state.question = q; state.retryQuestion = null; }
    state.inRetry = retry;
    persistRound();
    return true;
  }

  // 설계 §6.3: ① 확정 라운드 저장 → ② 큐 저장 → ③ 성공 뒤에만 라운드 삭제
  function settle(finalRound, view) {
    state.round = finalRound;
    if (!persistRound()) { state.result = finalRound; state.view = view; changed(); return false; }
    const body = toLine(finalRound);
    const queue = store.getQueue();
    if (!queue.some((b) => b.id === body.id)) {
      const r = store.setQueue([...queue, body]);
      if (!r.ok) { state.saveError = 'queue'; state.result = finalRound; state.view = view; changed(); return false; }
    }
    store.setRound(null);
    state.round = null; state.question = null; state.retryQuestion = null; state.inRetry = false; state.saveError = null;
    recompute();
    state.result = finalRound;
    state.view = view;
    changed();
    if (scores && isOnline()) sync().catch(() => {});
    return true;
  }

  async function boot() {
    recompute();
    const stored = store.getRound();
    const v = version();
    if (stored) {
      const mine = stored.player === state.settings.playerId;
      if (stored.finished !== null) settle(stored, 'map');
      else if (mine && stored.cv === v.cv && stored.gv === v.gv) {
        state.round = stored;
        const slot = stored.q[stored.idx];
        const showRetry = Boolean(slot.retry);
        await prepare(showRetry);
        state.view = (showRetry ? slot.retry : slot).a === null ? 'battle' : 'verdict';
      } else settle(G.abandonRound(stored, { endedAt: now() }), 'map');
    }
    if (!state.settings.playerId || !state.settings.agent) state.view = 'setup';
    else if (!state.round) state.view = 'map';
    changed();
    if (scores && isOnline()) sync().catch(() => {});
    return state.view;
  }

  // 보너스 작전 자격(§5.6)은 시작 시점의 최신 숙련도·완주 수로 판정한다
  function bonusAvailable(zone) {
    if (!zone || !state.derived) return false;
    return bonusOpen(index.byZone.get(zone) || [], state.derived.mastery, state.derived.bonusDone.get(zone) || 0).open;
  }

  async function startRound(zone, mode = 'normal') {
    if (transitioning) return false;
    if (mode === 'bonus' && !bonusAvailable(zone)) return false;
    transitioning = true;
    try {
      if (state.round && state.round.finished === null) settle(G.abandonRound(state.round, { endedAt: now() }), 'map');
      if (state.round) return false; // 저장 실패로 남은 확정 라운드가 있으면 새로 시작하지 않는다
      const { cv, gv } = version();
      const plan = drawRound({ index, zone, mode, mastery: state.derived.mastery, recent: state.derived.recent, rng: makeRng(seed()), cv, gv });
      if (!plan.q.length) return false;
      state.round = G.newRound(plan, { id: uuid(), player: state.settings.playerId, agent: state.settings.agent, startedAt: now() });
      state.result = null;
      await prepare(false);
      state.view = 'battle';
      changed();
      return true;
    } finally { transitioning = false; }
  }

  async function submit(a) {
    state.round = G.answer(state.round, state.round.idx, a, state.question);
    persistRound();
    state.view = 'verdict';
    changed();
  }

  const offerRetry = () => Boolean(state.round) && G.canRetry(state.round, state.round.idx);

  async function startRetry() {
    if (transitioning || !state.round || !G.canRetry(state.round, state.round.idx)) return;
    transitioning = true;
    try {
      const i = state.round.idx;
      const slot = state.round.q[i];
      const r = drawRetry({ card: card(slot.c), index, prev: state.question, prevPlan: slot, rng: makeRng(seed()) });
      state.round = G.startRetry(state.round, i, { f: r.f, s: r.s, x: r.x });
      await prepare(true);
      state.view = 'battle';
      changed();
    } finally { transitioning = false; }
  }

  async function submitRetry(a) {
    state.round = G.answerRetry(state.round, state.round.idx, a, state.retryQuestion);
    persistRound();
    state.view = 'verdict';
    changed();
  }

  // 현재 시도(원 시도 또는 재도전)가 답을 낸 뒤에만, 한 번에 하나씩 넘어간다
  async function next() {
    const r = state.round;
    if (!r || transitioning) return;
    const slot = r.q[r.idx];
    const att = state.inRetry && slot.retry ? slot.retry : slot;
    if (att.a === null) return;
    transitioning = true;
    try {
      if (r.idx < r.q.length - 1) {
        state.round = { ...r, idx: r.idx + 1 };
        await prepare(false);
        if (state.round && state.round.id === r.id) { state.view = 'battle'; changed(); }
      } else await finish();
    } finally { transitioning = false; }
  }

  function hint() {
    if (!state.round) return { ok: false, reason: 'no-round' };
    const balance = G.hintBalance(state.derived.hintPts, state.round);
    const res = G.useHint(state.round, state.round.idx, { retry: state.inRetry, balance });
    if (res.ok) { state.round = res.round; persistRound(); changed(); }
    return res;
  }

  const hintBalance = () => G.hintBalance(state.derived?.hintPts || 0, state.round);

  async function finish() {
    if (!state.round) return;
    if (state.round.finished !== null) { settle(state.round, 'result'); return; }
    settle(G.finishRound(state.round, { endedAt: now(), rng: ticketRng }), 'result');
  }

  function abandon() {
    if (!state.round) return;
    if (state.round.finished === null) settle(G.abandonRound(state.round, { endedAt: now() }), 'map');
    else settle(state.round, 'map');
  }

  function saveSettings(partial) {
    // 플레이어가 바뀌면 진행 중 라운드는 이전 플레이어 이름으로 이탈 확정한 뒤 전환한다
    if (partial.playerId && partial.playerId !== state.settings.playerId && state.round) {
      if (state.round.finished === null) state.round = G.abandonRound(state.round, { endedAt: now() });
      if (!settle(state.round, 'map')) return false;
    }
    const r = store.setSettings(partial);
    state.settings = store.getSettings();
    state.players = partial.playerId && partial.playerId !== state.settings.playerId ? null : state.players;
    recompute();
    if (state.settings.token) scores = new ScoresRepo({ owner: state.settings.owner, repo: state.settings.repo, token: state.settings.token });
    else scores = null;
    changed();
    return r.ok;
  }

  async function loadPlayers() {
    if (!scores) return null;
    state.players = await scores.readPlayers();
    recompute();
    changed();
    return state.players;
  }

  async function sync() {
    if (!scores || !state.settings.playerId || state.syncing) return null;
    const player = state.settings.playerId; // 시작 당시 플레이어·저장소에 고정
    const repoNow = scores;
    state.syncing = true; changed();
    try {
      const r = await syncQueue({ repo: repoNow, player, store, quarantineIds: new Set(store.getQuarantine().map((q) => q.id)) });
      state.syncError = r.error;
      if (!r.error) {
        try {
          const red = await repoNow.readRaw(`redemptions/${player}.jsonl`);
          const cache = store.getCache();
          if (cache.player === player) store.setCache({ ...cache, redemptions: red.missing ? [] : parseJsonl(red.text) });
        } catch { /* 환전 기록 읽기 실패는 다음 기회에 */ }
        if (!state.players) { try { await loadPlayers(); } catch { /* 설정 화면에서 다시 */ } }
        state.lastSync = now();
      }
      recompute();
      return r;
    } catch (e) {
      state.syncError = e;
      return { error: e };
    } finally {
      state.syncing = false;
      changed();
    }
  }

  function go(view) { state.view = view; changed(); }

  // 진행 중 라운드로 복귀 — 현재 시도(원 시도·재도전)의 응답 여부에 맞는 화면
  function resume() {
    const r = state.round;
    if (!r || r.finished !== null) { state.view = 'map'; changed(); return; }
    const slot = r.q[r.idx];
    const att = state.inRetry && slot.retry ? slot.retry : slot;
    state.view = att.a === null ? 'battle' : 'verdict';
    changed();
  }

  return { state, boot, startRound, bonusAvailable, resume, submit, offerRetry, startRetry, submitRetry, next, hint, hintBalance, finish, abandon, saveSettings, loadPlayers, sync, go, version,
    get repo() { return scores; } };
}

// ---- 브라우저 진입점 ----
export async function main() {
  const { mount } = await import('./dom.js');
  const { renderView } = await import('./views/index.js');
  const { setupSW, applyUpdate } = await import('./sw-client.js');
  const root = document.getElementById('app');
  const fetchJson = async (p) => { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json(); };
  let app = null;
  const render = () => { if (app) mount(root, renderView(app)); };
  try {
    const zones = await fetchJson('data/zones.json');
    const cards = (await Promise.all(zones.cardFiles.map((f) => fetchJson(`data/${f}`)))).flat();
    const agents = await fetchJson('data/agents.json');
    const index = buildIndex({ zones, cards });
    const store = new Store(localStorage);
    app = createApp({ index, store, agents, onChange: render });
    app.toast = toast;
    app.applyUpdate = () => applyUpdate(app, store);
    window.addEventListener('online', () => app.sync());
    await app.boot();
    setupSW(app);
  } catch (e) {
    root.replaceChildren(document.createTextNode(`앱을 시작하지 못했어요: ${e.message}`));
  }
}

let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

if (typeof document !== 'undefined' && document.getElementById('app')) main();
