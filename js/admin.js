import { h, mount } from './dom.js';
import { Store } from './store.js';
import { ScoresRepo } from './github.js';
import { parseJsonl, merge } from './records.js';
import { summarize, acceptReply, checkpointFor, checkpointStatus, isLedgerPath, redemptionLine, appendRedemption, TEST_PLAYER } from './admin-core.js';
import { buildIndex, pickHelpers } from './content.js';
import { makeRng } from './rng.js';
import { generate, questionHash, GENERATOR_VERSION } from './questions/index.js';
import { fmt } from './views/common.js';

const ADMIN_TOKEN_KEY = 'aq.admin.token';
const root = document.getElementById('app');
const store = new Store(localStorage);
let token = '';
try { token = localStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { token = ''; }
let remember = Boolean(token);
let repo = null;
let versions = null;
let summary = null;
let index = null;
let rawText = {};
let checksStatus = {};
let busy = false;
let lastError = '';

// ---- 재현 샌드박스 ----
const iframe = h('iframe', { title: '재현기', sandbox: 'allow-scripts', src: 'replay.html' });
const pending = new Map();
window.addEventListener('message', (e) => {
  if (!acceptReply(e, iframe.contentWindow, new Set(pending.keys()))) return;
  const { resolve } = pending.get(e.data.id);
  pending.delete(e.data.id);
  resolve(e.data);
});
function askReplay(req) {
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ id, error: 'timeout' }); } }, 10000);
    pending.set(id, { resolve: (d) => { clearTimeout(timer); resolve(d); } });
    iframe.contentWindow.postMessage({ ...req, id }, '*');
  });
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3200);
}

async function loadAll() {
  if (!token) { lastError = '토큰을 입력하세요.'; render(); return; }
  busy = true; lastError = ''; render();
  try {
    const s = store.getSettings();
    repo = new ScoresRepo({ owner: s.owner, repo: s.repo, token });
    const players = await repo.readPlayers();
    const recordsByPlayer = {}, redemptionsByPlayer = {}, appendChecks = {}, cps = {};
    rawText = {};
    const saved = store.getAdminChecks();
    for (const p of players) {
      const path = `records/${p.id}.jsonl`;
      const r = await repo.readRaw(path);
      rawText[p.id] = r.missing ? '' : r.text;
      recordsByPlayer[p.id] = r.missing ? [] : parseJsonl(r.text);
      const red = await repo.readRaw(`redemptions/${p.id}.jsonl`);
      redemptionsByPlayer[p.id] = red.missing ? [] : parseJsonl(red.text);
      if (!r.missing && isLedgerPath(path)) {
        try { appendChecks[p.id] = await repo.appendOnlyCheck(path); } catch { /* 검사 실패는 표시만 */ }
        cps[p.id] = await checkpointStatus(rawText[p.id], saved[path] || null);
      }
    }
    checksStatus = cps;
    summary = await summarize(players, recordsByPlayer, redemptionsByPlayer, { appendChecks, checkpointStatus: cps, quarantine: store.getQuarantine() });
  } catch (e) {
    lastError = `불러오기 실패: ${e.message}`;
  } finally { busy = false; render(); }
}

async function markChecked(playerId) {
  const path = `records/${playerId}.jsonl`;
  const saved = store.getAdminChecks();
  saved[path] = await checkpointFor(rawText[playerId] || '');
  store.setAdminChecks(saved);
  checksStatus[playerId] = 'ok';
  toast('확인 기준점을 저장했어요');
  render();
}

async function redeem(playerId, form) {
  try {
    const line = redemptionLine({ creds: form.creds.value, label: form.label.value, memo: form.memo.value });
    await appendRedemption(repo, playerId, line);
    toast('환전을 기록했어요');
    await loadAll();
  } catch (e) { toast(`환전 기록 실패: ${e.message}`); }
}

async function replayRound(line, q, out) {
  out.textContent = '재현 중…';
  const v = versions || {};
  const attempt = (t) => ({ cv: line.cv, gv: line.gv, c: q.c, x: t.x, f: t.f, s: t.s, a: t.a || [],
    contentSha: v.content?.[line.cv] ?? null, generatorSha: v.generator?.[line.gv] ?? null });
  const res = await askReplay(attempt(q));
  const lines = [];
  if (res.error) lines.push(`검증 불가 (${res.error})`);
  else {
    const same = res.qh === q.qh && JSON.stringify(res.oh) === JSON.stringify(q.oh);
    lines.push(`문제: ${res.text}`, ...res.options.map((o, i) => `  ${i + 1}. ${o}`), `기록 답: ${JSON.stringify(q.a)} → 재채점 ${res.ok ? '정답' : '오답'} / 기록 ok=${q.ok} ${res.ok === q.ok ? '✓' : '✗ 불일치'}`, `해시 ${same ? '일치 ✓' : '불일치 ✗'}`);
  }
  if (q.retry) {
    const r2 = await askReplay(attempt(q.retry));
    lines.push(r2.error ? `재도전 검증 불가 (${r2.error})` : `재도전: ${r2.text} → 재채점 ${r2.ok ? '정답' : '오답'} / 기록 ok=${q.retry.ok} ${r2.ok === q.retry.ok ? '✓' : '✗'}`);
  }
  out.textContent = lines.join('\n');
}

// 개발용: 로컬 데이터의 첫 카드로 현재 버전 재현이 도는지 확인
async function replaySelfTest(out) {
  out.textContent = '재현 테스트 중…';
  try {
    if (!index) {
      const zones = await (await fetch('data/zones.json')).json();
      const cards = (await Promise.all(zones.cardFiles.map((f) => fetch(`data/${f}`).then((r) => r.json())))).flat();
      index = buildIndex({ zones, cards });
    }
    const card = index.all[0];
    const x = pickHelpers({ card, form: 'mcq-data', index, rng: makeRng(1) }) || [];
    const q = generate({ card, helpers: x.map((id) => index.cards.get(id)), form: 'mcq-data', seed: 1 });
    const qh = await questionHash(q);
    const res = await askReplay({ cv: index.contentVersion, gv: GENERATOR_VERSION, c: card.id, x, f: 'mcq-data', s: 1, a: [q.answer], contentSha: null, generatorSha: null });
    out.textContent = res.error ? `실패: ${res.error}` : `qh ${res.qh === qh ? '일치' : '불일치'} · 재채점 ${res.ok ? '정답' : '오답'} · 보기 ${res.oh.length}개`;
  } catch (e) { out.textContent = `실패: ${e.message}`; }
}

function roundRow(p, line) {
  const kills = line.q.filter((x) => x.ok === true).length;
  const sec = Math.round((Date.parse(line.endedAt) - Date.parse(line.startedAt)) / 1000);
  const anoms = p.anomalies.filter((a) => a.roundId === line.id).map((a) => a.code);
  return h('details', {},
    h('summary', {}, `${String(line.startedAt).slice(0, 16).replace('T', ' ')} · ${line.zone || '전체'} · ${line.mode === 'bonus' ? '보너스' : '일반'} · 킬 ${kills}/${line.q.length} · ${fmt(line.creds)} 크레드 · ${Number.isFinite(sec) ? `${sec}초` : ''}${line.finished ? '' : ' · 이탈'}`,
      anoms.length ? h('span', { class: 'anom' }, ` ⚠ ${anoms.join(', ')}`) : null),
    line.q.map((q, i) => {
      const out = h('div', { class: 'replay-out' });
      return h('div', { class: 'q-row' },
        h('div', {}, `${i + 1}. ${q.c} · ${q.f} · ${q.ok === null ? '미응답' : q.ok ? '정답' : '오답'}${q.hint ? ' · 힌트' : ''}${q.boost ? ' · 부스트' : ''}`,
          q.retry ? ` → 재도전 ${q.retry.f} · ${q.retry.ok === null ? '미응답' : q.retry.ok ? '정답' : '오답'}${q.retry.hint ? ' · 힌트' : ''}` : ''),
        h('button', { class: 'btn small', onclick: () => replayRound(line, q, out) }, '재현'),
        out);
    }));
}

function playerSection(p) {
  const form = h('form', { class: 'redeem', onsubmit: (e) => { e.preventDefault(); redeem(p.id, e.target); } },
    h('input', { name: 'creds', type: 'number', min: '1', placeholder: '크레드', required: true }),
    h('input', { name: 'label', placeholder: '라벨 (예: VP 475)', required: true }),
    h('input', { name: 'memo', class: 'full', placeholder: '메모' }),
    h('button', { class: 'btn small full', type: 'submit' }, '환전 기록'));
  const recent = p.lines.slice(-20).reverse();
  return h('section', { class: `card ${p.test ? 'test' : ''}` },
    h('h2', {}, `${p.nick} (${p.id})${p.test ? ' — 테스트' : ''}`),
    h('p', { class: 'sub' }, `누적 ${fmt(p.earned)} · 환전 ${fmt(p.redeemed)} · 잔액 ${fmt(p.balance)} · 라운드 ${p.rounds} · 사슬 `,
      h('span', { class: p.chain.ok ? 'ok' : 'bad' }, p.chain.ok ? '정상' : `깨짐(${p.chain.breakAt})`),
      ' · 기준점 ', h('span', { class: checksStatus[p.id] === 'history-rewound' ? 'bad' : 'ok' }, checksStatus[p.id] || '없음')),
    p.anomalies.length ? h('p', { class: 'anom' }, `이상 징후: ${[...new Set(p.anomalies.map((a) => a.code))].join(', ')}`) : h('p', { class: 'ok' }, '이상 징후 없음'),
    h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => markChecked(p.id) }, '확인함(기준점 저장)')),
    h('h2', {}, '최근 라운드'),
    recent.length ? recent.map((l) => roundRow(p, l)) : h('p', { class: 'sub' }, '기록 없음'),
    h('h2', {}, '환전'), form);
}

function render() {
  const selfOut = h('span', { class: 'sub' });
  const view = h('div', { class: 'page admin' },
    h('header', { class: 'topbar' }, h('h1', { class: 'topbar-title' }, '에이스 퀘스트 보호자 페이지')),
    h('section', { class: 'card' },
      h('div', { class: 'row' },
        h('input', { type: 'password', class: 'grow', placeholder: '점수 저장소 토큰', value: token, oninput: (e) => { token = e.target.value.trim(); } }),
        h('button', { class: 'btn small', disabled: busy, onclick: loadAll }, busy ? '불러오는 중…' : '불러오기')),
      h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: remember, onchange: (e) => {
        remember = e.target.checked;
        try { if (remember) localStorage.setItem(ADMIN_TOKEN_KEY, token); else localStorage.removeItem(ADMIN_TOKEN_KEY); } catch {}
      } }), ' 이 기기에서 기억(기본은 메모리에만)'),
      lastError ? h('p', { class: 'error' }, lastError) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => replaySelfTest(selfOut) }, '재현 테스트(개발용)'), selfOut)),
    summary ? h('section', { class: 'card' },
      h('h2', {}, '요약'),
      h('table', {}, h('thead', {}, h('tr', {}, ['플레이어', '누적', '환전', '잔액', '사슬', '이상'].map((t) => h('th', {}, t)))),
        h('tbody', {}, summary.players.map((p) => h('tr', { class: p.test ? 'test' : '' },
          h('td', {}, p.nick), h('td', {}, fmt(p.earned)), h('td', {}, fmt(p.redeemed)), h('td', {}, fmt(p.balance)),
          h('td', { class: p.chain.ok ? 'ok' : 'bad' }, p.chain.ok ? '정상' : '깨짐'), h('td', {}, String(p.anomalies.length)))))),
      h('p', { class: 'sub' }, `합계(테스트 제외): 누적 ${fmt(summary.totals.earned)} · 환전 ${fmt(summary.totals.redeemed)} · 잔액 ${fmt(summary.totals.balance)}`)) : null,
    summary ? summary.players.map(playerSection) : null,
    iframe);
  mount(root, view);
}

(async () => {
  try { versions = await (await fetch('data/versions.json', { cache: 'no-cache' })).json(); } catch { versions = null; }
  render();
})();
