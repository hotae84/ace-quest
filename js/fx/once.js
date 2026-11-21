// 같은 라운드·문항의 연출은 한 번만 — 동기화 등으로 화면이 다시 그려져도 재생하지 않는다
let played = new Set();
export function once(key) {
  if (played.has(key)) return false;
  played.add(key);
  return true;
}
export function resetOnce() { played = new Set(); }
