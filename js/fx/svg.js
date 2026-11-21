// 검증을 통과한 정적 SVG를 받아 허용 목록 안의 요소·속성만으로 다시 조립한다(innerHTML 금지, 설계 v2 §4)
import { s } from '../dom.js';

const ALLOWED = new Set(['svg', 'g', 'path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'use', 'symbol', 'title']);
const COLOR_ATTRS = new Set(['fill', 'stroke', 'stop-color', 'flood-color', 'color']);
const COLOR_OK = /^(currentColor|none|transparent|inherit|url\(#[^)]+\))$/;

export const allowedTag = (tag) => ALLOWED.has(tag);
export function allowedAttr(name, value) {
  const a = String(name).toLowerCase();
  const v = String(value);
  if (a === 'style' || a.startsWith('on')) return false;
  if ((a === 'href' || a === 'xlink:href') && !v.startsWith('#')) return false;
  if (/url\(\s*(?!#)/i.test(v)) return false;
  if (COLOR_ATTRS.has(a) && !COLOR_OK.test(v.trim())) return false;
  return true;
}

// DOM 노드(파서 결과)를 허용 목록으로 걸러 새 SVG 트리로 복제한다
export function rebuild(node, ancestors = new Set()) {
  if (node.nodeType === 3) return node.textContent.trim() ? document.createTextNode(node.textContent) : null;
  if (node.nodeType !== 1 || !allowedTag(node.localName)) return null;
  const props = {};
  for (const { name, value } of node.attributes) if (allowedAttr(name, value) && !name.startsWith('xmlns')) props[name] = value;
  // 조상(자기 자신 포함)을 가리키는 <use>는 재귀 확장이 되므로 버린다
  if (node.localName === 'use') { const ref = String(props.href || props['xlink:href'] || '').slice(1); if (ref && ancestors.has(ref)) return null; }
  const el = s(node.localName, props);
  const next = props.id ? new Set([...ancestors, props.id]) : ancestors;
  for (const c of node.childNodes) { const r = rebuild(c, next); if (r) el.append(r); }
  return el;
}

const cache = new Map();
// 에셋 이름(확장자 없이) → 재조립된 <svg> 템플릿. 없거나 깨지면 null(화면은 글자 대체로 그린다)
export async function loadSvg(name) {
  if (!cache.has(name)) {
    cache.set(name, (async () => {
      try {
        const r = await fetch(`assets/fx/${name}.svg`);
        if (!r.ok) return null;
        const doc = new DOMParser().parseFromString(await r.text(), 'image/svg+xml');
        const root = doc.documentElement;
        if (!root || root.localName !== 'svg' || doc.querySelector('parsererror')) return null;
        return rebuild(root);
      } catch { return null; }
    })());
  }
  return cache.get(name);
}
export const svgNode = async (name) => { const t = await loadSvg(name); return t ? t.cloneNode(true) : null; };
export const preloadSvgs = (names) => Promise.all(names.map(loadSvg));
