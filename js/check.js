import { makeRng } from './rng.js';
import { allowedCards, eligibleForms, matchGroups, pickHelpers } from './content.js';
import { generate, displayedTexts, canonicalAnswer } from './questions/index.js';

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const SIZE = { 'mcq-data': 4, 'mcq-combo': 4, 'mcq-sent': 4, 'mcq-neg': 4, ox: 2, blank: 4, order: 4, match: 3 };

// 모든 카드 × 자격 form × seed 1..N 전수 생성 검사(설계 §4.2)
export function exhaustiveCheck(index, { seeds = 50 } = {}) {
  const errors = [];
  let generated = 0;
  for (const card of index.all) {
    if (card.retired) continue;
    const allowedIds = new Set(allowedCards(card, index).map((c) => c.id));
    for (const form of eligibleForms(card, index)) {
      for (let seed = 1; seed <= seeds; seed++) {
        const tag = `${card.id} ${form} seed ${seed}`;
        const x = pickHelpers({ card, form, index, rng: makeRng(seed) });
        if (!x) { errors.push(`${tag}: helpers 없음`); continue; }
        if (form !== 'order' && !x.every((id) => allowedIds.has(id))) errors.push(`${tag}: 허용 관계 밖 보조 카드 ${x}`);
        if (form === 'match') {
          const g = [card.id, ...x].sort().join();
          if (!matchGroups(card, index).some((grp) => grp.join() === g)) errors.push(`${tag}: match 묶음이 양방향 허용이 아님`);
        }
        let q;
        try { q = generate({ card, helpers: x.map((id) => index.cards.get(id)), form, seed }); } catch (e) { errors.push(`${tag}: 생성 실패 ${e.message}`); continue; }
        generated++;
        const texts = displayedTexts(q);
        if (texts.length !== SIZE[form]) errors.push(`${tag}: 보기 수 ${texts.length}`);
        if (new Set(texts.map(norm)).size !== texts.length) errors.push(`${tag}: 보기 중복`);
        if (form.startsWith('mcq') && form !== 'mcq-combo' || form === 'blank') {
          const ans = norm(texts[q.answer]);
          const dup = texts.filter((t, i) => i !== q.answer && norm(t) === ans);
          if (dup.length) errors.push(`${tag}: 정답 텍스트가 오답에도 있음`);
          if (form !== 'mcq-neg' && form !== 'blank') {
            const wrongs = texts.filter((_, i) => i !== q.answer).map(norm);
            const trues = card.true.map(norm);
            if (wrongs.some((w) => trues.includes(w))) errors.push(`${tag}: 주 카드의 참 진술이 오답에 있음`);
          }
        }
        if (form === 'mcq-combo') {
          const trues = card.true.map(norm);
          const wrongs = q.statements.map(norm).filter((s) => !trues.includes(s));
          if (wrongs.length !== 2) errors.push(`${tag}: 조합형 참 진술 수 ${4 - wrongs.length}`);
        }
        canonicalAnswer(q);
      }
    }
  }
  return { errors, generated };
}
