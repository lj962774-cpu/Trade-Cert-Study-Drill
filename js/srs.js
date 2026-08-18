// srs.js — 간격 반복(Leitner 5-box) 알고리즘. PRD §6 명세 구현.
// 상수(간격일, 오답 재등장 지연)는 settings 에서 조정 가능하도록 분리한다.

const ONE_MINUTE = 60 * 1000;
const ONE_DAY = 24 * 60 * ONE_MINUTE;
const MAX_BOX = 5;
const MIN_BOX = 1;

// 정/오답 채점 → box·due·lastReviewed 갱신 (in place).
// intervals: {1:0,2:1,3:3,4:7,5:16} (box → 일)
// lapseDelayMin: 오답 시 당일 재등장 지연(분)
function grade(card, correct, settings, now) {
  now = now == null ? Date.now() : now;
  const intervals = settings.intervals;
  const lapseDelayMin = settings.lapseDelayMin != null ? settings.lapseDelayMin : 10;
  if (correct) {
    card.box = Math.min((card.box || 1) + 1, MAX_BOX);
    const days = Number(intervals[card.box] != null ? intervals[card.box] : 0);
    card.due = now + days * ONE_DAY;
  } else {
    card.box = MIN_BOX;
    card.due = now + lapseDelayMin * ONE_MINUTE;
  }
  card.lastReviewed = now;
  return card;
}

// due 카드 목록 (due <= now), 낮은 box → 오래된 due 순 정렬.
function dueCards(cards, now) {
  now = now == null ? Date.now() : now;
  return cards
    .filter((c) => (c.due || 0) <= now)
    .sort((a, b) => (a.box || 1) - (b.box || 1) || (a.due || 0) - (b.due || 0));
}

// 다음 학습 카드 선택. due 가 없으면 null.
function pickNext(cards, now) {
  const due = dueCards(cards, now);
  return due.length ? due[0] : null;
}

// 미리 학습(Study Ahead): due 카드가 없을 때 가장 임박한(due 가 가장 이른) 카드.
function pickAhead(cards, now) {
  now = now == null ? Date.now() : now;
  const notDue = cards
    .filter((c) => (c.due || 0) > now)
    .sort((a, b) => (a.due || 0) - (b.due || 0));
  return notDue.length ? notDue[0] : null;
}

// box 분포 [box1..box5] 카운트.
function boxDistribution(cards) {
  const dist = [0, 0, 0, 0, 0];
  for (const c of cards) {
    const b = Math.min(Math.max(c.box || 1, 1), 5);
    dist[b - 1]++;
  }
  return dist;
}

// 진도% : (평균 box - 1) / (maxBox - 1). 빈 덱은 0.
function deckProgress(cards) {
  if (!cards.length) return 0;
  const avg = cards.reduce((s, c) => s + (c.box || 1), 0) / cards.length;
  return Math.round(((avg - 1) / (MAX_BOX - 1)) * 100);
}

window.SRS = {
  ONE_MINUTE, ONE_DAY, MAX_BOX, MIN_BOX,
  grade, dueCards, pickNext, pickAhead, boxDistribution, deckProgress,
};
