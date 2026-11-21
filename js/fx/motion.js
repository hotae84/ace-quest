// 움직임 제어 — 설정 "움직임 켜기"와 OS prefers-reduced-motion 둘 다 켜져 있어야 연출한다
export function motionEnabled(settings = {}, mql = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false }) {
  return settings.motion !== false && !(mql && mql.matches);
}

// 요소에 fx-<name> 클래스를 붙이고 끝날 때까지 기다린다. motion이 꺼져 있으면
// 최종 상태 클래스만 두고 이미 이행된 Promise를 돌려준다(타이머·리스너 없음)
export function play(el, name, ms, { motion = true, setTimeout: st = globalThis.setTimeout } = {}) {
  if (!motion) {
    el.classList.add(`fx-${name}`, 'fx-done');
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; el.removeEventListener?.('animationend', onEnd); el.classList.add('fx-done'); resolve(); };
    const onEnd = (e) => { if (!e || e.target === el) finish(); };
    el.addEventListener?.('animationend', onEnd);
    el.classList.add(`fx-${name}`);
    st(finish, ms + 50);
  });
}
