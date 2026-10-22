import { sha256Hex, short } from './hash.js';
import { verifyChain, deriveState, checkRules } from './records.js';

export const TEST_PLAYER = 'p0-test';
export const isLedgerPath = (path) => /^records\/[^/]+\.jsonl$/.test(path);

// 플레이어별 집계와 이상 징후(설계 §6.4). extras는 관리 페이지가 따로 모은 검사 결과
export async function summarize(players, recordsByPlayer, redemptionsByPlayer = {}, extras = {}) {
  const { appendChecks = {}, checkpointStatus: cps = {}, quarantine = [], regrades = {} } = extras;
  const qIds = new Set(quarantine.map((q) => q.id));
  const out = [];
  for (const p of players) {
    const lines = recordsByPlayer[p.id] || [];
    const red = redemptionsByPlayer[p.id] || [];
    const chain = await verifyChain(lines);
    const st = deriveState(lines, red);
    const anomalies = [];
    if (!chain.ok) anomalies.push({ roundId: lines[chain.breakAt]?.id ?? null, code: 'chain-break' });
    for (const l of lines) {
      for (const code of checkRules(l)) anomalies.push({ roundId: l.id, code });
      if (qIds.has(l.id)) anomalies.push({ roundId: l.id, code: 'quarantine' });
      if (regrades[l.id] && regrades[l.id].ok === false) anomalies.push({ roundId: l.id, code: 'regrade' });
    }
    for (const q of quarantine) if (q.player === p.id || (q.a?.player === p.id)) if (!lines.some((l) => l.id === q.id)) anomalies.push({ roundId: q.id, code: 'quarantine' });
    const ac = appendChecks[p.id];
    if (ac) {
      if (ac.commits.some((c) => c.deletions > 0)) anomalies.push({ roundId: null, code: 'deletions' });
      if (ac.prefixOk === false) anomalies.push({ roundId: null, code: 'prefix' });
    }
    if (cps[p.id] === 'history-rewound') anomalies.push({ roundId: null, code: 'history-rewound' });
    out.push({ id: p.id, nick: p.nick, test: p.id === TEST_PLAYER, earned: st.earned, redeemed: st.redeemed, balance: st.balance,
      chain, rounds: st.rounds, anomalies, lines, exchange: p.exchange || null });
  }
  const real = out.filter((p) => !p.test);
  const totals = { earned: real.reduce((s, p) => s + p.earned, 0), redeemed: real.reduce((s, p) => s + p.redeemed, 0), balance: real.reduce((s, p) => s + p.balance, 0) };
  return { players: out, totals };
}

// 샌드박스 응답 검증: source·요청 id·스키마(설계 §6.4)
export function acceptReply(event, iframeWindow, pendingIds) {
  if (!event || event.source !== iframeWindow) return false;
  const d = event.data;
  if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !pendingIds.has(d.id)) return false;
  if (typeof d.error === 'string') return true;
  const optArr = (v) => v === undefined || v === null || Array.isArray(v);
  const optStr = (v) => v === undefined || v === null || typeof v === 'string';
  return typeof d.qh === 'string' && Array.isArray(d.oh) && typeof d.ok === 'boolean'
    && optStr(d.passage) && optArr(d.statements) && optArr(d.pairs) && optArr(d.options);
}

const firstLines = (text, n) => text.split('\n').filter((s) => s.trim()).slice(0, n);

export async function checkpointFor(text, checkedAt = new Date().toISOString()) {
  const lines = firstLines(text, Infinity);
  return { lineCount: lines.length, prefixHash: short(await sha256Hex(lines.join('\n')), 16), checkedAt };
}

export async function checkpointStatus(currentText, saved) {
  if (!saved) return 'unchecked';
  const lines = firstLines(currentText, saved.lineCount);
  if (lines.length < saved.lineCount) return 'history-rewound';
  const h = short(await sha256Hex(lines.join('\n')), 16);
  return h === saved.prefixHash ? 'ok' : 'history-rewound';
}

export function redemptionLine({ creds, label, memo = '', ts = new Date().toISOString(), id = globalThis.crypto.randomUUID() }) {
  const n = Number(creds);
  if (!Number.isInteger(n) || n <= 0) throw new Error('크레드는 1 이상의 정수');
  if (!label || !String(label).trim()) throw new Error('라벨이 필요합니다');
  return { id, ts, creds: n, label: String(label).trim(), memo: String(memo || '') };
}

// 환전 기록 추가: 해시 사슬 없이 GET→PUT. 같은 작업 id가 이미 있으면 다시 쓰지 않는다(응답 유실 뒤 재시도 안전)
export async function appendRedemption(repo, playerId, line) {
  const path = `redemptions/${playerId}.jsonl`;
  const r = await repo.readRaw(path);
  const text = r.missing ? '' : r.text;
  const exists = text.split('\n').filter((s) => s.trim()).some((s) => { try { return JSON.parse(s).id === line.id; } catch { return false; } });
  if (exists) return { ...line, skipped: true };
  const prefix = text === '' || text.endsWith('\n') ? text : `${text}\n`;
  await repo.writeFile(path, `${prefix}${JSON.stringify(line)}\n`, { sha: r.missing ? undefined : r.sha, message: `redeem ${playerId}` });
  return { ...line, skipped: false };
}
