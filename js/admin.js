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
let lastInputs = null;
const regrades = {};
const pendingRedeem = {};
let checkFailures = {};

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
      if (isLedgerPath(path)) {
        if (r.missing) {
          // 기준점이 있는데 원장이 사라졌으면 이력 후퇴로 본다(§6.4 ⑦)
          cps[p.id] = saved[path] ? 'history-rewound' : 'unchecked';
        } else {
          try { appendChecks[p.id] = await repo.appendOnlyCheck(path); delete checkFailures[p.id]; } catch (e) { checkFailures[p.id] = e.message || '검사 실패'; }
          cps[p.id] = await checkpointStatus(rawText[p.id], saved[path] || null);
        }
      }
    }
    checksStatus = cps;
    lastInputs = { players, recordsByPlayer, redemptionsByPlayer, appendChecks, cps };
    summary = await summarize(players, recordsByPlayer, redemptionsByPlayer, { appendChecks, checkpointStatus: cps, quarantine: store.getQuarantine(), regrades });
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

// 같은 제출은 응답이 끊겨 다시 눌러도 같은 작업 id로 보내 이중 차감을 막는다
async function redeem(playerId, form, button) {
  try {
    const key = `${playerId}|${form.creds.value}|${form.label.value}|${form.memo.value}`;
    pendingRedeem[key] = pendingRedeem[key] || crypto.randomUUID();
    const line = redemptionLine({ creds: form.creds.value, label: form.label.value, memo: form.memo.value, id: pendingRedeem[key] });
    button.disabled = true;
    const r = await appendRedemption(repo, playerId, line);
    delete pendingRedeem[key];
    toast(r.skipped ? '이미 기록된 환전이에요' : '환전을 기록했어요');
    await loadAll();
  } catch (e) { button.disabled = false; toast(`환전 기록 실패: ${e.message} — 다시 누르면 같은 작업으로 재시도해요`); }
}

// 원 시도·재도전에 같은 검증: 해시 대조 + 미응답은 채점 비교 제외
function compareAttempt(res, t, label) {
  if (res.error) return { lines: [`${label}검증 불가 (${res.error})`], bad: res.error !== 'timeout' && res.error !== 'unavailable' };
  const same = res.qh === t.qh && JSON.stringify(res.oh) === JSON.stringify(t.oh);
  const lines = [`${label}문제: ${res.text}`];
  if (res.passage) lines.push(`  📜 ${res.passage}`);
  if (res.statements) lines.push(...res.statements.map((s, i) => `  ${['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'][i]}. ${s}`));
  if (res.pairs) lines.push(`  왼쪽: ${res.pairs.join(' / ')}`);
  lines.push(...res.options.map((o, i) => `  ${i + 1}. ${o}`));
  let bad = !same;
  if (t.a === null) lines.push(`  미응답 — 채점 비교 없음`);
  else { const okMatch = res.ok === t.ok; bad = bad || !okMatch; lines.push(`  기록 답 ${JSON.stringify(t.a)} → 재채점 ${res.ok ? '정답' : '오답'} / 기록 ok=${t.ok} ${okMatch ? '✓' : '✗ 불일치'}`); }
  lines.push(`  해시 ${same ? '일치 ✓' : '불일치 ✗'}`);
  return { lines, bad };
}

async function replayRound(line, q, out) {
  out.textContent = '재현 중…';
  const v = versions || {};
  const attempt = (t) => ({ cv: line.cv, gv: line.gv, c: q.c, x: t.x, f: t.f, s: t.s, a: t.a || [],
    contentSha: v.content?.[line.cv] ?? null, generatorSha: v.generator?.[line.gv] ?? null });
  const first = compareAttempt(await askReplay(attempt(q)), q, '');
  const lines = [...first.lines];
  let bad = first.bad;
  if (q.retry) {
    const second = compareAttempt(await askReplay(attempt(q.retry)), q.retry, '재도전 ');
    lines.push(...second.lines);
    bad = bad || second.bad;
  }
  out.textContent = lines.join('\n');
  // 라운드별 재채점 결과를 요약에 반영
  const prev = regrades[line.id];
  regrades[line.id] = { ok: !(bad || (prev && prev.ok === false)) };
  if (lastInputs) {
    summary = await summarize(lastInputs.players, lastInputs.recordsByPlayer, lastInputs.redemptionsByPlayer,
      { appendChecks: lastInputs.appendChecks, checkpointStatus: lastInputs.cps, quarantine: store.getQuarantine(), regrades });
    render();
  }
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
  const submitBtn = h('button', { class: 'btn small full', type: 'submit' }, '환전 기록');
  const form = h('form', { class: 'redeem', onsubmit: (e) => { e.preventDefault(); redeem(p.id, e.target, submitBtn); } },
    h('input', { name: 'creds', type: 'number', min: '1', placeholder: '크레드', required: true }),
    h('input', { name: 'label', placeholder: '라벨 (예: VP 475)', required: true }),
    h('input', { name: 'memo', class: 'full', placeholder: '메모' }),
    submitBtn);
  const recent = p.lines.slice(-20).reverse();
  return h('section', { class: `card ${p.test ? 'test' : ''}` },
    h('h2', {}, `${p.nick} (${p.id})${p.test ? ' — 테스트' : ''}`),
    h('p', { class: 'sub' }, `누적 ${fmt(p.earned)} · 환전 ${fmt(p.redeemed)} · 잔액 ${fmt(p.balance)} · 라운드 ${p.rounds} · 사슬 `,
      h('span', { class: p.chain.ok ? 'ok' : 'bad' }, p.chain.ok ? '정상' : `깨짐(${p.chain.breakAt})`),
      ' · 기준점 ', h('span', { class: checksStatus[p.id] === 'history-rewound' ? 'bad' : 'ok' }, checksStatus[p.id] || '없음'),
      checkFailures[p.id] ? h('span', { class: 'bad' }, ` · 추가 전용 검사 실패(검증 불가): ${checkFailures[p.id]}`) : null),
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
