// app.js — UI, 뷰 라우팅, 학습 세션. 순수 DOM 렌더링(의존성 없음).

const store = new Store();
let state; // store.state 참조

// 현재 뷰 상태
const nav = { view: 'home', deckId: null };

// 학습 세션 상태
let session = null; // { deckId, card, revealed, ahead, doneToday }

// ── 유틸: HTML 이스케이프 + 경량 마크업 (백틱=code, **=strong) ──
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function fmt(s) {
  let h = esc(s);
  h = h.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  h = h.replace(/\*\*([^*]+)\*\*/g, (_, c) => `<strong>${c}</strong>`);
  h = h.replace(/\n/g, '<br>');
  return h;
}

// ── DOM 헬퍼 ──
function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'dataset') {
        Object.assign(node.dataset, v);
      } else node.setAttribute(k, v);
    }
  }
  if (children != null) {
    for (const c of [].concat(children)) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
  }
  return node;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  if (isNaN(target)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / SRS.ONE_DAY);
}

function deckDueCount(deck) {
  return SRS.dueCards(deck.cards, Date.now()).length;
}

function reviewsToday() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const t0 = start.getTime();
  return state.reviewLog.filter((r) => r.ts >= t0).length;
}

// ── 네비게이션 ──
function go(view, deckId) {
  nav.view = view;
  if (deckId !== undefined) nav.deckId = deckId;
  session = null;
  render();
  window.scrollTo(0, 0);
}

// ═══════════════════════════════════════════════════════════════
//  렌더링
// ═══════════════════════════════════════════════════════════════
const root = () => document.getElementById('app');

function render() {
  const container = root();
  container.innerHTML = '';
  container.appendChild(renderNavbar());
  const main = el('main', { class: 'container' });
  container.appendChild(main);
  switch (nav.view) {
    case 'home': main.appendChild(renderHome()); break;
    case 'study': main.appendChild(renderStudy()); break;
    case 'cards': main.appendChild(renderCards()); break;
    case 'hs': main.appendChild(renderHsDrill()); break;
    case 'stats': main.appendChild(renderStats()); break;
    case 'data': main.appendChild(renderData()); break;
    case 'settings': main.appendChild(renderSettings()); break;
    default: main.appendChild(renderHome());
  }
}

function renderNavbar() {
  const tabs = [
    ['home', '🏠 대시보드'],
    ['cards', '🗂️ 카드'],
    ['hs', '🌳 HS 드릴'],
    ['stats', '📊 통계'],
    ['data', '💾 데이터'],
    ['settings', '⚙️ 설정'],
  ];
  const bar = el('nav', { class: 'navbar', 'aria-label': '주 메뉴' }, [
    el('button', {
      class: 'brand', onclick: () => go('home'),
      'aria-label': '홈으로',
    }, '무역자격 드릴'),
    el('div', { class: 'nav-tabs' },
      tabs.map(([v, label]) =>
        el('button', {
          class: 'nav-tab' + (nav.view === v ? ' active' : ''),
          onclick: () => go(v),
          'aria-current': nav.view === v ? 'page' : null,
        }, label)
      )
    ),
  ]);
  return bar;
}

// ── 홈/대시보드 ──
function renderHome() {
  const frag = document.createDocumentFragment();

  // D-day 대시보드 (차별화 §4.7 우선순위 3)
  const examCards = state.exams.map((ex) => {
    const d = daysUntil(ex.examDate);
    const deckIds = store.deckList().filter((dk) => dk.examId === ex.id);
    const totalDue = deckIds.reduce((s, dk) => s + deckDueCount(dk), 0);
    const totalCards = deckIds.reduce((s, dk) => s + dk.cards.length, 0);
    let dday;
    if (d == null) dday = el('span', { class: 'dday none' }, 'D-day 미설정');
    else if (d > 0) dday = el('span', { class: 'dday' }, `D-${d}`);
    else if (d === 0) dday = el('span', { class: 'dday today' }, 'D-DAY');
    else dday = el('span', { class: 'dday past' }, `D+${-d}`);
    return el('div', { class: 'exam-card' }, [
      el('div', { class: 'exam-head' }, [
        el('span', { class: 'exam-name' }, ex.name), dday,
      ]),
      el('div', { class: 'exam-meta' },
        `due ${totalDue} · 전체 ${totalCards}장`),
    ]);
  });

  frag.appendChild(el('section', {}, [
    el('h2', {}, '시험 D-day'),
    el('div', { class: 'exam-grid' }, examCards),
    el('p', { class: 'hint' }, [
      '시험일은 ',
      el('button', { class: 'link', onclick: () => go('settings') }, '설정'),
      ' 에서 입력하세요.',
    ]),
  ]));

  // 오늘 요약
  const totalDue = store.deckList().reduce((s, dk) => s + deckDueCount(dk), 0);
  frag.appendChild(el('section', { class: 'today-summary' }, [
    el('div', { class: 'stat-tile' }, [
      el('div', { class: 'stat-num' }, String(totalDue)),
      el('div', { class: 'stat-label' }, '오늘 복습할 카드'),
    ]),
    el('div', { class: 'stat-tile' }, [
      el('div', { class: 'stat-num' }, String(reviewsToday())),
      el('div', { class: 'stat-label' }, '오늘 복습한 카드'),
    ]),
  ]));

  // 덱 목록
  const deckRows = store.deckList().map((dk) => {
    const due = deckDueCount(dk);
    const prog = SRS.deckProgress(dk.cards);
    return el('div', { class: 'deck-card' }, [
      el('div', { class: 'deck-main' }, [
        el('div', { class: 'deck-title-row' }, [
          el('span', { class: 'deck-name' }, dk.name),
          due > 0 ? el('span', { class: 'badge due' }, `due ${due}`) : el('span', { class: 'badge muted' }, '완료'),
        ]),
        el('div', { class: 'deck-tag' }, dk.tag || ' '),
        el('div', { class: 'progress' }, [
          el('div', { class: 'progress-bar', style: `width:${prog}%` }),
        ]),
        el('div', { class: 'deck-sub' }, `${dk.cards.length}장 · 진도 ${prog}%`),
      ]),
      el('div', { class: 'deck-actions' }, [
        el('button', {
          class: 'btn primary', disabled: dk.cards.length === 0,
          onclick: () => startStudy(dk.id),
        }, due > 0 ? '학습' : '미리 학습'),
        el('button', { class: 'btn ghost', onclick: () => go('cards', dk.id) }, '카드'),
      ]),
    ]);
  });

  frag.appendChild(el('section', {}, [
    el('div', { class: 'section-head' }, [
      el('h2', {}, '덱'),
      el('button', { class: 'btn small', onclick: newDeckPrompt }, '+ 새 덱'),
    ]),
    el('div', { class: 'deck-list' }, deckRows),
  ]));

  return frag;
}

function newDeckPrompt() {
  const name = prompt('새 덱 이름:');
  if (name && name.trim()) { store.createDeck(name.trim(), '', null); render(); }
}

// ── 학습 세션 (§4.4) ──
function startStudy(deckId) {
  const deck = store.getDeck(deckId);
  if (!deck) return;
  session = { deckId, card: null, revealed: false, ahead: false, doneToday: 0 };
  loadNextCard();
  nav.view = 'study';
  render();
  window.scrollTo(0, 0);
}

function loadNextCard() {
  const deck = store.getDeck(session.deckId);
  let card = SRS.pickNext(deck.cards, Date.now());
  session.ahead = false;
  if (!card) {
    card = SRS.pickAhead(deck.cards, Date.now());
    session.ahead = true;
  }
  session.card = card;
  session.revealed = false;
}

function gradeCurrent(correct) {
  const deck = store.getDeck(session.deckId);
  SRS.grade(session.card, correct, state.settings, Date.now());
  store.logReview(session.deckId, correct);
  session.doneToday++;
  store.commit();
  loadNextCard();
  render();
}

function renderStudy() {
  const deck = store.getDeck(session.deckId);
  const frag = document.createDocumentFragment();
  frag.appendChild(el('div', { class: 'study-head' }, [
    el('button', { class: 'btn ghost', onclick: () => go('home') }, '← 대시보드'),
    el('span', { class: 'study-deck' }, deck.name),
  ]));

  const due = deckDueCount(deck);
  frag.appendChild(el('div', { class: 'study-progress' }, [
    el('span', {}, `이번 세션 ${session.doneToday}장 완료`),
    el('span', {}, `남은 due ${due}장`),
  ]));

  if (!session.card) {
    frag.appendChild(el('div', { class: 'done-card' }, [
      el('div', { class: 'done-emoji' }, '🎉'),
      el('h3', {}, '학습할 카드가 없습니다'),
      el('p', { class: 'hint' }, deck.cards.length === 0
        ? '이 덱에 카드가 없습니다. 카드를 추가하거나 CSV 로 import 하세요.'
        : '모든 카드를 복습했습니다. 나중에 다시 오세요.'),
      el('button', { class: 'btn primary', onclick: () => go('home') }, '대시보드로'),
    ]));
    return frag;
  }

  const card = session.card;

  // box 진열대 (5칸)
  const shelf = el('div', { class: 'box-shelf', 'aria-label': `현재 박스 ${card.box}` },
    [1, 2, 3, 4, 5].map((b) =>
      el('div', { class: 'box-cell' + (b === card.box ? ' current' : b < card.box ? ' filled' : '') }, [
        el('span', { class: 'box-num' }, String(b)),
      ])
    )
  );

  const badges = el('div', { class: 'card-badges' }, [
    card.seed ? el('span', { class: 'badge seed', title: '확실도 높은 골격 시드' }, '골격') : null,
    session.ahead ? el('span', { class: 'badge ahead' }, '미리 학습') : null,
    ...card.tags.map((t) => el('span', { class: 'badge tag' }, t)),
  ]);

  const face = el('div', { class: 'card-face' }, [
    badges,
    el('div', { class: 'card-front', html: fmt(card.front) }),
    session.revealed
      ? el('div', { class: 'card-back' }, [
          el('hr'),
          el('div', { html: fmt(card.back) }),
          card.note ? el('div', { class: 'card-note', html: fmt(card.note) }) : null,
        ])
      : null,
  ]);

  const controls = session.revealed
    ? el('div', { class: 'grade-controls' }, [
        el('button', { class: 'btn wrong', onclick: () => gradeCurrent(false) }, [
          el('span', { class: 'gk' }, '✕'), ' 틀림',
          el('span', { class: 'key-hint' }, '1'),
        ]),
        el('button', { class: 'btn right', onclick: () => gradeCurrent(true) }, [
          el('span', { class: 'gk' }, '✓'), ' 맞음',
          el('span', { class: 'key-hint' }, '2'),
        ]),
      ])
    : el('div', { class: 'grade-controls' }, [
        el('button', {
          class: 'btn primary wide',
          onclick: () => { session.revealed = true; render(); },
        }, ['정답 보기', el('span', { class: 'key-hint' }, 'Space')]),
      ]);

  frag.appendChild(shelf);
  frag.appendChild(face);
  frag.appendChild(controls);
  return frag;
}

// 학습 세션 키보드 단축키
document.addEventListener('keydown', (e) => {
  if (nav.view !== 'study' || !session || !session.card) return;
  if (e.target.matches('input, textarea')) return;
  if (!session.revealed && (e.code === 'Space' || e.key === 'Enter')) {
    e.preventDefault(); session.revealed = true; render();
  } else if (session.revealed) {
    if (e.key === '1') { e.preventDefault(); gradeCurrent(false); }
    else if (e.key === '2' || e.code === 'Space') { e.preventDefault(); gradeCurrent(true); }
  }
});

// ── 카드 관리 (§4.2) ──
let cardSearch = '';
function renderCards() {
  const frag = document.createDocumentFragment();
  const decks = store.deckList();
  if (!nav.deckId || !store.getDeck(nav.deckId)) nav.deckId = decks[0] ? decks[0].id : null;

  // 덱 선택
  const selector = el('select', {
    class: 'deck-select',
    onchange: (e) => { nav.deckId = e.target.value; render(); },
  }, decks.map((d) => el('option', { value: d.id, selected: d.id === nav.deckId }, `${d.name} (${d.cards.length})`)));

  frag.appendChild(el('div', { class: 'section-head' }, [
    el('h2', {}, '카드 관리'), selector,
  ]));

  if (!nav.deckId) {
    frag.appendChild(el('p', { class: 'hint' }, '덱이 없습니다.'));
    return frag;
  }
  const deck = store.getDeck(nav.deckId);

  // 덱 도구
  frag.appendChild(el('div', { class: 'deck-toolbar' }, [
    el('button', { class: 'btn small', onclick: () => renameDeckPrompt(nav.deckId) }, '덱 이름·태그 변경'),
    el('button', { class: 'btn small danger', onclick: () => deleteDeckPrompt(nav.deckId) }, '덱 삭제'),
  ]));

  // 새 카드 폼
  frag.appendChild(renderCardForm(nav.deckId));

  // 검색
  frag.appendChild(el('input', {
    class: 'search', type: 'search', placeholder: '카드 검색 (앞·뒤·태그)',
    value: cardSearch,
    oninput: (e) => { cardSearch = e.target.value; renderCardListOnly(); },
  }));

  const listWrap = el('div', { id: 'card-list', class: 'card-rows' });
  frag.appendChild(listWrap);
  // 초기 렌더는 render() 이후 DOM 에 붙은 뒤 채운다
  setTimeout(renderCardListOnly, 0);

  return frag;
}

function filteredCards(deck) {
  const q = cardSearch.trim().toLowerCase();
  if (!q) return deck.cards;
  return deck.cards.filter((c) =>
    c.front.toLowerCase().includes(q) ||
    c.back.toLowerCase().includes(q) ||
    c.tags.some((t) => t.toLowerCase().includes(q))
  );
}

function renderCardListOnly() {
  const wrap = document.getElementById('card-list');
  if (!wrap) return;
  const deck = store.getDeck(nav.deckId);
  if (!deck) return;
  const cards = filteredCards(deck);
  wrap.innerHTML = '';
  wrap.appendChild(el('div', { class: 'card-count' }, `${cards.length}장 표시`));
  for (const c of cards) {
    wrap.appendChild(el('div', { class: 'card-row' }, [
      el('div', { class: 'card-row-main' }, [
        el('div', { class: 'card-row-front', html: fmt(c.front) }),
        el('div', { class: 'card-row-back', html: fmt(c.back) }),
        el('div', { class: 'card-row-meta' }, [
          el('span', { class: 'mini-badge' }, `box ${c.box}`),
          c.seed ? el('span', { class: 'mini-badge seed' }, '골격') : null,
          ...c.tags.map((t) => el('span', { class: 'mini-badge tag' }, t)),
        ]),
      ]),
      el('div', { class: 'card-row-actions' }, [
        el('button', { class: 'btn tiny', onclick: () => editCardPrompt(deck.id, c.id) }, '수정'),
        el('button', { class: 'btn tiny danger', onclick: () => { if (confirm('이 카드를 삭제할까요?')) { store.deleteCard(deck.id, c.id); renderCardListOnly(); } } }, '삭제'),
      ]),
    ]));
  }
}

function renderCardForm(deckId) {
  const front = el('textarea', { class: 'inp', rows: '2', placeholder: '앞면 (문제/용어) — `백틱`으로 코드 강조' });
  const back = el('textarea', { class: 'inp', rows: '2', placeholder: '뒷면 (정답/뜻)' });
  const tags = el('input', { class: 'inp', placeholder: '태그 (쉼표로 구분)' });
  return el('form', {
    class: 'card-form',
    onsubmit: (e) => {
      e.preventDefault();
      if (!front.value.trim()) return;
      store.addCard(deckId, {
        front: front.value.trim(), back: back.value.trim(),
        tags: tags.value.split(',').map((t) => t.trim()).filter(Boolean),
      });
      front.value = ''; back.value = ''; tags.value = '';
      front.focus();
      renderCardListOnly();
    },
  }, [
    el('div', { class: 'form-title' }, '새 카드 추가'),
    front, back, tags,
    el('button', { class: 'btn primary', type: 'submit' }, '추가'),
  ]);
}

function editCardPrompt(deckId, cardId) {
  const deck = store.getDeck(deckId);
  const c = deck.cards.find((x) => x.id === cardId);
  if (!c) return;
  const nf = prompt('앞면:', c.front);
  if (nf === null) return;
  const nb = prompt('뒷면:', c.back);
  if (nb === null) return;
  const nt = prompt('태그(쉼표):', c.tags.join(', '));
  if (nt === null) return;
  store.updateCard(deckId, cardId, {
    front: nf, back: nb,
    tags: nt.split(',').map((t) => t.trim()).filter(Boolean),
  });
  renderCardListOnly();
}

function renameDeckPrompt(deckId) {
  const d = store.getDeck(deckId);
  const name = prompt('덱 이름:', d.name);
  if (name === null) return;
  const tag = prompt('덱 태그:', d.tag);
  if (tag === null) return;
  store.renameDeck(deckId, name.trim() || d.name, tag);
  render();
}

function deleteDeckPrompt(deckId) {
  const d = store.getDeck(deckId);
  if (confirm(`"${d.name}" 덱과 ${d.cards.length}장의 카드를 삭제할까요?`)) {
    store.deleteDeck(deckId);
    nav.deckId = null;
    render();
  }
}

// ── HS 트리 드릴 (차별화 §4.7 우선순위 1) ──
let hsDrill = null; // { dir, q, answered, correct }
function renderHsDrill() {
  const frag = document.createDocumentFragment();
  const tree = state.hsTree;

  frag.appendChild(el('h2', {}, '🌳 HS 품목분류 트리 드릴'));
  frag.appendChild(el('div', { class: 'notice' }, [
    el('strong', {}, '가드레일: '),
    '부(21) 구조는 국제표준 골격입니다. 호(4단위) 이하 세부는 앱이 생성하지 않으며, ',
    el('strong', {}, '현행 공식 기본서로 사용자가 입력'),
    '한 항목만 드릴에 출제됩니다.',
  ]));

  // 드릴 위젯
  const headings = tree.headings;
  const drillBox = el('div', { class: 'drill-box' });
  if (headings.length === 0) {
    drillBox.appendChild(el('p', { class: 'hint' }, '드릴할 호(4단위) 항목이 없습니다. 아래에서 추가하세요.'));
  } else {
    if (!hsDrill) newHsQuestion();
    drillBox.appendChild(renderHsQuestion());
  }
  frag.appendChild(el('section', {}, [
    el('div', { class: 'section-head' }, [
      el('h3', {}, '드릴'),
      headings.length ? el('div', { class: 'drill-mode' }, [
        el('button', { class: 'btn tiny' + (hsDrill && hsDrill.dir === 'forward' ? ' active' : ''), onclick: () => { newHsQuestion('forward'); render(); } }, '정방향(이름→호)'),
        el('button', { class: 'btn tiny' + (hsDrill && hsDrill.dir === 'reverse' ? ' active' : ''), onclick: () => { newHsQuestion('reverse'); render(); } }, '역방향(호→이름)'),
      ]) : null,
    ]),
    drillBox,
  ]));

  // 트리 브라우저
  frag.appendChild(renderHsTreeBrowser(tree));

  // 호 추가 폼
  frag.appendChild(renderHsAddForm(tree));

  return frag;
}

function newHsQuestion(dir) {
  const headings = state.hsTree.headings;
  if (!headings.length) { hsDrill = null; return; }
  const useDir = dir || (hsDrill ? hsDrill.dir : (Math.random() < 0.5 ? 'forward' : 'reverse'));
  const q = headings[Math.floor(Math.random() * headings.length)];
  hsDrill = { dir: useDir, q, answered: false, correct: null };
}

function renderHsQuestion() {
  const { dir, q, answered } = hsDrill;
  const chapter = state.hsTree.chapters.find((c) => c.code === q.chapter);
  const wrap = el('div', {});
  if (dir === 'forward') {
    wrap.appendChild(el('div', { class: 'drill-q' }, [
      el('div', { class: 'drill-prompt' }, '다음 물품은 몇 호(4단위)인가?'),
      el('div', { class: 'drill-subject' }, q.title),
    ]));
    if (!answered) {
      const input = el('input', { class: 'inp code-input', inputmode: 'numeric', maxlength: '4', placeholder: '____', 'aria-label': '호 4자리' });
      const submit = () => {
        hsDrill.answered = true;
        hsDrill.correct = input.value.trim() === q.code;
        render();
      };
      wrap.appendChild(el('form', { class: 'drill-answer', onsubmit: (e) => { e.preventDefault(); submit(); } }, [
        input,
        el('button', { class: 'btn primary', type: 'submit' }, '확인'),
      ]));
    } else {
      wrap.appendChild(renderHsResult(q.code, `${q.code} — ${q.title}`, chapter));
    }
  } else {
    wrap.appendChild(el('div', { class: 'drill-q' }, [
      el('div', { class: 'drill-prompt' }, '다음 호(4단위)는 무엇인가?'),
      el('div', { class: 'drill-subject code' }, q.code),
    ]));
    if (!answered) {
      wrap.appendChild(el('div', { class: 'drill-answer' }, [
        el('button', { class: 'btn primary wide', onclick: () => { hsDrill.answered = true; render(); } }, '정답 보기'),
      ]));
    } else {
      wrap.appendChild(el('div', { class: 'drill-reveal' }, [
        el('div', { class: 'drill-answer-text' }, q.title),
        chapter ? el('div', { class: 'drill-context' }, `제${chapter.code}류 · ${chapter.title}`) : null,
        el('div', { class: 'self-grade' }, [
          el('button', { class: 'btn wrong', onclick: () => { newHsQuestion(); render(); } }, '✕ 다음'),
          el('button', { class: 'btn right', onclick: () => { newHsQuestion(); render(); } }, '✓ 다음'),
        ]),
      ]));
    }
  }
  return wrap;
}

function renderHsResult(correctCode, answerText, chapter) {
  const ok = hsDrill.correct;
  return el('div', { class: 'drill-reveal' }, [
    el('div', { class: 'drill-verdict ' + (ok ? 'ok' : 'no') }, ok ? '✓ 정답' : '✕ 오답'),
    el('div', { class: 'drill-answer-text', html: `정답: <code>${esc(correctCode)}</code> — ${esc(answerText.split('—')[1] || '')}` }),
    chapter ? el('div', { class: 'drill-context' }, `제${chapter.code}류 · ${chapter.title}`) : null,
    el('button', { class: 'btn primary', onclick: () => { newHsQuestion(); render(); } }, '다음 문제'),
  ]);
}

function renderHsTreeBrowser(tree) {
  const details = el('details', { class: 'tree-browser' }, [
    el('summary', {}, `트리 구조 보기 (부 ${tree.sections.length} · 류 ${tree.chapters.length} · 호 ${tree.headings.length})`),
  ]);
  const body = el('div', { class: 'tree-body' });
  for (const s of tree.sections) {
    const chapters = tree.chapters.filter((c) => c.section === s.no);
    const secNode = el('div', { class: 'tree-section' }, [
      el('div', { class: 'tree-sec-head' }, [
        el('span', { class: 'tree-sec-no' }, `제${s.no}부`),
        el('span', {}, s.title),
        el('span', { class: 'tree-range' }, `${s.chapters}류`),
      ]),
    ]);
    for (const ch of chapters) {
      const heads = tree.headings.filter((h) => h.chapter === ch.code);
      secNode.appendChild(el('div', { class: 'tree-chapter' }, [
        el('span', { class: 'code' }, `제${ch.code}류`),
        ' ', ch.title,
        ch.seed ? el('span', { class: 'mini-badge seed' }, '골격') : null,
      ]));
      for (const h of heads) {
        secNode.appendChild(el('div', { class: 'tree-heading' }, [
          el('span', { class: 'code' }, h.code), ' ', h.title,
          h.seed ? el('span', { class: 'mini-badge seed' }, '골격') : el('button', { class: 'btn tiny danger', onclick: () => { try { store.deleteHsHeading(h.code); if (hsDrill && hsDrill.q.code === h.code) newHsQuestion(); render(); } catch (err) { alert(err.message); } } }, '삭제'),
        ]));
      }
    }
    body.appendChild(secNode);
  }
  details.appendChild(body);
  return details;
}

function renderHsAddForm(tree) {
  const chapterSel = el('select', { class: 'inp' },
    tree.chapters.map((c) => el('option', { value: c.code }, `제${c.code}류 · ${c.title}`)));
  const codeInput = el('input', { class: 'inp code-input', maxlength: '4', inputmode: 'numeric', placeholder: '호 4자리 (예: 8703)' });
  const titleInput = el('input', { class: 'inp', placeholder: '호 명칭 (공식 기본서 기준)' });
  return el('section', {}, [
    el('h3', {}, '호(4단위) 추가 — 공식 기본서 입력'),
    el('form', {
      class: 'hs-add-form',
      onsubmit: (e) => {
        e.preventDefault();
        try {
          store.addHsHeading(chapterSel.value, codeInput.value, titleInput.value.trim());
          codeInput.value = ''; titleInput.value = '';
          newHsQuestion();
          render();
        } catch (err) { alert(err.message); }
      },
    }, [
      chapterSel, codeInput, titleInput,
      el('button', { class: 'btn primary', type: 'submit' }, '호 추가'),
    ]),
    el('p', { class: 'hint' }, '류(2단위) 도 필요하면 추가할 수 있습니다.'),
    (() => {
      const cCode = el('input', { class: 'inp code-input', maxlength: '2', inputmode: 'numeric', placeholder: '류 2자리' });
      const cTitle = el('input', { class: 'inp', placeholder: '류 명칭' });
      const cSec = el('input', { class: 'inp', placeholder: '부 (예: XVI)' });
      return el('form', {
        class: 'hs-add-form',
        onsubmit: (e) => {
          e.preventDefault();
          try {
            store.addHsChapter(cCode.value, cTitle.value.trim(), cSec.value.trim());
            cCode.value = ''; cTitle.value = ''; cSec.value = '';
            render();
          } catch (err) { alert(err.message); }
        },
      }, [cCode, cTitle, cSec, el('button', { class: 'btn', type: 'submit' }, '류 추가')]);
    })(),
  ]);
}

// ── 통계 (§4.6) ──
function renderStats() {
  const frag = document.createDocumentFragment();
  frag.appendChild(el('h2', {}, '📊 통계'));

  const totalCards = store.deckList().reduce((s, d) => s + d.cards.length, 0);
  const allReviews = state.reviewLog.length;
  const correctReviews = state.reviewLog.filter((r) => r.correct).length;
  const accuracy = allReviews ? Math.round((correctReviews / allReviews) * 100) : 0;

  frag.appendChild(el('div', { class: 'stats-tiles' }, [
    statTile(String(totalCards), '전체 카드'),
    statTile(String(reviewsToday()), '오늘 복습'),
    statTile(String(allReviews), '누적 복습'),
    statTile(accuracy + '%', '누적 정답률'),
  ]));

  // 덱별 box 분포
  frag.appendChild(el('h3', {}, '덱별 진도 · box 분포'));
  for (const dk of store.deckList()) {
    if (!dk.cards.length) continue;
    const dist = SRS.boxDistribution(dk.cards);
    const max = Math.max(...dist, 1);
    frag.appendChild(el('div', { class: 'dist-block' }, [
      el('div', { class: 'dist-head' }, [
        el('span', {}, dk.name),
        el('span', { class: 'muted' }, `진도 ${SRS.deckProgress(dk.cards)}%`),
      ]),
      el('div', { class: 'dist-bars' }, dist.map((n, i) =>
        el('div', { class: 'dist-col' }, [
          el('div', { class: 'dist-bar-wrap' }, [
            el('div', { class: 'dist-bar b' + (i + 1), style: `height:${(n / max) * 100}%`, title: `${n}장` }),
          ]),
          el('div', { class: 'dist-x' }, `${i + 1}`),
          el('div', { class: 'dist-n' }, String(n)),
        ])
      )),
    ]));
  }

  // 최근 7일 히트맵
  frag.appendChild(el('h3', {}, '최근 7일 복습'));
  frag.appendChild(renderHeatmap());

  return frag;
}

function statTile(num, label) {
  return el('div', { class: 'stat-tile' }, [
    el('div', { class: 'stat-num' }, num),
    el('div', { class: 'stat-label' }, label),
  ]);
}

function renderHeatmap() {
  const days = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * SRS.ONE_DAY);
    const t0 = d.getTime(), t1 = t0 + SRS.ONE_DAY;
    const count = state.reviewLog.filter((r) => r.ts >= t0 && r.ts < t1).length;
    days.push({ d, count });
  }
  const max = Math.max(...days.map((x) => x.count), 1);
  return el('div', { class: 'heatmap' }, days.map(({ d, count }) => {
    const level = count === 0 ? 0 : Math.ceil((count / max) * 4);
    return el('div', { class: 'heat-day' }, [
      el('div', { class: 'heat-cell l' + level, title: `${count}회` }, count ? String(count) : ''),
      el('div', { class: 'heat-label' }, `${d.getMonth() + 1}/${d.getDate()}`),
    ]);
  }));
}

// ── 데이터 입출력 (§4.5) ──
function renderData() {
  const frag = document.createDocumentFragment();
  frag.appendChild(el('h2', {}, '💾 데이터 백업 · 가져오기'));

  // JSON export
  frag.appendChild(el('section', {}, [
    el('h3', {}, 'JSON 전체 백업'),
    el('p', { class: 'hint' }, '모든 덱·카드·진도·설정을 하나의 파일로 내보냅니다.'),
    el('button', { class: 'btn primary', onclick: exportJSON }, '⬇ JSON 내보내기'),
  ]));

  // JSON import
  frag.appendChild(el('section', {}, [
    el('h3', {}, 'JSON 복원'),
    el('p', { class: 'notice' }, '⚠ 현재 데이터를 백업 파일로 완전히 대체합니다.'),
    fileInput('application/json,.json', async (text) => {
      if (!confirm('현재 데이터를 이 백업으로 덮어쓸까요?')) return;
      try {
        await store.importJSON(text);
        hsDrill = null;
        alert('복원 완료.');
        go('home');
      } catch (e) { alert('가져오기 실패: ' + e.message); }
    }),
  ]));

  // CSV import
  const resultBox = el('div', { class: 'import-result' });
  frag.appendChild(el('section', {}, [
    el('h3', {}, 'CSV 대량 가져오기'),
    el('p', { class: 'hint' }, [
      '컬럼: ', el('code', {}, 'deck, front, back, tags'),
      ' (선택: ', el('code', {}, 'box, due'),
      '). 헤더 행 자동 인식, 없는 덱은 자동 생성, 같은 덱+앞면 중복은 건너뜁니다.',
    ]),
    el('a', { class: 'link', href: sampleCSVUrl(), download: 'sample-cards.csv' }, '샘플 CSV 내려받기'),
    fileInput('text/csv,.csv,text/plain', (text) => {
      const res = store.importCSV(text, { detectDuplicates: true });
      resultBox.innerHTML = '';
      resultBox.appendChild(el('div', { class: 'notice ok' },
        `추가 ${res.added}장 · 건너뜀 ${res.skipped}장` +
        (res.createdDecks.length ? ` · 새 덱: ${res.createdDecks.join(', ')}` : '')));
    }),
    resultBox,
  ]));

  return frag;
}

function fileInput(accept, onText) {
  const input = el('input', {
    type: 'file', accept, class: 'file-input',
    onchange: (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => onText(reader.result);
      reader.readAsText(f, 'utf-8');
      e.target.value = '';
    },
  });
  return el('label', { class: 'file-label btn' }, ['파일 선택', input]);
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJSON() {
  const stamp = new Date().toISOString().slice(0, 10);
  download(`trade-cert-drill-${stamp}.json`, store.exportJSON(), 'application/json');
}

function sampleCSVUrl() {
  const csv = 'deck,front,back,tags\n' +
    '무역영어,`FTA`,Free Trade Agreement — 자유무역협정,약어\n' +
    '"품목분류(HS)","제39류는?","플라스틱과 그 제품","구조;류"\n';
  return 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
}

// ── 설정 (§4.3, D-day) ──
function renderSettings() {
  const frag = document.createDocumentFragment();
  frag.appendChild(el('h2', {}, '⚙️ 설정'));

  // 시험일
  frag.appendChild(el('section', {}, [
    el('h3', {}, '시험일 (D-day)'),
    el('div', { class: 'settings-list' }, state.exams.map((ex) =>
      el('label', { class: 'setting-row' }, [
        el('span', {}, ex.name),
        el('input', {
          type: 'date', value: ex.examDate || '',
          onchange: (e) => { store.setExamDate(ex.id, e.target.value); },
        }),
      ])
    )),
  ]));

  // 간격 상수
  const iv = state.settings.intervals;
  const inputs = {};
  frag.appendChild(el('section', {}, [
    el('h3', {}, '라이트너 간격 (box → 일)'),
    el('div', { class: 'interval-grid' }, [1, 2, 3, 4, 5].map((b) => {
      const input = el('input', { type: 'number', min: '0', value: String(iv[b]), class: 'inp' });
      inputs[b] = input;
      return el('label', { class: 'interval-cell' }, [
        el('span', {}, `box ${b}`), input,
      ]);
    })),
    el('label', { class: 'setting-row' }, [
      el('span', {}, '오답 재등장 지연(분)'),
      (() => { inputs.lapse = el('input', { type: 'number', min: '1', value: String(state.settings.lapseDelayMin), class: 'inp' }); return inputs.lapse; })(),
    ]),
    el('button', {
      class: 'btn primary',
      onclick: () => {
        const intervals = {};
        for (const b of [1, 2, 3, 4, 5]) intervals[b] = Math.max(0, Number(inputs[b].value) || 0);
        store.updateSettings({
          intervals,
          lapseDelayMin: Math.max(1, Number(inputs.lapse.value) || 10),
        });
        alert('저장되었습니다.');
      },
    }, '간격 저장'),
    el('p', { class: 'hint' }, '기본값: box1=0, box2=1, box3=3, box4=7, box5=16 일.'),
  ]));

  // 가드레일 고지
  frag.appendChild(el('section', { class: 'guardrail-note' }, [
    el('h3', {}, '콘텐츠 정확성 안내'),
    el('p', {}, [
      '시드 카드는 ', el('span', { class: 'badge seed' }, '골격'),
      ' 배지로 표시된 ',
      el('strong', {}, '확실도 높은 골격'), ' 만 제공합니다. HS 세부 호·소호(6·10단위), ',
      'PSR 협정별 계산식, 법령 조문·수치는 앱이 생성하지 않으니 ',
      el('strong', {}, '현행 공식 기본서로 직접 입력'), '하세요.',
    ]),
  ]));

  return frag;
}

// ═══════════════════════════════════════════════════════════════
//  부트스트랩
// ═══════════════════════════════════════════════════════════════
async function boot() {
  state = await store.init();
  window.addEventListener('beforeunload', () => { store.flushNow(); });
  render();
  // Service Worker 등록 (오프라인)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
