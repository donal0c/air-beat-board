// Groove templates and the generative helpers built on them.
//
// A pattern is 5 rows (kick, snare, hat, perc, bass) by 8 columns. Each
// column is an eighth note; "first" fires on the eighth, "second" on the
// sixteenth after it, "both" on both. Patterns are written in a compact
// notation: "." empty, "x" first, "o" second, "X" both.

import { ROWS, COLS, STATE_ORDER, makeEmptyBoard } from "./state.js";

const GLYPH = { ".": "empty", x: "first", o: "second", X: "both" };
const GLYPH_OF = { empty: ".", first: "x", second: "o", both: "X" };

const parse = (rows) => rows.map((row) => [...row].map((glyph) => ({ state: GLYPH[glyph] })));

/** Board -> array of 8-character strings, one per row. */
export function encodePattern(board) {
  return board.map((row) => row.map((cell) => GLYPH_OF[cell.state] ?? ".").join(""));
}

/** Array of strings -> board. Unknown glyphs and short rows read as empty. */
export function decodePattern(rows) {
  return Array.from({ length: ROWS.length }, (_, r) => {
    const text = typeof rows[r] === "string" ? rows[r] : "";
    return Array.from({ length: COLS }, (_, c) => ({ state: GLYPH[text[c]] ?? "empty" }));
  });
}

export const GROOVES = [
  {
    id: "backbeat",
    name: "Backbeat",
    hint: "Straight rock feel, snare on 2 and 4.",
    pattern: parse(["X.x.x.x.", "..o...o.", "xxxxxxxx", ".o..x..o", "x..o.x.."])
  },
  {
    id: "house",
    name: "House",
    hint: "Four-on-the-floor with open hats on the offbeats.",
    pattern: parse(["x.x.x.x.", "..x...x.", ".x.x.x.x", ".o...o..", "xo.x.xo."])
  },
  {
    id: "lofi",
    name: "Lo-Fi",
    hint: "Lazy, sparse, a little behind the beat.",
    pattern: parse(["x..ox...", "..x..ox.", "x.X.x.o.", ".o...x.o", "x.o.x..."])
  },
  {
    id: "breakbeat",
    name: "Breakbeat",
    hint: "Chopped-break energy with a displaced kick.",
    pattern: parse(["X..o.x..", "..x...xo", "xxxxxxxx", ".o..o...", "x.o..x.."])
  },
  {
    id: "minimal",
    name: "Minimal",
    hint: "Just enough to move.",
    pattern: parse(["x...x...", "......x.", "..x...x.", "...o....", "x......."])
  },
  {
    id: "afro",
    name: "Afro Swing",
    hint: "Clave-leaning kick with busy sixteenth hats.",
    pattern: parse(["x..x..x.", "..o.x..o", "xXxxxXxx", ".o.ox..o", "x.o.x.o."])
  }
];

export const DEFAULT_GROOVE = "backbeat";

export function getGroove(id) {
  return GROOVES.find((groove) => groove.id === id) ?? GROOVES[0];
}

export function patternFromGroove(id) {
  return getGroove(id).pattern.map((row) => row.map((cell) => ({ ...cell })));
}

// Cells that carry a groove's identity. Mutate never touches them.
const ANCHORS = new Set(["0-0", "1-2", "1-6"]);

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];

/**
 * Change a few cells (2 to 4) while keeping the downbeat kick and the
 * backbeat snares. Returns the number of cells changed.
 */
export function mutateBoard(board) {
  const candidates = [];
  for (let row = 0; row < ROWS.length; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (!ANCHORS.has(`${row}-${col}`)) candidates.push([row, col]);
    }
  }
  const count = 2 + Math.floor(Math.random() * 3);
  let changed = 0;
  for (let i = 0; i < count && candidates.length; i += 1) {
    const index = Math.floor(Math.random() * candidates.length);
    const [row, col] = candidates.splice(index, 1)[0];
    const current = board[row][col].state;
    // Empty cells usually gain a single hit; filled cells drift or clear.
    const options = current === "empty"
      ? ["first", "first", "second"]
      : STATE_ORDER.filter((value) => value !== current);
    board[row][col].state = randomItem(options);
    changed += 1;
  }
  return changed;
}

// Hit density per row, tuned so random rows still sound like their part.
const DENSITY = [0.35, 0.25, 0.7, 0.3, 0.4];

/** Replace one row with a random part. The kick always keeps the downbeat. */
export function randomiseRow(board, row) {
  const density = DENSITY[row] ?? 0.3;
  for (let col = 0; col < COLS; col += 1) {
    let value = "empty";
    if (Math.random() < density) {
      const roll = Math.random();
      value = roll < 0.6 ? "first" : roll < 0.85 ? "second" : "both";
    }
    board[row][col].state = value;
  }
  if (row === 0 && board[0][0].state === "empty") board[0][0].state = "first";
}

/** Put one row back to the template's version of that row. */
export function resetRow(board, row, grooveId) {
  const template = getGroove(grooveId).pattern[row];
  board[row] = template.map((cell) => ({ ...cell }));
}

export const emptyPattern = makeEmptyBoard;
