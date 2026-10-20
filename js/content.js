import { pick, pickN } from './rng.js';

export const FORMS = ['mcq-data', 'mcq-combo', 'mcq-sent', 'mcq-neg', 'ox', 'blank', 'order', 'match'];
const ID_RE = /^c\d{4}$/;
const REQUIRED = ['id', 'zone', 'section', 'ref', 'subject', 'terms', 'scene', 'true', 'false', 'distractors', 'hint'];

export function buildIndex({ zones, cards }) {
  const map = new Map();
  const byZone = new Map();
  for (const z of zones.zones) byZone.set(z.id, []);
  for (const c of cards) {
    map.set(c.id, c);
    if (!c.retired && byZone.has(c.zone)) byZone.get(c.zone).push(c);
  }
  return { contentVersion: zones.contentVersion, zones: zones.zones, cards: map, byZone, all: cards.slice() };
}

export function allowedCards(card, index) {
  return (card.distractors || []).map((id) => index.cards.get(id)).filter((c) => c && !c.retired);
}

const zoneCards = (card, index) => (index.byZone.get(card.zone) || []).filter((c) => c.id !== card.id);

// 주 카드를 포함한 3장 조합 가운데 모든 순서쌍이 서로를 허용하고 terms[0]이 모두 다른 것(정렬된 id)
export function matchGroups(card, index) {
  const allows = (a, b) => (a.distractors || []).includes(b.id) && !b.retired;
  const cands = allowedCards(card, index).filter((b) => allows(b, card));
  const out = [];
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const b = cands[i], c = cands[j];
      if (!allows(b, c) || !allows(c, b)) continue;
      const terms = new Set([card.terms[0], b.terms[0], c.terms[0]]);
      if (terms.size !== 3) continue;
      out.push([card.id, b.id, c.id].sort());
    }
  }
  return out;
}

// form별 보조 카드 선택의 유일한 구현(설계 §4.2). 후보가 부족하면 null.
export function pickHelpers({ card, form, index, rng }) {
  const allowed = allowedCards(card, index);
  const take = (pool, n) => (pool.length < n ? null : pickN(pool, n, rng).map((c) => c.id));
  switch (form) {
    case 'mcq-data':
    case 'mcq-sent':
      return take(allowed, Math.max(1, 3 - Math.min(2, card.false.length)));
    case 'mcq-neg':
      return card.false.length ? [] : take(allowed, 1);
    case 'mcq-combo':
      return take(allowed, 2 - Math.min(1, card.false.length));
    case 'ox':
      return card.false.length ? [] : take(allowed, 1);
    case 'blank': {
      if (!card.blank) return null;
      return take(allowed.filter((c) => c.terms[0] !== card.blank.answer), 3);
    }
    case 'order': {
      if (!Number.isInteger(card.year)) return null;
      const seen = new Set([card.year]);
      const pool = [];
      for (const c of zoneCards(card, index)) {
        if (!Number.isInteger(c.year) || seen.has(c.year)) continue;
        pool.push(c);
      }
      // 연도가 서로 다른 3장: 후보를 섞은 뒤 연도 중복 없이 앞에서 채운다
      const shuffled = pickN(pool, pool.length, rng);
      const out = [];
      for (const c of shuffled) {
        if (seen.has(c.year)) continue;
        seen.add(c.year); out.push(c.id);
        if (out.length === 3) break;
      }
      return out.length === 3 ? out : null;
    }
    case 'match': {
      const groups = matchGroups(card, index);
      if (!groups.length) return null;
      return pick(groups, rng).filter((id) => id !== card.id);
    }
    default:
      return null;
  }
}

export function eligibleForms(card, index) {
  // seed 1의 난수로 후보 충분 여부만 본다(후보 수는 seed와 무관)
  const probe = () => 0.5;
  return FORMS.filter((form) => {
    if (form === 'mcq-data' && !card.passage) return false;
    if (form === 'mcq-neg' && card.true.length < 3) return false;
    if (form === 'mcq-combo' && card.true.length < 2) return false;
    return pickHelpers({ card, form, index, rng: probe }) !== null;
  });
}

function pageNums(ref) {
  return String(ref).split(/[~,\-]/).map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
}

function strings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}

export function validateCards(raw, { bannedTerms = [], pageRange = [178, 213] } = {}) {
  const errors = [];
  const warnings = [];
  const zoneById = new Map(raw.zones.zones.map((z) => [z.id, z]));
  const cards = raw.cards;
  const ids = new Set();
  for (const c of cards) {
    const tag = c.id || '(id 없음)';
    for (const k of REQUIRED) if (c[k] === undefined) errors.push(`${tag}: 필수 키 ${k} 없음`);
    if (!ID_RE.test(String(c.id))) errors.push(`${tag}: id 형식`);
    if (ids.has(c.id)) errors.push(`${tag}: id 중복`);
    ids.add(c.id);
    const z = zoneById.get(c.zone);
    if (!z) { errors.push(`${tag}: zone ${c.zone} 없음`); continue; }
    if (!z.sections.some((s) => s.n === c.section)) errors.push(`${tag}: section ${c.section} 없음`);
    const [lo, hi] = pageNums(z.pages);
    const nums = pageNums(c.ref);
    if (!nums.length || nums.some((n) => n < lo || n > hi || n < pageRange[0] || n > pageRange[1])) errors.push(`${tag}: ref ${c.ref}가 지역 쪽 범위 ${z.pages} 밖`);
    if (typeof c.scene !== 'string' || !c.scene.includes('{agent}')) errors.push(`${tag}: scene에 {agent} 없음`);
    if (!Array.isArray(c.true) || c.true.length < 3) errors.push(`${tag}: true 진술 3개 미만`);
    else if (c.true.length < 4) warnings.push(`${tag}: true 진술이 4개 미만(부정형 5지 불가)`);
    if (!Array.isArray(c.false) || c.false.length < 2) errors.push(`${tag}: false 진술 2개 미만`);
    if (!Array.isArray(c.terms) || !c.terms.length) errors.push(`${tag}: terms 없음`);
    for (const d of c.distractors || []) {
      if (d === c.id) errors.push(`${tag}: distractors에 자기 자신`);
    }
    for (const s of strings(c)) for (const b of bannedTerms) if (b && s.includes(b)) errors.push(`${tag}: 금지어 "${b}" 포함 — ${s}`);
  }
  const index = buildIndex(raw);
  for (const c of cards) {
    if (!zoneById.has(c.zone)) continue;
    for (const d of c.distractors || []) {
      const other = index.cards.get(d);
      if (!other) errors.push(`${c.id}: distractors의 ${d} 없음`);
      else if (other.zone !== c.zone) errors.push(`${c.id}: distractors의 ${d}가 다른 지역`);
    }
  }
  for (const [zid, list] of index.byZone) {
    const seen = new Map();
    for (const c of list) {
      const t = c.terms?.[0];
      if (seen.has(t)) errors.push(`${c.id}: terms[0] "${t}"가 ${seen.get(t)}와 중복 (${zid})`);
      seen.set(t, c.id);
    }
  }
  const stmt = new Map();
  for (const c of cards) {
    for (const s of [...(c.true || []), ...(c.false || [])]) {
      if (stmt.has(s)) errors.push(`${c.id}: 진술이 ${stmt.get(s)}와 중복 — ${s}`);
      stmt.set(s, c.id);
    }
  }
  for (const c of index.all) {
    if (c.retired || !zoneById.has(c.zone)) continue;
    if (!eligibleForms(c, index).length) errors.push(`${c.id}: 자격 있는 form 없음`);
  }
  return { errors, warnings };
}
