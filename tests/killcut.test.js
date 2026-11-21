import { test, eq, ok } from './harness.js';
import { FX } from '../js/fx/config.js';
import { pickVariant, pickAbility, roundSalt, killSeq, killcutDuration, stampLabel, streakLabel, VARIANTS } from '../js/fx/killcut.js';

test('pickVariant: seq+salt로 세 기본 변형 순환(연속 여부와 무관, 결정적)', () => {
  const seen = new Set([0, 1, 2].map((seq) => pickVariant({ seq, salt: 0 })));
  eq([...seen].sort(), ['ability', 'headshot', 'melee'], '세 변형이 세 정답 안에 모두 등장');
  eq(pickVariant({ seq: 0, salt: 0 }), 'headshot');
  eq(pickVariant({ seq: 0, salt: 1 }), 'ability', 'salt로 시작점 이동');
  eq(pickVariant({ seq: 3, salt: 1 }), pickVariant({ seq: 3, salt: 1 }), '같은 입력 같은 출력');
  eq(pickVariant({ seq: 3, salt: 0 }), 'headshot', '4번째 정답은 다시 처음');
  eq(VARIANTS, ['headshot', 'ability', 'melee']);
});

test('roundSalt: 라운드 id 바이트 합 % 3, 빈 값은 0', () => {
  eq(roundSalt('abc'), (97 + 98 + 99) % 3);
  eq(roundSalt(''), 0);
  eq(roundSalt(null), 0);
});

test('killSeq: 이번 시도 이전의 정답 수(원 시도·재도전 성공 포함)', () => {
  const round = { q: [
    { ok: true, retry: null }, { ok: false, retry: { ok: true } }, { ok: false, retry: { ok: false } }, { ok: null, retry: null },
  ] };
  eq(killSeq(round, 0, false), 0);
  eq(killSeq(round, 1, false), 1);
  eq(killSeq(round, 1, true), 1, '재도전 중이면 같은 문항의 원 시도(오답)는 세지 않음');
  eq(killSeq(round, 3, false), 2, '재도전 성공도 센다');
  eq(killSeq(null, 0, false), 0);
});

test('pickAbility: (seq+salt) % 4, 능력이 없으면 null', () => {
  const ab = [{ slot: 'ability1', name: 'A' }, { slot: 'ability2', name: 'B' }, { slot: 'grenade', name: 'C' }, { slot: 'ultimate', name: 'D' }];
  eq(pickAbility(ab, { seq: 0, salt: 0 }).name, 'A');
  eq(pickAbility(ab, { seq: 2, salt: 1 }).name, 'D');
  eq(pickAbility(ab, { seq: 3, salt: 1 }).name, 'A');
  eq(pickAbility([], { seq: 0, salt: 0 }), null);
  eq(pickAbility(undefined, { seq: 0, salt: 0 }), null);
});

test('killcutDuration·stampLabel·streakLabel: 변형별 길이(연속이면 슬로우 배수)와 문구', () => {
  eq([killcutDuration('headshot'), killcutDuration('ability'), killcutDuration('melee')], [FX.kc.headshot, FX.kc.ability, FX.kc.melee]);
  eq(killcutDuration('ability', 2), Math.round(FX.kc.ability * FX.kcSlow));
  eq(killcutDuration('headshot', 1), FX.kc.headshot);
  ok(FX.kc.ability > FX.kc.headshot && FX.kcSlow > 1);
  eq(stampLabel('headshot', {}), 'HEADSHOT');
  eq(stampLabel('melee', {}), '근접 처치');
  eq(stampLabel('ability', { ability: { name: '충격 화살' } }), '충격 화살');
  eq(stampLabel('ability', { ability: null }), '능력 마무리');
  eq([streakLabel(1), streakLabel(2), streakLabel(3), streakLabel(4), streakLabel(6)], [null, '더블 킬', '트리플 킬', '쿼드라 킬', '6연속 킬']);
});
