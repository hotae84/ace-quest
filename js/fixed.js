// 고정 문제(역사 퀘스트 이식) 색인 — 개념이 표적(설계 v2 §3)
export function buildFixedIndex(files) {
  const concepts = new Map();
  const byZone = new Map();
  const questionById = new Map();
  for (const f of files) {
    const list = [];
    for (const c of f.concepts) {
      const concept = { id: c.id, name: c.name, zone: f.zone, ref: c.ref, questions: c.questions };
      concepts.set(c.id, concept);
      list.push(concept);
      for (const q of c.questions) questionById.set(q.id, { concept, question: q });
    }
    byZone.set(f.zone, list);
  }
  return { concepts, byZone, questionById };
}

export const innerType = (fixedIndex, fq) => fixedIndex.questionById.get(fq)?.question.type ?? null;
export const isNegativeFixed = (question) => /옳지 않은|아닌|틀린/.test(question.q || '');
