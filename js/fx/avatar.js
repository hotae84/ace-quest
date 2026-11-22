// 요원 초상 — 라이엇 공식 요원 아이콘(valorant-api.com 배포본, 256px WebP). 비상업 팬 프로젝트용.
// 로드 실패(오프라인 첫 실행 등)면 onerror로 대체 노드(이니셜)로 바꾼다.
import { h } from '../dom.js';

export const IMAGE_NOTICE = '요원 이미지 © Riot Games. 비상업 팬 프로젝트이며 Riot Games가 보증하거나 후원하지 않습니다.';

const ID_RE = /^[a-z0-9-]+$/;
const okId = (id) => typeof id === 'string' && ID_RE.test(id);
export const avatarUrl = (id) => (okId(id) ? `assets/agents/${id}.webp` : null);
// 전신 일러스트(900px)·능력 아이콘(128px) — 0.3.0 킬 컷·에이스용. slot은 네 개 고정(passive 제외)
export const ABILITY_SLOTS = ['ability1', 'ability2', 'grenade', 'ultimate'];
export const fullUrl = (id) => (okId(id) ? `assets/agents/${id}-full.webp` : null);
export const abilityUrl = (id, slot) => (okId(id) && ABILITY_SLOTS.includes(slot) ? `assets/abilities/${id}-${slot}.webp` : null);

// fallback: 이미지가 없을 때 대신 들어갈 노드(또는 노드를 만드는 함수)
export function avatarImg(agent, { cls = 'avatar', fallback = null } = {}) {
  const src = avatarUrl(agent?.id);
  const alt = () => (typeof fallback === 'function' ? fallback() : fallback) || h('span', { class: 'pt-initial' }, String(agent?.name || '?').slice(0, 1));
  if (!src) return alt();
  const img = h('img', { class: cls, src, alt: '', decoding: 'async', draggable: 'false' });
  img.addEventListener('error', () => { const n = alt(); if (n) img.replaceWith(n); else img.remove(); }, { once: true });
  return img;
}
