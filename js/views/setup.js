import { h } from '../dom.js';
import { topbar, agentBadge, fmt } from './common.js';

// 첫 실행·설정: 토큰(선택) → 플레이어(+PIN) → 요원
export function renderSetup(app, { first = false } = {}) {
  const st = app.state;
  const s = st.settings;
  let token = s.token || '';
  let playerId = s.playerId || '';
  let nick = s.nick || '';
  let pin = '';
  let agent = s.agent || null;
  const err = h('p', { class: 'error', role: 'alert' }, st.setupError || '');
  const playersBox = h('div', { class: 'players' });

  const drawPlayers = () => {
    const list = st.players;
    playersBox.replaceChildren(...[
      h('h2', {}, '플레이어'),
      list ? h('div', { class: 'row wrap' }, list.map((p) => h('button', {
        class: `btn small ${playerId === p.id ? 'primary' : ''}`, onclick: () => { playerId = p.id; nick = p.nick; drawPlayers(); },
      }, p.nick))) : h('p', { class: 'sub' }, token ? '토큰으로 플레이어 목록을 불러오세요.' : '토큰이 없으면 아래에 직접 입력합니다(오프라인 시작).'),
      list ? h('label', { class: 'field' }, 'PIN', h('input', { type: 'password', inputmode: 'numeric', value: pin, oninput: (e) => { pin = e.target.value; } })) : null,
      !list ? h('label', { class: 'field' }, '플레이어 id', h('input', { value: playerId, oninput: (e) => { playerId = e.target.value.trim(); } })) : null,
      !list ? h('label', { class: 'field' }, '닉네임', h('input', { value: nick, oninput: (e) => { nick = e.target.value.trim(); } })) : null].filter(Boolean));
  };
  drawPlayers();

  const agentsBox = h('div', { class: 'agents' }, st.agents.map((a) => h('button', {
    class: `agent-pick ${agent === a.id ? 'sel' : ''}`, style: `--ac:${a.color}`, 'aria-pressed': agent === a.id ? 'true' : 'false',
    onclick: (e) => {
      agent = a.id;
      for (const b of agentsBox.children) { b.classList.toggle('sel', b === e.currentTarget); b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false'); }
    },
  }, agentBadge(a, 'md'), h('span', {}, a.name))));

  // saveSettings가 화면을 다시 그리므로, 결과는 상태(setupError)에 남겨 새 화면이 보여 준다
  async function loadPlayers() {
    st.setupError = '';
    if (!token) { st.setupError = '토큰을 먼저 입력하세요.'; app.go('setup'); return; }
    app.saveSettings({ token });
    try { await app.loadPlayers(); } catch (e) { st.setupError = `목록을 불러오지 못했어요: ${e.message}`; app.toast?.(st.setupError); }
    app.go(first ? 'setup' : 'settings');
  }

  function save() {
    err.textContent = '';
    if (!playerId) { err.textContent = '플레이어를 고르거나 입력하세요.'; return; }
    if (st.players) {
      const p = st.players.find((x) => x.id === playerId);
      if (!p) { err.textContent = '플레이어를 고르세요.'; return; }
      if (String(p.pin ?? '') !== pin) { err.textContent = 'PIN이 맞지 않아요.'; return; }
      nick = p.nick;
    }
    if (!agent) { err.textContent = '요원을 고르세요.'; return; }
    app.saveSettings({ token: token || null, playerId, nick, agent });
    app.go('map');
    app.sync?.();
  }

  const queueN = st.queue.length;
  return h('div', { class: 'page setup' },
    topbar(app, first ? '에이스 퀘스트 시작' : '설정', { back: first ? null : 'map' }),
    h('section', { class: 'card' },
      h('h2', {}, '점수 저장소 토큰 (보호자)'),
      h('p', { class: 'sub' }, '없어도 플레이할 수 있어요. 기록은 이 기기에 쌓였다가 토큰을 넣으면 전송됩니다.'),
      h('div', { class: 'row' },
        h('input', { type: 'password', class: 'grow', placeholder: 'github_pat_…', value: token, oninput: (e) => { token = e.target.value.trim(); } }),
        h('button', { class: 'btn small', onclick: loadPlayers }, '목록 불러오기')),
      queueN ? h('p', { class: 'sub' }, `미전송 기록 ${queueN}건`) : null,
      st.syncError ? h('p', { class: 'error' }, `마지막 전송 실패: ${st.syncError.message || st.syncError}`) : null),
    h('section', { class: 'card' }, playersBox),
    h('section', { class: 'card' }, h('h2', {}, '요원'), agentsBox),
    err,
    h('button', { class: 'btn primary block', onclick: save }, first ? '출격 준비 완료' : '저장'),
    !first ? h('section', { class: 'card' },
      h('h2', {}, '상태'),
      h('p', { class: 'sub' }, `콘텐츠 ${st.index.contentVersion} · 생성기 ${app.version().gv}`),
      st.broken.length ? h('p', { class: 'error' }, `깨진 저장 항목: ${st.broken.join(', ')}`) : null,
      st.quarantine.length ? h('p', { class: 'error' }, `격리된 기록 ${st.quarantine.length}건 — 보호자 페이지에서 확인`) : null,
      st.pendingUpdate ? h('button', { class: 'btn block', onclick: () => app.applyUpdate?.() }, '새 버전 적용') : null,
      h('p', { class: 'sub' }, `누적 크레드 ${fmt(st.derived?.earned)} · 환전 ${fmt(st.derived?.redeemed)}`)) : null);
}
