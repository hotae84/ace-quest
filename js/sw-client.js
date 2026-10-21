let reg = null;
let updateRequested = false;

export async function setupSW(app) {
  if (!('serviceWorker' in navigator)) return;
  try { reg = await navigator.serviceWorker.register('sw.js'); } catch { return; }
  const check = () => {
    if (reg.waiting && navigator.serviceWorker.controller) { app.state.pendingUpdate = true; app.toast?.('새 버전이 있어요 — 라운드를 끝낸 뒤 설정에서 적용'); }
  };
  check();
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') check(); });
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested && !reloading) { reloading = true; location.reload(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
}

// 미완 라운드가 있으면 적용하지 않는다(설계 §5.2)
export async function applyUpdate(app, store) {
  if (!reg?.waiting) return;
  if (store.getRound()) { app.toast?.('라운드를 끝낸 뒤 업데이트할 수 있어요'); return; }
  updateRequested = true;
  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
}
