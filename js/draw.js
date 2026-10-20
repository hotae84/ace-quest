import { eligibleForms, pickHelpers } from './content.js';
import { generate, questionKey } from './questions/index.js';

export const SIZE = { normal: 5, bonus: 8 };
const MCQ_MIN = { normal: 3, bonus: 5 };
const NEG_MAX = { normal: 1, bonus: 2 };
const isMcq = (f) => f.startsWith('mcq');
const seed32 = (rng) => Math.floor(rng() * 2 ** 32);

// 가중 무작위(비복원): weight = 1/(1+숙련도)
function weightedSample(cards, mastery, n, rng) {
  const pool = cards.map((c) => ({ c, w: 1 / (1 + (mastery.get(c.id) || 0)) }));
  const out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = rng() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r < 0) break; }
    out.push(pool.splice(i, 1)[0].c);
  }
  return out;
}

// recent(최신이 앞)를 제외하되 후보가 size보다 적으면 오래된 것부터 다시 허용
function candidates(all, recent, size) {
  let keep = recent.slice();
  let pool = all.filter((c) => !keep.includes(c.id));
  while (pool.length < size && keep.length) {
    keep = keep.slice(0, -1);
    pool = all.filter((c) => !keep.includes(c.id));
  }
  return pool;
}

function chooseForm(forms, { needMcq, negLeft }, rng) {
  const mcq = forms.filter((f) => isMcq(f) && (f !== 'mcq-neg' || negLeft > 0));
  const other = forms.filter((f) => !isMcq(f));
  const pickFrom = (list) => list[Math.floor(rng() * list.length)];
  if (needMcq && mcq.length) return pickFrom(mcq);
  if (!needMcq && other.length) return pickFrom(other);
  if (mcq.length) return pickFrom(mcq);
  return pickFrom(forms.filter((f) => f !== 'mcq-neg' || negLeft > 0)) ?? forms[0];
}

export function drawRound({ index, zone, mode, mastery = new Map(), recent = [], rng, cv, gv }) {
  const all = zone ? (index.byZone.get(zone) || []) : index.all.filter((c) => !c.retired);
  const size = Math.min(SIZE[mode], all.length);
  const cards = weightedSample(candidates(all, recent, size), mastery, size, rng);
  const mcqMin = Math.min(MCQ_MIN[mode], size);
  let mcqCount = 0;
  let negLeft = NEG_MAX[mode];
  const q = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const forms = eligibleForms(card, index);
    if (!forms.length) continue;
    const slotsLeft = cards.length - i;
    const needMcq = mcqCount < mcqMin && (mcqMin - mcqCount) >= slotsLeft;
    let f = chooseForm(forms, { needMcq: needMcq || (mcqCount < mcqMin && rng() < 0.7), negLeft }, rng);
    if (f === 'mcq-neg') negLeft--;
    if (isMcq(f)) mcqCount++;
    const x = pickHelpers({ card, form: f, index, rng });
    q.push({ c: card.id, x, f, s: seed32(rng) });
  }
  // 선다형이 모자라면 바꿀 수 있는 자리를 선다형으로 바꾼다
  for (let i = 0; i < q.length && mcqCount < mcqMin; i++) {
    if (isMcq(q[i].f)) continue;
    const card = index.cards.get(q[i].c);
    const mcq = eligibleForms(card, index).filter((f) => isMcq(f) && f !== 'mcq-neg');
    if (!mcq.length) continue;
    q[i].f = mcq[Math.floor(rng() * mcq.length)];
    q[i].x = pickHelpers({ card, form: q[i].f, index, rng });
    mcqCount++;
  }
  return { mode, zone: zone ?? null, cv, gv, q };
}

export function drawRetry({ card, index, prev, prevPlan, rng }) {
  const forms = eligibleForms(card, index);
  const others = forms.filter((f) => f !== prevPlan.f);
  const order = others.length ? others.slice().sort(() => rng() - 0.5) : [prevPlan.f];
  const prevKey = questionKey(prev);
  let last = null;
  for (const f of order) {
    for (let t = 0; t < 10; t++) {
      const s = seed32(rng);
      const x = pickHelpers({ card, form: f, index, rng });
      if (!x) break;
      const q = generate({ card, helpers: x.map((id) => index.cards.get(id)), form: f, seed: s });
      last = { f, s, x, same: false };
      if (questionKey(q) !== prevKey) return last;
    }
  }
  return last ? { ...last, same: true } : { ...prevPlan, same: true };
}
