import { eligibleForms, pickHelpers, targetsOf } from './content.js';
import { generate, questionKey, isMcqForm } from './questions/index.js';
import { isNegativeFixed } from './fixed.js';

export const SIZE = { normal: 5, bonus: 8 };
const MCQ_MIN = { normal: 3, bonus: 5 };
const NEG_MAX = { normal: 1, bonus: 2 };
const seed32 = (rng) => Math.floor(rng() * 2 ** 32);
const isMcqType = (t) => t === 'mcq' || t === 'blank';

// 가중 무작위(비복원): weight = 1/(1+숙련도)
function weightedSample(targets, mastery, n, rng) {
  const pool = targets.map((t) => ({ t, w: 1 / (1 + (mastery.get(t.id) || 0)) }));
  const out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = rng() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r < 0) break; }
    out.push(pool.splice(i, 1)[0].t);
  }
  return out;
}

// recent(최신이 앞)를 제외하되 후보가 size보다 적으면 오래된 것부터 다시 허용
function candidates(all, recent, size) {
  let keep = recent.slice();
  let pool = all.filter((t) => !keep.includes(t.id));
  while (pool.length < size && keep.length) {
    keep = keep.slice(0, -1);
    pool = all.filter((t) => !keep.includes(t.id));
  }
  return pool;
}

function chooseForm(forms, { needMcq, negLeft }, rng) {
  const mcq = forms.filter((f) => isMcqForm(f) && (f !== 'mcq-neg' || negLeft > 0));
  const other = forms.filter((f) => !isMcqForm(f));
  const pickFrom = (list) => list[Math.floor(rng() * list.length)];
  if (needMcq && mcq.length) return pickFrom(mcq);
  if (!needMcq && other.length) return pickFrom(other);
  if (mcq.length) return pickFrom(mcq);
  return pickFrom(forms.filter((f) => f !== 'mcq-neg' || negLeft > 0)) ?? forms[0];
}

// 진행 중 라운드에서 이미 표시된 고정 문항(qh가 붙은 시도)
export function seenInRound(round) {
  const m = new Map();
  for (const q of round?.q || []) for (const t of [q, q.retry]) if (t && t.f === 'fixed' && t.fq && t.qh) m.set(t.fq, (m.get(t.fq) || 0) + 1);
  return m;
}

// 개념의 문항 중 (본 횟수, fq) 오름차순 최소 묶음에서 seed로 하나(설계 v2 §3.3)
export function pickFixedQuestion({ concept, seen = new Map(), rng, exclude = null, filter = null }) {
  let pool = concept.questions.filter((q) => q.id !== exclude && (!filter || filter(q)));
  if (!pool.length) pool = concept.questions.filter((q) => !filter || filter(q));
  if (!pool.length) return null;
  const count = (q) => seen.get(q.id) || 0;
  const min = Math.min(...pool.map(count));
  const ties = pool.filter((q) => count(q) === min).sort((a, b) => (a.id < b.id ? -1 : 1));
  return ties[Math.floor(rng() * ties.length)].id;
}

function allTargets({ index, fixedIndex, zone }) {
  if (zone) return targetsOf(zone, { index, fixedIndex });
  const examZones = (index.zones || []).filter((z) => (z.group || 'exam') === 'exam');
  return examZones.flatMap((z) => targetsOf(z.id, { index, fixedIndex }));
}

export function drawRound({ index, fixedIndex = null, zone, mode, mastery = new Map(), recent = [], seen = new Map(), rng, cv, gv }) {
  const all = allTargets({ index, fixedIndex, zone });
  const size = Math.min(SIZE[mode], all.length);
  const targets = weightedSample(candidates(all, recent, size), mastery, size, rng);
  const mcqMin = Math.min(MCQ_MIN[mode], size);
  let mcqCount = 0;
  let negLeft = NEG_MAX[mode];
  const q = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const slotsLeft = targets.length - i;
    const needMcq = (mcqCount < mcqMin && (mcqMin - mcqCount) >= slotsLeft) || (mcqCount < mcqMin && rng() < 0.7);
    if (t.kind === 'concept') {
      // 유형 할당이 먼저, 그 안에서 미출제 우선
      const wantMcq = (qq) => isMcqType(qq.type) && (!isNegativeFixed(qq) || negLeft > 0);
      const wantOther = (qq) => !isMcqType(qq.type);
      let fq = pickFixedQuestion({ concept: t.concept, seen, rng, filter: needMcq ? wantMcq : wantOther });
      if (!fq) fq = pickFixedQuestion({ concept: t.concept, seen, rng, filter: (qq) => !isNegativeFixed(qq) || negLeft > 0 });
      if (!fq) fq = pickFixedQuestion({ concept: t.concept, seen, rng });
      const qq = t.concept.questions.find((x) => x.id === fq);
      if (isMcqType(qq.type)) mcqCount++;
      if (isNegativeFixed(qq)) negLeft--;
      q.push({ c: t.id, x: [], f: 'fixed', s: seed32(rng), fq });
      continue;
    }
    const card = t.card;
    const forms = eligibleForms(card, index);
    if (!forms.length) continue;
    const f = chooseForm(forms, { needMcq, negLeft }, rng);
    if (f === 'mcq-neg') negLeft--;
    if (isMcqForm(f)) mcqCount++;
    const x = pickHelpers({ card, form: f, index, rng });
    q.push({ c: card.id, x, f, s: seed32(rng) });
  }
  // 선다형이 모자라면 바꿀 수 있는 자리를 선다형으로 바꾼다
  for (let i = 0; i < q.length && mcqCount < mcqMin; i++) {
    if (q[i].f === 'fixed') {
      const concept = fixedIndex.concepts.get(q[i].c);
      const cur = concept.questions.find((x) => x.id === q[i].fq);
      if (isMcqType(cur.type)) continue;
      const alt = pickFixedQuestion({ concept, seen, rng, filter: (qq) => isMcqType(qq.type) && !isNegativeFixed(qq) });
      if (alt) { q[i].fq = alt; mcqCount++; }
      continue;
    }
    if (isMcqForm(q[i].f)) continue;
    const card = index.cards.get(q[i].c);
    const mcq = eligibleForms(card, index).filter((f) => isMcqForm(f) && f !== 'mcq-neg');
    if (!mcq.length) continue;
    q[i].f = mcq[Math.floor(rng() * mcq.length)];
    q[i].x = pickHelpers({ card, form: q[i].f, index, rng });
    mcqCount++;
  }
  return { mode, zone: zone ?? null, cv, gv, q };
}

export function drawRetry({ card = null, concept = null, index, fixedIndex = null, prev, prevPlan, seen = new Map(), rng }) {
  if (prevPlan.f === 'fixed') {
    const fq = pickFixedQuestion({ concept, seen, rng, exclude: prevPlan.fq });
    if (fq && fq !== prevPlan.fq) return { f: 'fixed', s: seed32(rng), x: [], fq, same: false };
    let s = seed32(rng);
    if (s === prevPlan.s) s = seed32(rng);
    return { f: 'fixed', s, x: [], fq: prevPlan.fq, same: true };
  }
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
