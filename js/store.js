// store.js — 상태 관리 + IndexedDB 영속화 (오프라인 우선).
// 전체 상태를 단일 객체로 IndexedDB 에 저장/복원한다. 카드 5,000장까지 대응.

const DB_NAME = 'trade-cert-drill';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const STATE_KEY = 'state';
const STATE_VERSION = 1;

const DEFAULT_SETTINGS = {
  intervals: { 1: 0, 2: 1, 3: 3, 4: 7, 5: 16 },
  algo: 'leitner',
  lapseDelayMin: 10,
};

// ── IndexedDB 저수준 래퍼 ──
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── ID 생성 ──
let _idCounter = 0;
function uid(prefix) {
  _idCounter++;
  return `${prefix || 'id'}-${Date.now().toString(36)}-${_idCounter.toString(36)}`;
}

// ── 카드 정규화: 시드/누락 필드를 완전한 카드로 채운다 ──
function normalizeCard(raw, deckId, now) {
  return {
    id: raw.id || uid('c'),
    deckId,
    front: raw.front != null ? String(raw.front) : '',
    back: raw.back != null ? String(raw.back) : '',
    box: raw.box != null ? clampBox(raw.box) : 1,
    due: raw.due != null ? Number(raw.due) : 0, // 0 = 즉시 due
    seed: !!raw.seed,
    tags: Array.isArray(raw.tags) ? raw.tags.slice() : [],
    createdAt: raw.createdAt != null ? Number(raw.createdAt) : now,
    lastReviewed: raw.lastReviewed != null ? Number(raw.lastReviewed) : null,
    note: raw.note != null ? String(raw.note) : '',
  };
}

function clampBox(b) {
  b = Number(b) || 1;
  return Math.min(Math.max(Math.round(b), 1), 5);
}

// ── 시드로부터 초기 상태 생성 ──
function buildInitialState() {
  const now = Date.now();
  const { SEED_EXAMS, SEED_DECKS, SEED_HS_TREE } = window.SEED;
  const decks = {};
  for (const [deckId, def] of Object.entries(SEED_DECKS)) {
    decks[deckId] = {
      name: def.name,
      tag: def.tag,
      examId: def.examId || null,
      cards: def.cards.map((c) => normalizeCard(c, deckId, now)),
    };
  }
  return {
    version: STATE_VERSION,
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    exams: SEED_EXAMS.map((e) => ({ ...e })),
    decks,
    hsTree: JSON.parse(JSON.stringify(SEED_HS_TREE)),
    reviewLog: [], // {ts, correct, deckId}
    createdAt: now,
  };
}

// ── 로드된 상태 정규화(구버전/부분 데이터 보정) ──
function migrateState(state) {
  if (!state || typeof state !== 'object') return buildInitialState();
  const now = Date.now();
  state.version = state.version || STATE_VERSION;
  state.settings = Object.assign(
    JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    state.settings || {}
  );
  state.settings.intervals = Object.assign(
    { ...DEFAULT_SETTINGS.intervals },
    state.settings.intervals || {}
  );
  state.exams = Array.isArray(state.exams) ? state.exams : [];
  state.decks = state.decks || {};
  for (const [deckId, deck] of Object.entries(state.decks)) {
    deck.cards = (deck.cards || []).map((c) => normalizeCard(c, deckId, now));
    deck.examId = deck.examId || null;
    deck.tag = deck.tag || '';
    deck.name = deck.name || deckId;
  }
  if (!state.hsTree) state.hsTree = JSON.parse(JSON.stringify(window.SEED.SEED_HS_TREE));
  state.reviewLog = Array.isArray(state.reviewLog) ? state.reviewLog : [];
  return state;
}

// ── Store 클래스 ──
class Store {
  constructor() {
    this.state = null;
    this._saveTimer = null;
    this._listeners = new Set();
  }

  async init() {
    let saved;
    try {
      saved = await idbGet(STATE_KEY);
    } catch (e) {
      console.warn('IndexedDB load failed, starting fresh:', e);
    }
    this.state = saved ? migrateState(saved) : buildInitialState();
    if (!saved) await this._flush();
    return this.state;
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // 변경 후 호출: 리스너 통지 + 디바운스 저장.
  commit() {
    for (const fn of this._listeners) fn(this.state);
    this._scheduleSave();
  }

  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._flush(), 250);
  }

  async _flush() {
    try {
      await idbSet(STATE_KEY, this.state);
    } catch (e) {
      console.error('Persist failed:', e);
    }
  }

  // 종료 직전 즉시 저장(디바운스 무시).
  async flushNow() {
    clearTimeout(this._saveTimer);
    await this._flush();
  }

  // ── 덱 ──
  getDeck(id) { return this.state.decks[id]; }
  deckList() {
    return Object.entries(this.state.decks).map(([id, d]) => ({ id, ...d }));
  }
  createDeck(name, tag, examId) {
    const id = uid('deck');
    this.state.decks[id] = { name: name || '새 덱', tag: tag || '', examId: examId || null, cards: [] };
    this.commit();
    return id;
  }
  renameDeck(id, name, tag, examId) {
    const d = this.state.decks[id];
    if (!d) return;
    if (name != null) d.name = name;
    if (tag != null) d.tag = tag;
    if (examId !== undefined) d.examId = examId || null;
    this.commit();
  }
  deleteDeck(id) {
    delete this.state.decks[id];
    this.commit();
  }

  // ── 카드 ──
  addCard(deckId, { front, back, tags, note, box, due }) {
    const deck = this.state.decks[deckId];
    if (!deck) return null;
    const card = normalizeCard(
      { front, back, tags, note, box, due, seed: false }, deckId, Date.now()
    );
    deck.cards.push(card);
    this.commit();
    return card;
  }
  updateCard(deckId, cardId, patch) {
    const deck = this.state.decks[deckId];
    if (!deck) return;
    const card = deck.cards.find((c) => c.id === cardId);
    if (!card) return;
    if (patch.front != null) card.front = patch.front;
    if (patch.back != null) card.back = patch.back;
    if (patch.note != null) card.note = patch.note;
    if (patch.tags != null) card.tags = patch.tags;
    if (patch.box != null) card.box = clampBox(patch.box);
    if (patch.due != null) card.due = Number(patch.due);
    this.commit();
  }
  deleteCard(deckId, cardId) {
    const deck = this.state.decks[deckId];
    if (!deck) return;
    deck.cards = deck.cards.filter((c) => c.id !== cardId);
    this.commit();
  }

  // 채점 로그 기록
  logReview(deckId, correct) {
    this.state.reviewLog.push({ ts: Date.now(), correct: !!correct, deckId });
    // 로그 폭주 방지: 최근 5000개만 유지
    if (this.state.reviewLog.length > 5000) {
      this.state.reviewLog = this.state.reviewLog.slice(-5000);
    }
  }

  // ── 설정 ──
  updateSettings(patch) {
    Object.assign(this.state.settings, patch);
    this.commit();
  }
  setExamDate(examId, date) {
    const ex = this.state.exams.find((e) => e.id === examId);
    if (ex) { ex.examDate = date; this.commit(); }
  }

  // ── HS 트리 ──
  addHsHeading(chapterCode, code, title) {
    code = String(code).trim();
    if (!/^\d{4}$/.test(code)) throw new Error('호는 4자리 숫자여야 합니다.');
    const existing = this.state.hsTree.headings.find((h) => h.code === code);
    if (existing) throw new Error('이미 존재하는 호입니다.');
    this.state.hsTree.headings.push({ code, chapter: chapterCode, title, seed: false });
    this.commit();
  }
  deleteHsHeading(code) {
    const h = this.state.hsTree.headings.find((x) => x.code === code);
    if (h && h.seed) throw new Error('시드(골격) 항목은 삭제할 수 없습니다.');
    this.state.hsTree.headings = this.state.hsTree.headings.filter((x) => x.code !== code);
    this.commit();
  }
  addHsChapter(code, title, section) {
    code = String(code).trim();
    if (!/^\d{2}$/.test(code)) throw new Error('류는 2자리 숫자여야 합니다.');
    if (this.state.hsTree.chapters.find((c) => c.code === code)) {
      throw new Error('이미 존재하는 류입니다.');
    }
    this.state.hsTree.chapters.push({ code, title, section: section || '', seed: false });
    this.commit();
  }

  // ── Import / Export ──
  exportJSON() {
    return JSON.stringify(this.state, null, 2);
  }
  async importJSON(text) {
    const parsed = JSON.parse(text);
    this.state = migrateState(parsed);
    this.commit();
    await this.flushNow();
  }

  // CSV import: 컬럼 deck, front, back, tags[, box, due]. 헤더 인식, 미존재 덱 자동 생성.
  // 반환: { added, skipped, createdDecks }
  importCSV(text, { detectDuplicates = true, defaultBox = 1 } = {}) {
    const rows = parseCSV(text);
    if (!rows.length) return { added: 0, skipped: 0, createdDecks: [] };

    // 헤더 인식
    let header = rows[0].map((h) => h.trim().toLowerCase());
    let dataRows;
    const known = ['deck', 'front', 'back', 'tags', 'box', 'due'];
    const hasHeader = header.some((h) => known.includes(h));
    let idx;
    if (hasHeader) {
      idx = {
        deck: header.indexOf('deck'),
        front: header.indexOf('front'),
        back: header.indexOf('back'),
        tags: header.indexOf('tags'),
        box: header.indexOf('box'),
        due: header.indexOf('due'),
      };
      dataRows = rows.slice(1);
    } else {
      idx = { deck: 0, front: 1, back: 2, tags: 3, box: 4, due: 5 };
      dataRows = rows;
    }

    // 덱 이름 → id 매핑 (기존 이름 우선)
    const nameToId = {};
    for (const [id, d] of Object.entries(this.state.decks)) nameToId[d.name] = id;

    const createdDecks = [];
    let added = 0, skipped = 0;
    const now = Date.now();

    // 중복 감지용: deckId → Set(front)
    const frontSets = {};
    if (detectDuplicates) {
      for (const [id, d] of Object.entries(this.state.decks)) {
        frontSets[id] = new Set(d.cards.map((c) => c.front.trim()));
      }
    }

    for (const row of dataRows) {
      const deckName = (row[idx.deck] || '').trim();
      const front = (row[idx.front] || '').trim();
      const back = idx.back >= 0 ? (row[idx.back] || '').trim() : '';
      if (!deckName || !front) { skipped++; continue; }

      let deckId = nameToId[deckName];
      if (!deckId) {
        deckId = this.createDeck(deckName, '', null);
        nameToId[deckName] = deckId;
        createdDecks.push(deckName);
        frontSets[deckId] = new Set();
      }

      if (detectDuplicates && frontSets[deckId].has(front)) { skipped++; continue; }

      const tags = idx.tags >= 0 && row[idx.tags]
        ? row[idx.tags].split(/[;,|]/).map((t) => t.trim()).filter(Boolean)
        : [];
      const box = idx.box >= 0 && row[idx.box] ? clampBox(row[idx.box]) : defaultBox;
      const due = idx.due >= 0 && row[idx.due] ? Number(row[idx.due]) : 0;

      this.state.decks[deckId].cards.push(
        normalizeCard({ front, back, tags, box, due, seed: false }, deckId, now)
      );
      if (detectDuplicates) frontSets[deckId].add(front);
      added++;
    }

    this.commit();
    return { added, skipped, createdDecks };
  }
}

// ── 최소한의 CSV 파서 (따옴표·개행 내 필드 지원) ──
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', i = 0, inQuotes = false;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // 완전히 빈 행 제거
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

window.Store = Store;
window.uid = uid;
