// Undo stack. Board-only for now; A_PLUS_PLAN 1.4 widens this to full
// snapshots (board + rows + globals) and adds redo.

import { state, cloneBoard } from "./state.js";

const LIMIT = 40;

export function pushHistory() {
  state.history.push(cloneBoard(state.board));
  if (state.history.length > LIMIT) state.history.shift();
}

/** Pop the most recent board snapshot, or null when there is none. */
export function popHistory() {
  return state.history.pop() ?? null;
}
