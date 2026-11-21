// 계급장 — 전체 숙련도 합산 기준 5단계 독자 명칭(설계 v2 §4). 경계값은 제안값
export const RANKS = [
  { level: 1, name: '신병', min: 0 },
  { level: 2, name: '대원', min: 15 },
  { level: 3, name: '정예', min: 40 },
  { level: 4, name: '베테랑', min: 90 },
  { level: 5, name: '에이스', min: 180 },
];

export function rankOf(totalMastery) {
  let cur = RANKS[0];
  for (const r of RANKS) if (totalMastery >= r.min) cur = r;
  return cur;
}

export const totalMastery = (mastery) => [...mastery.values()].reduce((s, v) => s + v, 0);
