import { test, eq } from './harness.js';
import { canonical, sha256Hex, short, hashLine } from '../js/hash.js';

test('canonical은 키를 사전순으로 재귀 정렬한다', () => {
  eq(canonical({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
});

test('canonical은 배열 순서를 유지한다', () => {
  eq(canonical([{ z: 1, y: 2 }, 3]), '[{"y":2,"z":1},3]');
});

test('sha256Hex("abc")', async () => {
  eq(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('short는 앞 n자', () => {
  eq(short('abcdef0123', 4), 'abcd');
});

test('hashLine = sha256(prev + canonical(body))', async () => {
  eq(await hashLine('GENESIS', { x: 1 }), await sha256Hex('GENESIS{"x":1}'));
});
