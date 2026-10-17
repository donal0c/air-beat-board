// Single source of truth for Air Beat Board.
//
// `state` is a plain mutable object. Only actions.js should write to it;
// UI modules read it and re-render when `notify()` fires. Renderers are
// expected to diff against what they last drew, so a notify is cheap.

export const ROWS = [
  { id: "kick", label: "Kick", color: "#ffba4d" },
  { id: "snare", label: "Snare", color: "#ff716b" },
  { id: "hat", label: "Hat", color: "#60f2ff" },
  { id: "perc", label: "Perc", color: "#8dff80" },
  { id: "bass", label: "Bass", color: "#d7a8ff" }
];

export const COLS = 8;
export const STEPS_PER_COL = 2;
export const MAX_STEPS = COLS * STEPS_PER_COL;

export const STATE_ORDER = ["empty", "first", "second", "both"];

export const DEFAULT_SOUND = {
  drive: 0,
  tone: 0.62,
  decay: 1,
  pan: 0,
  send: 0.18,
  color: 0.48
};

export const BPM_MIN = 70;
export const BPM_MAX = 180;
export const SWING_MAX = 0.72;

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const closeTo = (a, b, epsilon = 0.0001) => Math.abs(a - b) <= epsilon;

export const makeEmptyBoard = () =>
  Array.from({ length: ROWS.length }, () =>
    Array.from({ length: COLS }, () => ({ state: "empty" }))
  );

export const cloneBoard = (board) => board.map((row) => row.map((cell) => ({ ...cell })));

const makeRowState = () => ({
  volume: 0.82,
  pitch: 0,
  send: DEFAULT_SOUND.send,
  drive: DEFAULT_SOUND.drive,
  tone: DEFAULT_SOUND.tone,
  decay: DEFAULT_SOUND.decay,
  pan: DEFAULT_SOUND.pan,
  color: DEFAULT_SOUND.color,
  muted: false,
  solo: false,
  /** When set, a new hit on this row cuts the previous one (hi-hat style). */
  choke: false,
  slot: "a",
  samples: { a: null, b: null },
  sampleNames: { a: "built-in", b: "empty" }
});

export const state = {
  board: makeEmptyBoard(),
  selected: { row: 0, col: 0 },
  playing: false,
  currentStep: -1,
  bpm: 128,
  swing: 0.56,
  length: MAX_STEPS,
  kit: "warm",
  groove: "backbeat",
  master: 0.82,
  /** Pattern slots A to D. The active slot's content is the live board. */
  slots: [null, null, null, null],
  activeSlot: 0,
  /** Slot queued to launch on the next bar while playing. */
  pendingSlot: null,
  inspectorTab: "cell",
  rows: ROWS.map(makeRowState),
  message: { text: "", undo: false },
  sampleStatus: "Built-in kit"
};

/** Put every field back to its first-load value. Used by tests and Fresh. */
export function resetState() {
  state.board = makeEmptyBoard();
  state.selected = { row: 0, col: 0 };
  state.playing = false;
  state.currentStep = -1;
  state.bpm = 128;
  state.swing = 0.56;
  state.length = MAX_STEPS;
  state.kit = "warm";
  state.groove = "backbeat";
  state.master = 0.82;
  state.inspectorTab = "cell";
  state.rows = ROWS.map(makeRowState);
  state.slots = [null, null, null, null];
  state.activeSlot = 0;
  state.pendingSlot = null;
  state.message = { text: "", undo: false };
  state.sampleStatus = "Built-in kit";
}

const listeners = new Set();

/** Register a renderer. Returns an unsubscribe function. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tell every renderer that `state` changed. */
export function notify() {
  for (const listener of listeners) listener(state);
}

export function describeState(value) {
  if (value === "first") return "first sixteenth";
  if (value === "second") return "second sixteenth";
  if (value === "both") return "both sixteenths";
  return "empty";
}

export function boardIsEmpty() {
  return state.board.every((row) => row.every((cell) => cell.state === "empty"));
}

/** Does the cell covering sixteenth `step` fire on that step for `row`? */
export function cellTriggersStep(row, step) {
  if (step < 0 || step >= state.length) return false;
  const col = Math.floor(step / STEPS_PER_COL);
  const sub = step % STEPS_PER_COL;
  const cell = state.board[row]?.[col];
  if (!cell) return false;
  if (cell.state === "both") return true;
  if (cell.state === "first" && sub === 0) return true;
  if (cell.state === "second" && sub === 1) return true;
  return false;
}
