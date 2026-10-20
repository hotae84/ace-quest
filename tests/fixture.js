// 테스트용 카드 묶음 — 내용은 가짜이며 교재와 무관하다
export const zones = {
  contentVersion: 'test.1',
  zones: [
    { id: 'Z1', title: '테스트 지역', pdf: '93~97', pages: '180~189',
      sections: [{ n: 1, title: '구역 1', pages: '180~183' }, { n: 2, title: '구역 2', pages: '184~185' }, { n: 3, title: '구역 3', pages: '186~189' }] },
  ],
};

function card(id, { section, ref, subject, term, year, distractors, passage = true, blank = true, trueN = 4, falseN = 2, unique = null }) {
  const t = Array.from({ length: trueN }, (_, i) => `${subject}에 대한 참 진술 ${i + 1}이다.`);
  if (unique) t[0] = unique;
  return {
    id, zone: 'Z1', section, ref, subject,
    terms: [term, `${term} 보조어`],
    year,
    scene: `{agent}가 ${subject} 자료를 조사한다.`,
    ...(passage ? { passage: `${subject}에 관한 요약 자료.` } : {}),
    true: t,
    false: Array.from({ length: falseN }, (_, i) => `${subject}에 대한 거짓 진술 ${i + 1}이다.`),
    distractors,
    ...(blank ? { blank: { text: `${subject} 관련 빈칸: ___에 해당한다.`, answer: term } } : {}),
    hint: `${subject}의 핵심을 떠올려 보자.`,
  };
}

export const cards = [
  card('c0101', { section: 1, ref: '180~181', subject: '주제1', term: '용어1', year: 1914, distractors: ['c0102', 'c0103', 'c0104'] }),
  card('c0102', { section: 1, ref: '182', subject: '주제2', term: '용어2', year: 1917, distractors: ['c0101', 'c0103'] }),
  card('c0103', { section: 2, ref: '184~185', subject: '주제3', term: '용어3', year: 1919, distractors: ['c0101', 'c0102'] }),
  card('c0104', { section: 2, ref: '185', subject: '주제4', term: '용어4', year: 1920, distractors: ['c0101'] }),
  card('c0105', { section: 3, ref: '186~187', subject: '주제5', term: '용어5', year: 1928, distractors: ['c0101', 'c0102', 'c0103'], passage: false, blank: false }),
  card('c0106', { section: 3, ref: '188~189', subject: '주제6', term: '용어6', year: 1929, distractors: ['c0101'], trueN: 3, unique: '여섯째 카드만의 고유 진술이다.' }),
];

export function clone(v) { return JSON.parse(JSON.stringify(v)); }
