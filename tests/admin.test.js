import { test, eq, ok } from './harness.js';
import { chain, toLine } from '../js/records.js';
import { newRound, answer, finishRound } from '../js/game.js';
import { summarize, acceptReply, checkpointFor, checkpointStatus, isLedgerPath, redemptionLine, appendRedemption } from '../js/admin-core.js';

const OX = { form: 'ox', text: 't', options: [{ text: 'O' }, { text: 'X' }], answer: 0 };
const plan = (n) => ({ mode: 'normal', zone: 'Z1', cv: 'test.1', gv: '1', q: Array.from({ length: n }, (_, i) => ({ c: `c010${i + 1}`, x: [], f: 'ox', s: i })) });
function round(id, player) {
  let r = newRound(plan(5), { id, player, agent: 'jett', startedAt: '2026-10-25T10:00:00+09:00' });
  for (let i = 0; i < 5; i++) r = answer(r, i, [0], OX);
  return toLine(finishRound(r, { endedAt: '2026-10-25T10:03:00+09:00', rng: () => 0 }));
}
const players = [{ id: 'p1', nick: '첫째' }, { id: 'p0-test', nick: '테스트' }];

test('summarize: 테스트 플레이어는 합계 제외, 잔액은 환전 차감', async () => {
  const lines1 = await chain([round('a', 'p1'), round('b', 'p1')]);
  const lines0 = await chain([round('t', 'p0-test')]);
  const s = await summarize(players, { p1: lines1, 'p0-test': lines0 }, { p1: [{ ts: 'x', creds: 100, label: 'VP', memo: '' }] });
  const p1 = s.players.find((p) => p.id === 'p1');
  eq([p1.earned, p1.redeemed, p1.balance, p1.rounds, p1.chain.ok, p1.test], [700, 100, 600, 2, true, false]);
  ok(s.players.find((p) => p.id === 'p0-test').test);
  eq(s.totals, { earned: 700, redeemed: 100, balance: 600 });
});

test('summarize: 사슬이 깨지면 chain.ok false, 규칙 위반 줄은 anomaly', async () => {
  const lines = await chain([round('a', 'p1'), round('b', 'p1')]);
  lines[1] = { ...lines[1], creds: 9999 };
  const s = await summarize(players.slice(0, 1), { p1: lines }, {});
  const p1 = s.players[0];
  eq(p1.chain, { ok: false, breakAt: 1 });
  ok(p1.anomalies.some((a) => a.roundId === 'b' && a.code === 'creds-sum'));
  ok(p1.anomalies.some((a) => a.code === 'chain-break'));
});

test('summarize: appendOnly·checkpoint·격리·재채점 결과를 anomaly로 합친다', async () => {
  const lines = await chain([round('a', 'p1')]);
  const s = await summarize(players.slice(0, 1), { p1: lines }, {}, {
    appendChecks: { p1: { commits: [{ sha: 'c2', deletions: 3 }, { sha: 'c1', deletions: 0 }], prefixOk: false } },
    checkpointStatus: { p1: 'history-rewound' },
    quarantine: [{ id: 'a' }],
    regrades: { a: { ok: false } },
  });
  const codes = s.players[0].anomalies.map((a) => a.code);
  for (const c of ['deletions', 'prefix', 'history-rewound', 'quarantine', 'regrade']) ok(codes.includes(c), c);
});

test('acceptReply: source·id·스키마를 검사한다', () => {
  const win = {};
  const pending = new Set(['r1']);
  ok(acceptReply({ source: win, data: { id: 'r1', qh: 'a'.repeat(16), oh: ['x'], ok: true, text: 't', options: [] } }, win, pending));
  ok(acceptReply({ source: win, data: { id: 'r1', error: 'unavailable' } }, win, pending));
  ok(!acceptReply({ source: {}, data: { id: 'r1', error: 'unavailable' } }, win, pending), '다른 source');
  ok(!acceptReply({ source: win, data: { id: 'zz', error: 'unavailable' } }, win, pending), '모르는 id');
  ok(!acceptReply({ source: win, data: { id: 'r1', qh: 5 } }, win, pending), '스키마 불일치');
  ok(!acceptReply({ source: win, data: 'string' }, win, pending));
});

test('checkpointFor / checkpointStatus', async () => {
  const text = 'l1\nl2\nl3\n';
  const saved = await checkpointFor(text, '2026-10-26T00:00:00+09:00');
  eq(saved.lineCount, 3); eq(saved.prefixHash.length, 16);
  eq(await checkpointStatus(text + 'l4\n', saved), 'ok');
  eq(await checkpointStatus('l1\nl2\n', saved), 'history-rewound', '줄 수 감소');
  eq(await checkpointStatus('l1\nXX\nl3\nl4\n', saved), 'history-rewound', '접두부 변경');
  eq(await checkpointStatus(text, null), 'unchecked');
});

test('isLedgerPath: 기록 파일만', () => {
  ok(isLedgerPath('records/p1.jsonl'));
  ok(!isLedgerPath('players.json'));
  ok(!isLedgerPath('redemptions/p1.jsonl'));
});

test('redemptionLine', () => {
  eq(redemptionLine({ creds: 1000, label: 'VP 475', memo: '', ts: 'T', id: 'op-1' }), { id: 'op-1', ts: 'T', creds: 1000, label: 'VP 475', memo: '' });
  ok(typeof redemptionLine({ creds: 1, label: 'x' }).id === 'string', 'id 자동 생성');
  let threw = false; try { redemptionLine({ creds: 0, label: '', ts: 'T' }); } catch { threw = true; }
  ok(threw, '크레드 0·라벨 없음은 거부');
});

test('#9 appendRedemption은 같은 id를 두 번 추가하지 않는다', async () => {
  const files = {};
  const repo = {
    readRaw: async (path) => (path in files ? { sha: 's', text: files[path] } : { missing: true }),
    writeFile: async (path, text) => { files[path] = text; return { sha: 's2' }; },
  };
  const line = redemptionLine({ creds: 1000, label: 'VP 475', ts: 'T', id: 'op-1' });
  eq(await appendRedemption(repo, 'p1', line), { ...line, skipped: false });
  eq(await appendRedemption(repo, 'p1', line), { ...line, skipped: true });
  eq(files['redemptions/p1.jsonl'].trim().split('\n').length, 1);
});

test('acceptReply는 선택 필드(passage·statements·pairs)를 허용한다', () => {
  const win = {};
  ok(acceptReply({ source: win, data: { id: 'r1', qh: 'a'.repeat(16), oh: ['x'], ok: true, text: 't', options: [], passage: 'p', statements: ['s'], pairs: [['l', 'r']] } }, win, new Set(['r1'])));
  ok(!acceptReply({ source: win, data: { id: 'r1', qh: 'a'.repeat(16), oh: ['x'], ok: true, text: 't', options: [], statements: 'bad' } }, win, new Set(['r1'])));
});
