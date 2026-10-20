import { test, eq, ok } from './harness.js';
import { makeRng, shuffle, pick, pickN, weightedIndex, randomSeed, cryptoRng } from '../js/rng.js';

test('makeRng(42)는 같은 수열을 다시 낸다', () => {
  const a = makeRng(42), b = makeRng(42);
  eq([a(), a(), a(), a(), a()], [b(), b(), b(), b(), b()]);
});

test('shuffle은 원본을 바꾸지 않고 순열을 돌려준다', () => {
  const src = [1, 2, 3, 4];
  const out = shuffle(src, makeRng(1));
  eq(src, [1, 2, 3, 4]);
  eq(out.slice().sort(), [1, 2, 3, 4]);
  ok(out.length === 4);
});

test('shuffle은 rng가 함수가 아니면 TypeError', () => {
  let threw = null;
  try { shuffle([1, 2]); } catch (e) { threw = e; }
  ok(threw instanceof TypeError, 'TypeError여야 함');
});

test('pick은 배열 원소 하나를 돌려준다', () => {
  const v = pick(['a', 'b', 'c'], makeRng(3));
  ok(['a', 'b', 'c'].includes(v));
});

test('pickN은 중복 없이 n개', () => {
  const out = pickN([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, makeRng(7));
  eq(out.length, 3);
  eq(new Set(out).size, 3);
});

test('weightedIndex는 누적 가중치 구간으로 고른다', () => {
  eq(weightedIndex([70, 25, 5], () => 0.69), 0);
  eq(weightedIndex([70, 25, 5], () => 0.70), 1);
  eq(weightedIndex([70, 25, 5], () => 0.96), 2);
});

test('randomSeed는 32비트 정수', () => {
  const s = randomSeed();
  ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32);
});

test('cryptoRng는 [0,1) 값을 낸다', () => {
  const r = cryptoRng();
  for (let i = 0; i < 20; i++) { const v = r(); ok(v >= 0 && v < 1); }
});
