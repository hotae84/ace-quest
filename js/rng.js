// mulberry32 — seed로 재현 가능한 난수(문제 생성 전용)
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function needRng(rng) {
  if (typeof rng !== 'function') throw new TypeError('rng 함수가 필요합니다');
}

export function shuffle(arr, rng) {
  needRng(rng);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(arr, rng) {
  needRng(rng);
  return arr[Math.floor(rng() * arr.length)];
}

// 중복 없이 n개, 뽑힌 순서대로
export function pickN(arr, n, rng) {
  needRng(rng);
  const pool = arr.slice();
  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

export function weightedIndex(weights, rng) {
  needRng(rng);
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

function u32() {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
}

export function randomSeed() {
  return u32();
}

// 드롭 티켓 전용 — 예측 불가 난수(설계 §8)
export function cryptoRng() {
  return () => u32() / 4294967296;
}
