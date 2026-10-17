// Keyboard shortcuts.
//
//   Space            play / pause        Escape        stop and reset
//   Arrow keys       move selection      1 2 3 4       set cell state
//   Backspace/Delete clear cell          M / S         mute / solo selected row
//   Cmd/Ctrl+Z       undo                Shift+Cmd/Ctrl+Z, Ctrl+Y   redo
//
// Shortcuts stay out of the way while a text field or select has focus.

import { state, ROWS, COLS, STATE_ORDER } from "../state.js";
import * as actions from "../actions.js";

const STATE_KEYS = { 1: "empty", 2: "first", 3: "second", 4: "both" };

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = target.getAttribute("type") || "text";
    return type !== "range" && type !== "checkbox" && type !== "button";
  }
  return false;
}

export function initKeyboard({ focusSelectedCell }) {
  document.addEventListener("keydown", (evt) => {
    if (isEditableTarget(evt.target)) return;
    const meta = evt.metaKey || evt.ctrlKey;
    const key = evt.key;

    if (meta && key.toLowerCase() === "z") {
      evt.preventDefault();
      if (evt.shiftKey) actions.redo();
      else actions.undo();
      return;
    }
    if (meta && key.toLowerCase() === "y") {
      evt.preventDefault();
      actions.redo();
      return;
    }
    if (meta || evt.altKey) return;

    if (key === " ") {
      evt.preventDefault();
      actions.togglePlayback();
      return;
    }
    if (key === "Escape") {
      evt.preventDefault();
      actions.stopAndReset();
      return;
    }

    const { row, col } = state.selected;
    if (key.startsWith("Arrow")) {
      evt.preventDefault();
      const dRow = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
      const dCol = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
      actions.selectCell((row + dRow + ROWS.length) % ROWS.length, (col + dCol + COLS) % COLS);
      focusSelectedCell();
      return;
    }
    if (STATE_KEYS[key]) {
      evt.preventDefault();
      actions.setCell(row, col, STATE_KEYS[key]);
      return;
    }
    if (key === "Backspace" || key === "Delete") {
      evt.preventDefault();
      actions.setCell(row, col, STATE_ORDER[0]);
      return;
    }
    if (key.toLowerCase() === "m") {
      evt.preventDefault();
      actions.toggleMute(row);
      return;
    }
    if (key.toLowerCase() === "s") {
      evt.preventDefault();
      actions.toggleSolo(row);
    }
  });
}
