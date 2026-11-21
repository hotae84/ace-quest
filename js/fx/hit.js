// 피격 — 화면 가장자리 붉은 비네트 + 짧은 흔들림. 본문 밖(body)에 잠깐 붙였다 뗀다
import { h } from '../dom.js';
import { play } from './motion.js';
import { FX } from './config.js';

export async function hitVignette(root = document.body, { motion = true } = {}) {
  if (!motion) return;
  const v = h('div', { class: 'hit-vignette', 'aria-hidden': 'true' });
  root.append(v);
  root.classList.add('fx-shake');
  await play(v, 'hit', FX.hit, { motion });
  root.classList.remove('fx-shake');
  v.remove();
}
