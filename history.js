// Undo / redo over full snapshots: board, row settings and the globals.
//
// Slider gestures produce many tiny changes; callers pass a `coalesce` key
// so repeated pushes for the same control within a short window collapse
// into one history entry.

import { state, cloneBoard } from "./state.js";

const LIMIT = 60;
const COALESCE_WINDOW_MS = 900;

const past = [];
const future = [];
let lastKey = null;
let lastTime = 0;

const cloneRow = (row) => ({
  ...row,
  samples: { ...row.samples },
  sampleNames: { ...row.sampleNames }
});

/** Capture everything undo should restore. AudioBuffers are shared by reference. */
export function snapshot() {
  return {
    board: cloneBoard(state.board),
    rows: state.rows.map(cloneRow),
    bpm: state.bpm,
    swing: state.swing,
    length: state.length,
    kit: state.kit,
    master: state.master
  };
}

/** Put a snapshot back into state. Selection is kept, clamped to the board. */
export function restore(snap) {
  state.board = cloneBoard(snap.board);
  state.rows = snap.rows.map(cloneRow);
  state.bpm = snap.bpm;
  state.swing = snap.swing;
  state.length = snap.length;
  state.kit = snap.kit;
  state.master = snap.master;
  state.selected = {
    row: Math.min(state.selected.row, state.board.length - 1),
    col: Math.min(state.selected.col, state.board[0].length - 1)
  };
}

/**
 * Record the current state before a change. With `coalesce`, a push that
 * follows another push with the same key inside the window is skipped, so a
 * slider drag becomes a single undo step.
 */
export function pushHistory({ coalesce = null } = {}) {
  const now = performance.now();
  if (coalesce && coalesce === lastKey && now - lastTime < COALESCE_WINDOW_MS) {
    lastTime = now;
    return;
  }
  lastKey = coalesce;
  lastTime = now;
  past.push(snapshot());
  if (past.length > LIMIT) past.shift();
  future.length = 0;
}

export function canUndo() {
  return past.length > 0;
}

export function canRedo() {
  return future.length > 0;
}

/** Step back. Returns false when there is nothing to undo. */
export function undo() {
  const previous = past.pop();
  if (!previous) return false;
  future.push(snapshot());
  restore(previous);
  lastKey = null;
  return true;
}

/** Step forward. Returns false when there is nothing to redo. */
export function redo() {
  const next = future.pop();
  if (!next) return false;
  past.push(snapshot());
  restore(next);
  lastKey = null;
  return true;
}
