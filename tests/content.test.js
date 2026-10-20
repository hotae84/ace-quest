import { test, eq, ok } from './harness.js';
import { makeRng } from '../js/rng.js';
import { buildIndex, FORMS, eligibleForms, allowedCards, pickHelpers, matchGroups, validateCards } from '../js/content.js';
import { zones, cards, clone } from './fixture.js';

const index = buildIndex({ zones, cards });
const c = (id) => index.cards.get(id);
const opts = { bannedTerms: ['사파비'], pageRange: [178, 213] };

test('buildIndex는 카드·지역 색인을 만든다', () => {
  eq(index.contentVersion, 'test.1');
  eq(index.cards.size, 6);
  eq(index.byZone.get('Z1').length, 6);
  eq(index.all.length, 6);
});

test('buildIndex는 retired 카드를 byZone에서 뺀다', () => {
  const cs = clone(cards); cs[5].retired = true;
  const ix = buildIndex({ zones, cards: cs });
  eq(ix.byZone.get('Z1').length, 5);
  ok(ix.cards.has('c0106'), '재생성용으로 cards에는 남는다');
});

test('FORMS는 8개', () => { eq(FORMS.length, 8); ok(FORMS.includes('mcq-neg')); });

test('c0101은 모든 form 자격', () => { eq(eligibleForms(c('c0101'), index).slice().sort(), FORMS.slice().sort()); });

test('passage·blank 없는 카드는 mcq-data·blank 자격 없음', () => {
  const f = eligibleForms(c('c0105'), index);
  ok(!f.includes('mcq-data')); ok(!f.includes('blank')); ok(f.includes('ox'));
});

test('true가 2개인 카드는 mcq-neg 자격 없음', () => {
  const two = clone(c('c0106')); two.true = two.true.slice(0, 2);
  ok(!eligibleForms(two, index).includes('mcq-neg'));
  ok(eligibleForms(c('c0106'), index).includes('mcq-neg'), 'true 3개면 자격 있음');
});

test('allowedCards는 distractors 순서대로, 존재하는 카드만', () => {
  eq(allowedCards(c('c0101'), index).map((x) => x.id), ['c0102', 'c0103', 'c0104']);
});

test('matchGroups는 양방향 허용 3장만', () => {
  const g = matchGroups(c('c0101'), index);
  ok(g.some((x) => x.join() === 'c0101,c0102,c0103'), '상호 묶음 포함');
  ok(!g.some((x) => x.includes('c0104')), '한 방향만 허용된 c0104 미포함');
});

test('pickHelpers(blank)는 정답과 다른 terms[0] 3장', () => {
  const x = pickHelpers({ card: c('c0101'), form: 'blank', index, rng: makeRng(1) });
  eq(x.length, 3);
  ok(x.every((id) => c(id).terms[0] !== '용어1'));
});

test('pickHelpers(order)는 서로 다른 연도 3장', () => {
  const x = pickHelpers({ card: c('c0101'), form: 'order', index, rng: makeRng(1) });
  eq(x.length, 3);
  const ys = x.map((id) => c(id).year);
  eq(new Set([1914, ...ys]).size, 4);
});

test('pickHelpers(mcq-data)는 false 2개 카드에서 1장', () => {
  const x = pickHelpers({ card: c('c0101'), form: 'mcq-data', index, rng: makeRng(1) });
  eq(x.length, 1);
  ok(['c0102', 'c0103', 'c0104'].includes(x[0]));
});

test('pickHelpers(match)는 주 카드를 뺀 2장, 양방향 허용', () => {
  const x = pickHelpers({ card: c('c0101'), form: 'match', index, rng: makeRng(1) });
  eq(x.slice().sort(), ['c0102', 'c0103']);
});

test('pickHelpers는 후보 부족이면 null', () => {
  eq(pickHelpers({ card: c('c0106'), form: 'blank', index, rng: makeRng(1) }), null);
});

test('validateCards: 정상 fixture는 오류 없음', () => {
  const r = validateCards({ zones, cards }, opts);
  eq(r.errors, []);
  ok(r.warnings.some((w) => w.includes('c0106')), 'true<4 경고');
});

test('validateCards: 범위 밖 ref', () => {
  const cs = clone(cards); cs[0].ref = '300';
  ok(validateCards({ zones, cards: cs }, opts).errors.some((e) => e.includes('c0101') && e.includes('ref')));
});

test('validateCards: scene에 {agent} 없음', () => {
  const cs = clone(cards); cs[0].scene = '요원이 조사한다.';
  ok(validateCards({ zones, cards: cs }, opts).errors.some((e) => e.includes('{agent}')));
});

test('validateCards: 금지어', () => {
  const cs = clone(cards); cs[1].true[1] = '사파비 왕조가 세워졌다.';
  ok(validateCards({ zones, cards: cs }, opts).errors.some((e) => e.includes('사파비')));
});

test('validateCards: 자기 자신을 distractors에', () => {
  const cs = clone(cards); cs[0].distractors.push('c0101');
  ok(validateCards({ zones, cards: cs }, opts).errors.some((e) => e.includes('자기')));
});

test('validateCards: terms[0] 중복', () => {
  const cs = clone(cards); cs[1].terms[0] = '용어1';
  ok(validateCards({ zones, cards: cs }, opts).errors.some((e) => e.includes('terms')));
});
