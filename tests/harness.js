const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
    return o;
  }
  return v;
}

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(canon(actual));
  const e = JSON.stringify(canon(expected));
  if (a !== e) throw new Error(`${msg}\n     기대: ${e}\n     실제: ${a}`);
}

export function ok(value, msg = '참이어야 함') {
  if (!value) throw new Error(msg);
}

export async function run(log = console.log) {
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    try {
      await t.fn();
      pass++;
      log(`✓ ${t.name}`);
    } catch (e) {
      fail++;
      log(`✗ ${t.name}\n   ${e.message}`);
    }
  }
  log(`\n${pass} 통과 / ${fail} 실패`);
  return { pass, fail };
}
