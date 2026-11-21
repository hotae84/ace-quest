// 관리 페이지의 sandbox iframe 안에서만 동작하는 재현기(설계 §6.4). 토큰 없음, 쓰기 없음.
const CDN = 'https://cdn.jsdelivr.net/gh/hotae84/ace-quest';
const inSandbox = typeof window !== 'undefined' && window.parent !== window && self.origin === 'null';

function say(text) { const el = document.getElementById('msg'); if (el) el.textContent = text; }

const validReq = (m) => m && typeof m === 'object' && typeof m.id === 'string' && typeof m.cv === 'string' && typeof m.gv === 'string'
  && typeof m.c === 'string' && Array.isArray(m.x) && typeof m.f === 'string' && Number.isInteger(m.s) && Array.isArray(m.a)
  && (m.fq === undefined || m.fq === null || typeof m.fq === 'string');

const cache = new Map();
async function loadBundle({ cv, gv, contentSha, generatorSha }) {
  const versions = await (await fetch('data/versions.json', { cache: 'no-cache' })).json();
  const current = versions.current.cv === cv && versions.current.gv === gv;
  const key = current ? 'current' : `${contentSha}|${generatorSha}`;
  if (cache.has(key)) return cache.get(key);
  let gen, dataBase;
  if (current) { gen = await import('./questions/index.js'); dataBase = 'data/'; }
  else {
    if (!contentSha || !generatorSha) throw new Error('unavailable');
    gen = await import(`${CDN}@${generatorSha}/js/questions/index.js`);
    dataBase = `${CDN}@${contentSha}/data/`;
  }
  const zones = await (await fetch(`${dataBase}zones.json`)).json();
  const cards = new Map();
  for (const f of zones.cardFiles) for (const c of await (await fetch(`${dataBase}${f}`)).json()) cards.set(c.id, c);
  // 그 콘텐츠 버전에 고정 문제 파일이 있을 때만 읽는다(구버전 호환)
  const fixed = new Map();
  for (const z of zones.zones.filter((z) => z.source === 'fixed' && z.file)) {
    try { const f = await (await fetch(`${dataBase}${z.file}`)).json(); for (const c of f.concepts) for (const q of c.questions) fixed.set(q.id, q); } catch { /* 없음 */ }
  }
  const bundle = { gen, cards, fixed };
  cache.set(key, bundle);
  return bundle;
}

export async function replay(m) {
  const { gen, cards, fixed } = await loadBundle(m);
  let q;
  if (m.f === 'fixed') {
    const fx = fixed.get(m.fq);
    if (!fx) throw new Error('unavailable');
    q = gen.generate({ form: 'fixed', fixed: fx, seed: m.s });
  } else {
    const card = cards.get(m.c);
    const helpers = m.x.map((id) => cards.get(id));
    if (!card || helpers.some((h) => !h)) throw new Error('unavailable');
    q = gen.generate({ card, helpers, form: m.f, seed: m.s });
  }
  const [qh, oh] = await Promise.all([gen.questionHash(q), gen.optionHashes(q)]);
  return { id: m.id, qh, oh, ok: gen.grade(q, m.a), text: q.text, options: gen.displayedTexts(q), answer: gen.canonicalAnswer(q),
    passage: q.passage ?? null, statements: q.statements ?? null, pairs: q.pairs ? q.pairs.map((p) => p[0]) : null };
}

if (typeof window !== 'undefined') {
  if (!inSandbox) say('이 페이지는 관리 페이지 안에서만 동작합니다.');
  else {
    window.addEventListener('message', async (e) => {
      if (e.source !== window.parent) return;
      const m = e.data;
      if (!validReq(m)) return;
      try { window.parent.postMessage(await replay(m), '*'); } catch { window.parent.postMessage({ id: m.id, error: 'unavailable' }, '*'); }
    });
    say('재현기 준비됨');
    window.parent.postMessage({ type: 'replay-ready' }, '*');
  }
}
