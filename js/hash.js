// 키를 사전순으로 정렬한 JSON — 해시·비교의 기준 표현(설계 §6.2)
export function canonical(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = sortKeys(v[k]);
    return o;
  }
  return v;
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function short(hex, n) {
  return hex.slice(0, n);
}

export function hashLine(prev, body) {
  return sha256Hex(prev + canonical(body));
}
