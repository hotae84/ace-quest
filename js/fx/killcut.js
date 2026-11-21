// 킬 컷 v2 — 공식 요원 전신 일러스트 + 홀로그램 표적판 + 기본 마무리 3종(순환) + 연속 킬 레이어(설계 0.3.0 §3).
// fetch 없음(이미지는 <img>), 기록·해시와 무관. 변형은 라운드 id·정답 순서로 결정적이라 재렌더링에도 같다.
import { h, s } from '../dom.js';
import { play } from './motion.js';
import { FX } from './config.js';
import { fullUrl, abilityUrl } from './avatar.js';

export const VARIANTS = ['headshot', 'ability', 'melee'];
const STREAK = { 2: '더블 킬', 3: '트리플 킬', 4: '쿼드라 킬' };
export const streakLabel = (n) => (n >= 2 ? STREAK[n] || `${n}연속 킬` : null);
const mod = (n, m) => ((n % m) + m) % m;

// 라운드 id 문자 코드 합 % 3 — 라운드마다 시작 변형이 달라진다
export function roundSalt(id) { let t = 0; for (const ch of String(id || '')) t += ch.charCodeAt(0); return t % 3; }
// 이번 시도 이전의 정답 수(원 시도·재도전 성공 포함). 재도전 중이면 같은 문항의 원 시도(오답)는 자연히 제외된다
export function killSeq(round, idx, inRetry = false) {
  if (!round?.q) return 0;
  let n = 0;
  for (let i = 0; i < Math.min(idx, round.q.length); i++) { const q = round.q[i]; if (q.ok === true || q.retry?.ok === true) n += 1; }
  return n;
}
export const pickVariant = ({ seq = 0, salt = 0 } = {}) => VARIANTS[mod(seq + salt, VARIANTS.length)];
export const pickAbility = (abilities, { seq = 0, salt = 0 } = {}) => (Array.isArray(abilities) && abilities.length ? abilities[mod(seq + salt, abilities.length)] : null);
export const killcutDuration = (variant, streak = 1) => Math.round((FX.kc[variant] ?? FX.kc.headshot) * (streak >= 2 ? FX.kcSlow : 1));
export const stampLabel = (variant, { ability = null } = {}) => (variant === 'headshot' ? 'HEADSHOT' : variant === 'melee' ? '근접 처치' : ability?.name || '능력 마무리');

// 파편 8조각: 표적판 복제본을 clip-path로 자르고 --dx/--dy/--r로 흩뿌린다(값은 h()가 CSSOM으로 넣는다)
const SHARDS = [
  ['polygon(0 0,45% 0,30% 35%)', '-40px', '-50px', '-30deg'], ['polygon(45% 0,100% 0,70% 30%)', '50px', '-60px', '25deg'],
  ['polygon(0 0,30% 35%,0 60%)', '-60px', '0px', '-15deg'], ['polygon(100% 0,100% 55%,70% 30%)', '70px', '-10px', '40deg'],
  ['polygon(30% 35%,70% 30%,55% 60%)', '10px', '-30px', '10deg'], ['polygon(0 60%,30% 35%,55% 60%,20% 100%,0 100%)', '-50px', '60px', '-25deg'],
  ['polygon(55% 60%,100% 55%,100% 100%,60% 100%)', '60px', '60px', '30deg'], ['polygon(20% 100%,55% 60%,60% 100%)', '0px', '80px', '5deg'],
];
const shards = () => h('div', { class: 'kc-shards' }, SHARDS.map(([cp, dx, dy, r]) => h('div', { class: 'kc-shard', style: `clip-path:${cp};--dx:${dx};--dy:${dy};--r:${r}` })));
const cracks = () => s('svg', { class: 'kc-cracks', viewBox: '0 0 100 100', preserveAspectRatio: 'none' }, s('path', { d: 'M50 50 L20 10 M50 50 L85 18 M50 50 L95 60 M50 50 L60 98 M50 50 L10 80 M50 50 L5 45' }));
const img = (src, cls = '') => { const el = h('img', { class: cls, src, alt: '', decoding: 'async', draggable: 'false' }); el.addEventListener('error', () => el.remove(), { once: true }); return el; };

export function renderKillCut({ agent, target = '', streak = 1, variant = 'headshot', ability = null, masteryAfter = null, motion = true }) {
  if (!VARIANTS.includes(variant)) variant = 'headshot';
  const slow = streak >= 2;
  const box = h('div', { class: `kc v-${variant}${slow ? ' streak' : ''}`, style: `--ac:${agent.color};--kcs:${slow ? FX.kcSlow : 1}`, 'aria-hidden': 'true' });
  const inner = h('div', { class: 'kc-inner' }, h('div', { class: 'kc-band' }), h('div', { class: 'kc-glow' }));
  const full = fullUrl(agent.id);
  if (full) inner.append(img(full, 'kc-shooter'));
  inner.append(h('div', { class: 'kc-scan' }), h('div', { class: 'kc-chip' }, h('i', {}, '✦'), ` ${agent.name} `, h('i', {}, '▸'), ' 표적'));
  if (target) inner.append(h('div', { class: 'kc-tag' }, h('b', {}, '✕'), target));
  if (variant === 'headshot') { inner.append(h('div', { class: 'kc-tracer' })); if (slow) inner.append(h('div', { class: 'kc-tracer t2' })); }
  const tgt = h('div', { class: 'kc-tgt' }, h('div', { class: 'kc-panel' }, h('small', {}, 'TARGET'), h('div', { class: 'kc-name' }, target)));
  if (variant === 'melee') tgt.append(h('div', { class: 'kc-half a' }), h('div', { class: 'kc-half b' }), h('div', { class: 'kc-slash' }));
  else {
    tgt.append(shards(), cracks());
    if (variant === 'headshot') tgt.append(h('div', { class: 'kc-ret' }, h('span', { class: 'kc-ret-hot' })), h('div', { class: 'kc-flash' }));
    else tgt.append(h('div', { class: 'kc-flash' }), h('div', { class: 'kc-ring' }));
  }
  inner.append(tgt);
  if (variant === 'ability') {
    const ab = h('div', { class: 'kc-abil' });
    const u = ability ? abilityUrl(agent.id, ability.slot) : null;
    if (u) ab.append(img(u));
    inner.append(ab);
  }
  inner.append(h('div', { class: `kc-stamp s-${variant}` }, stampLabel(variant, { ability })));
  if (slow) inner.append(h('div', { class: 'kc-badge' }, streakLabel(streak)));
  const score = ['제압 +1', masteryAfter !== null && masteryAfter !== undefined ? `숙련도 ${masteryAfter}/5` : null, slow ? `연속 ×${streak}` : null].filter(Boolean).join(' · ');
  inner.append(h('div', { class: 'kc-score' }, score));
  box.append(inner);
  play(box, 'kc', killcutDuration(variant, streak), { motion });
  return box;
}
