// Builds a 5x5 American-style mini crossword: every white square belongs to
// an across word and a down word, each at least 3 letters. Deterministic for a
// given seed, so everyone gets the same daily puzzle.

// Black-square layouts, all symmetric and with no words shorter than 3 letters
export const PATTERNS = [
  ['##...', '#....', '.....', '....#', '...##'],
  ['...##', '....#', '.....', '#....', '##...'],
  ['#....', '#....', '.....', '....#', '....#'],
  ['....#', '....#', '.....', '#....', '#....'],
  ['#...#', '.....', '.....', '.....', '#...#'],
  ['#....', '.....', '.....', '.....', '....#'],
  ['....#', '.....', '.....', '.....', '#....'],
];

export function slotsOf(pattern) {
  const n = pattern.length;
  const slots = [];
  for (let r = 0; r < n; r += 1) {
    let c = 0;
    while (c < n) {
      if (pattern[r][c] === '#') {
        c += 1;
        continue;
      }
      const s = c;
      while (c < n && pattern[r][c] !== '#') c += 1;
      if (c - s >= 2) slots.push({ dir: 'across', row: r, col: s, cells: Array.from({ length: c - s }, (_, i) => [r, s + i]) });
    }
  }
  for (let c = 0; c < n; c += 1) {
    let r = 0;
    while (r < n) {
      if (pattern[r][c] === '#') {
        r += 1;
        continue;
      }
      const s = r;
      while (r < n && pattern[r][c] !== '#') r += 1;
      if (r - s >= 2) slots.push({ dir: 'down', row: s, col: c, cells: Array.from({ length: r - s }, (_, i) => [s + i, c]) });
    }
  }
  // Clue numbers, top-left to bottom-right
  const starts = new Map();
  let num = 0;
  for (let r = 0; r < n; r += 1)
    for (let c = 0; c < n; c += 1) {
      if (slots.some((s) => s.row === r && s.col === c)) {
        num += 1;
        starts.set(`${r},${c}`, num);
      }
    }
  for (const s of slots) s.num = starts.get(`${s.row},${s.col}`);
  return slots;
}

/** Index words by length and by (position, letter) for quick lookups. */
export function buildIndex(words) {
  const byLen = new Map();
  for (const w of words) {
    if (!byLen.has(w.length)) byLen.set(w.length, { words: [], pos: [] });
    const e = byLen.get(w.length);
    const i = e.words.length;
    e.words.push(w);
    for (let p = 0; p < w.length; p += 1) {
      if (!e.pos[p]) e.pos[p] = new Map();
      const m = e.pos[p];
      if (!m.has(w[p])) m.set(w[p], []);
      m.get(w[p]).push(i);
    }
  }
  return byLen;
}

function candidates(index, pattern) {
  const e = index.get(pattern.length);
  if (!e) return [];
  let ids = null;
  for (let p = 0; p < pattern.length; p += 1) {
    const ch = pattern[p];
    if (ch === '.') continue;
    const list = (e.pos[p] && e.pos[p].get(ch)) || [];
    if (ids === null) ids = list;
    else {
      const set = new Set(list);
      ids = ids.filter((i) => set.has(i));
    }
    if (!ids.length) return [];
  }
  return ids === null ? e.words : ids.map((i) => e.words[i]);
}

/**
 * Fill one pattern. `order(list)` shuffles candidate lists (seeded), and
 * `budget` caps the search. Returns { grid, slots } or null.
 */
export function fillPattern(pattern, index, order, budget = 4000) {
  const slots = slotsOf(pattern);
  const grid = pattern.map((row) => row.split('').map((ch) => (ch === '#' ? '#' : '')));
  const used = new Set();
  let steps = 0;
  const pat = (s) => s.cells.map(([r, c]) => grid[r][c] || '.').join('');

  function solve() {
    steps += 1;
    if (steps > budget) return false;
    let best = null;
    let bestList = null;
    for (const s of slots) {
      if (s.word) continue;
      const list = candidates(index, pat(s)).filter((w) => !used.has(w));
      if (!list.length) return false;
      if (!best || list.length < bestList.length) {
        best = s;
        bestList = list;
      }
    }
    if (!best) return true;
    for (const w of order(bestList).slice(0, 25)) {
      const before = best.cells.map(([r, c]) => grid[r][c]);
      best.cells.forEach(([r, c], i) => {
        grid[r][c] = w[i];
      });
      best.word = w;
      used.add(w);
      if (solve()) return true;
      used.delete(w);
      best.word = null;
      best.cells.forEach(([r, c], i) => {
        grid[r][c] = before[i];
      });
    }
    return false;
  }
  if (!solve()) return null;
  return { grid: grid.map((r) => r.join('')), slots: slots.map(({ dir, row, col, num, cells, word }) => ({ dir, row, col, num, len: cells.length, word })) };
}

/** A full puzzle for a seed: tries the layouts in a seeded order until one fills. */
export function generate(words, rand) {
  const index = buildIndex(words);
  const order = (list) => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const pattern = PATTERNS[Math.floor(rand() * PATTERNS.length)];
    const res = fillPattern(pattern, index, order, 3000);
    if (res) return { pattern, ...res };
  }
  return null;
}

/**
 * A freestyle crossword on an n x n grid (the Weekend puzzle): words are laid
 * across and down, each crossing at least one word already placed, with no
 * letters side by side outside a crossing. Returns { pattern, grid } or null.
 */
export function generateFree(words, rand, n = 11, target = 22) {
  const pool = words.filter((w) => w.length >= 3 && w.length <= n);
  const shuffle = (a) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  const byLetter = new Map();
  for (const w of pool)
    for (let i = 0; i < w.length; i += 1) {
      if (!byLetter.has(w[i])) byLetter.set(w[i], []);
      byLetter.get(w[i]).push([w, i]);
    }
  const grid = Array.from({ length: n }, () => Array(n).fill(''));
  const placed = [];
  const used = new Set();
  const at = (r, c) => (r < 0 || c < 0 || r >= n || c >= n ? '' : grid[r][c]);

  function fits(w, r, c, dir) {
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    const er = r + dr * (w.length - 1);
    const ec = c + dc * (w.length - 1);
    if (r < 0 || c < 0 || er >= n || ec >= n) return 0;
    if (at(r - dr, c - dc) || at(er + dr, ec + dc)) return 0;
    let crossings = 0;
    for (let i = 0; i < w.length; i += 1) {
      const y = r + dr * i;
      const x = c + dc * i;
      const g = grid[y][x];
      if (g) {
        if (g !== w[i]) return 0;
        crossings += 1;
      } else if (at(y + dc, x + dr) || at(y - dc, x - dr)) return 0; // no neighbours alongside
    }
    return crossings === w.length ? 0 : crossings;
  }
  function put(w, r, c, dir) {
    for (let i = 0; i < w.length; i += 1) grid[r + (dir === 'down' ? i : 0)][c + (dir === 'across' ? i : 0)] = w[i];
    placed.push({ w, r, c, dir });
    used.add(w);
  }

  const long = shuffle(pool.filter((w) => w.length >= 7 && w.length <= n - 2));
  if (!long.length) return null;
  const first = long[0];
  put(first, Math.floor(n / 2), Math.floor(rand() * (n - first.length + 1)), 'across');

  for (let tries = 0; tries < 900 && placed.length < target; tries += 1) {
    const host = placed[Math.floor(rand() * placed.length)];
    const k = Math.floor(rand() * host.w.length);
    const hr = host.r + (host.dir === 'down' ? k : 0);
    const hc = host.c + (host.dir === 'across' ? k : 0);
    const dir = host.dir === 'across' ? 'down' : 'across';
    const options = byLetter.get(host.w[k]) || [];
    let best = null;
    for (let j = 0; j < 60 && j < options.length; j += 1) {
      const [w, i] = options[Math.floor(rand() * options.length)];
      if (used.has(w)) continue;
      const r = dir === 'down' ? hr - i : hr;
      const c = dir === 'across' ? hc - i : hc;
      const x = fits(w, r, c, dir);
      // Prefer longer words and more crossings
      const score = x ? x * 3 + w.length : 0;
      if (score && (!best || score > best.score)) best = { w, r, c, score };
    }
    if (best) put(best.w, best.r, best.c, dir);
  }
  if (placed.length < 14) return null;
  const pattern = grid.map((row) => row.map((ch) => (ch ? '.' : '#')).join(''));
  // Every run of letters must be a placed word
  const words2 = new Set(placed.map((p) => p.w));
  for (const s of slotsOf(pattern)) {
    const word = s.cells.map(([r, c]) => grid[r][c]).join('');
    if (!words2.has(word)) return null;
  }
  return { pattern, grid: grid.map((row) => row.map((ch) => ch || '#').join('')) };
}
