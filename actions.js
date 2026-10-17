// Every user-level operation lives here. UI modules call these; nothing
// else writes to state. Each action mutates state, then calls notify().

import {
  state, ROWS, STATE_ORDER, BPM_MIN, BPM_MAX, SWING_MAX,
  makeEmptyBoard, cloneBoard, describeState, boardIsEmpty, clamp, notify
} from "./state.js";
import { pushHistory, undo as historyUndo, redo as historyRedo } from "./history.js";
import { KITS } from "./audio/kits.js";
import { getGroove, patternFromGroove, mutateBoard as mutatePattern, randomiseRow as randomisePattern, resetRow as resetPatternRow } from "./grooves.js";
import { AirBeatAudio } from "./audio/engine.js";
import { saveToLocal, clearLocal, downloadSession, readSessionFile } from "./storage.js";

export const audio = new AirBeatAudio();

export function setMessage(text, options = {}) {
  state.message = { text, undo: Boolean(options.undo) };
  notify();
}

// ---------------------------------------------------------------- board

export function setCell(row, col, value, options = {}) {
  if (!state.board[row]?.[col]) return;
  if (!options.skipHistory) pushHistory();
  state.board[row][col].state = value;
  state.selected = { row, col };
  if (!options.silent) {
    state.message = { text: `${ROWS[row].label} column ${col + 1}: ${describeState(value)}`, undo: false };
  }
  notify();
}

export function cycleCell(row, col) {
  const current = state.board[row][col].state;
  const next = STATE_ORDER[(STATE_ORDER.indexOf(current) + 1) % STATE_ORDER.length];
  setCell(row, col, next);
}

export function selectCell(row, col) {
  state.selected = { row, col };
  notify();
}

export function selectRow(row) {
  state.selected = { row, col: state.selected.col };
  state.inspectorTab = "sound";
  state.message = { text: `${ROWS[row].label} sound controls selected.`, undo: false };
  notify();
}

/**
 * Drop a dragged token. `source` is { type: "tray" } or
 * { type: "cell", row, col }. Dropping a cell token on its own cell is a
 * no-op and leaves history untouched.
 */
export function dropToken(source, tokenState, row, col) {
  if (source.type === "cell" && source.row === row && source.col === col) return;

  pushHistory();
  if (source.type === "cell") {
    state.board[source.row][source.col].state = "empty";
  }
  const existing = state.board[row][col].state;
  state.board[row][col].state = existing === "empty" ? tokenState : "both";
  state.selected = { row, col };
  state.message = {
    text: `${ROWS[row].label} column ${col + 1}: ${describeState(state.board[row][col].state)}.`,
    undo: false
  };
  notify();
}

export function loadGroove(id, options = {}) {
  const groove = getGroove(id);
  const replaced = !boardIsEmpty();
  if (!options.silent) pushHistory();
  state.board = patternFromGroove(groove.id);
  state.groove = groove.id;
  if (!options.silent) {
    state.message = replaced
      ? { text: `${groove.name} replaced your board. ${groove.hint}`, undo: true }
      : { text: `${groove.name} loaded. ${groove.hint}`, undo: false };
  }
  notify();
}

export function mutateBoard() {
  pushHistory();
  const changed = mutatePattern(state.board);
  state.message = { text: `Mutated ${changed} cell${changed === 1 ? "" : "s"}. Kick and snare anchors kept.`, undo: false };
  notify();
}

export function randomiseRow(row) {
  pushHistory();
  randomisePattern(state.board, row);
  state.message = { text: `${ROWS[row].label} randomised. Undo if it lost the groove.`, undo: false };
  notify();
}

export function resetRow(row) {
  pushHistory();
  resetPatternRow(state.board, row, state.groove);
  state.message = { text: `${ROWS[row].label} reset to ${getGroove(state.groove).name}.`, undo: false };
  notify();
}

export function resetGroove() {
  const groove = getGroove(state.groove);
  pushHistory();
  state.board = patternFromGroove(groove.id);
  state.message = { text: `Board reset to ${groove.name}.`, undo: true };
  notify();
}

export function clearBoard() {
  pushHistory();
  state.board = makeEmptyBoard();
  state.currentStep = -1;
  state.message = { text: "Board cleared. Start with one token and let it loop.", undo: true };
  notify();
}

export function undo() {
  if (!historyUndo()) {
    setMessage("Nothing to undo.");
    return;
  }
  audio.setMaster(state.master);
  state.message = { text: "Undone.", undo: false };
  notify();
}

export function redo() {
  if (!historyRedo()) {
    setMessage("Nothing to redo.");
    return;
  }
  audio.setMaster(state.master);
  state.message = { text: "Redone.", undo: false };
  notify();
}

// ------------------------------------------------------------ transport

export async function togglePlayback() {
  if (state.playing) {
    state.playing = false;
    audio.pause();
    state.message = { text: "Playback paused.", undo: false };
    notify();
    return;
  }

  state.playing = true;
  state.message = { text: "Playback running. Move tokens while the loop plays.", undo: false };
  notify();
  await audio.play();
}

export function stopAndReset() {
  state.playing = false;
  state.currentStep = -1;
  audio.pause();
  audio.reset();
  state.message = { text: "Playhead reset.", undo: false };
  notify();
}

// -------------------------------------------------------------- globals

export function setBpm(value) {
  const parsed = Number(value);
  const next = clamp(Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : state.bpm, BPM_MIN, BPM_MAX);
  if (next === state.bpm) return;
  pushHistory({ coalesce: "bpm" });
  state.bpm = next;
  notify();
}

export function nudgeBpm(delta) {
  setBpm(state.bpm + delta);
}

export function setSwing(percent) {
  pushHistory({ coalesce: "swing" });
  state.swing = clamp(Number(percent) / 100, 0, SWING_MAX);
  notify();
}

export function setLength(value) {
  const next = Number(value);
  if (next === state.length) return;
  pushHistory({ coalesce: "length" });
  state.length = next;
  notify();
}

/** Changing the kit only changes the sound. The board is kept. */
export function setKit(key) {
  if (!KITS[key] || key === state.kit) return;
  pushHistory();
  state.kit = key;
  state.message = { text: `${KITS[key].name} kit. Board kept; pick a groove to replace it.`, undo: false };
  notify();
}

export function setMaster(percent) {
  pushHistory({ coalesce: "master" });
  state.master = Number(percent) / 100;
  audio.setMaster(state.master);
  notify();
}

export function setInspectorTab(tab) {
  state.inspectorTab = tab;
  notify();
}

// ----------------------------------------------------------------- rows

export function setSelectedRowParam(param, value) {
  const rowState = state.rows[state.selected.row];
  pushHistory({ coalesce: `row-${state.selected.row}-${param}` });
  if (param === "drive") rowState.drive = value / 100;
  else if (param === "tone") rowState.tone = value / 100;
  else if (param === "decay") rowState.decay = value / 100;
  else if (param === "pan") rowState.pan = value / 100;
  else if (param === "pitch") rowState.pitch = value;
  else if (param === "send") rowState.send = value / 100;
  else return;
  notify();
}

export function setRowVolume(row, percent) {
  pushHistory({ coalesce: `row-${row}-volume` });
  state.rows[row].volume = Number(percent) / 100;
  notify();
}

export function setRowColor(row, percent) {
  pushHistory({ coalesce: `row-${row}-color` });
  state.rows[row].color = Number(percent) / 100;
  notify();
}

export function toggleMute(row) {
  const rowState = state.rows[row];
  pushHistory();
  rowState.muted = !rowState.muted;
  state.message = { text: `${ROWS[row].label} ${rowState.muted ? "muted" : "back in"}.`, undo: false };
  notify();
}

export function toggleSolo(row) {
  const rowState = state.rows[row];
  pushHistory();
  rowState.solo = !rowState.solo;
  const soloed = state.rows.map((r, i) => (r.solo ? ROWS[i].label : null)).filter(Boolean);
  state.message = {
    text: soloed.length ? `Solo: ${soloed.join(", ")}.` : `${ROWS[row].label} solo off. Everyone is back.`,
    undo: false
  };
  notify();
}

export function toggleChoke(row) {
  const rowState = state.rows[row];
  pushHistory();
  rowState.choke = !rowState.choke;
  state.message = {
    text: rowState.choke
      ? `${ROWS[row].label} choke on: each hit cuts the one before it.`
      : `${ROWS[row].label} choke off: hits ring out.`,
    undo: false
  };
  notify();
}

export function setSlot(row, slot) {
  if (state.rows[row].slot === slot) return;
  pushHistory();
  state.rows[row].slot = slot;
  state.message = { text: `${ROWS[row].label} using sample slot ${slot.toUpperCase()}.`, undo: false };
  notify();
}

// ---------------------------------------------------------------- slots

const SLOT_NAMES = ["A", "B", "C", "D"];

function captureActiveSlot() {
  state.slots[state.activeSlot] = { board: cloneBoard(state.board), groove: state.groove, length: state.length };
}

function applySlot(index) {
  captureActiveSlot();
  const target = state.slots[index];
  state.activeSlot = index;
  state.pendingSlot = null;
  if (target) {
    state.board = cloneBoard(target.board);
    state.groove = target.groove;
    state.length = target.length;
  } else {
    state.board = makeEmptyBoard();
  }
}

/**
 * Switch to pattern slot `index`. While playing, the switch waits for the
 * next bar so the loop never stutters mid-phrase.
 */
export function selectSlot(index) {
  if (index === state.activeSlot) {
    state.pendingSlot = null;
    notify();
    return;
  }
  if (state.playing) {
    state.pendingSlot = index;
    state.message = { text: `Pattern ${SLOT_NAMES[index]} launches on the next bar.`, undo: false };
    notify();
    return;
  }
  pushHistory();
  applySlot(index);
  state.message = {
    text: state.slots[index] ? `Pattern ${SLOT_NAMES[index]}.` : `Pattern ${SLOT_NAMES[index]} is empty. Build something or duplicate another slot.`,
    undo: false
  };
  notify();
}

/** Called by the engine at the top of each bar. */
export function launchPendingSlot() {
  if (state.pendingSlot === null) return;
  pushHistory();
  const index = state.pendingSlot;
  applySlot(index);
  state.message = { text: `Pattern ${SLOT_NAMES[index]}.`, undo: false };
  notify();
}

/** Copy the live board into the next empty slot (or the next slot) and go there. */
export function duplicateSlot() {
  const count = state.slots.length;
  let target = -1;
  for (let i = 1; i < count; i += 1) {
    const candidate = (state.activeSlot + i) % count;
    if (!state.slots[candidate]) {
      target = candidate;
      break;
    }
  }
  if (target === -1) target = (state.activeSlot + 1) % count;
  pushHistory();
  captureActiveSlot();
  state.slots[target] = { board: cloneBoard(state.board), groove: state.groove, length: state.length };
  state.activeSlot = target;
  state.pendingSlot = null;
  state.message = { text: `Copied to pattern ${SLOT_NAMES[target]}. Edit it freely; ${SLOT_NAMES[(target + count - 1) % count]} is untouched.`, undo: false };
  notify();
}

// -------------------------------------------------------------- sessions

export function exportSession() {
  captureActiveSlot();
  downloadSession();
  state.message = { text: "Session saved as a JSON file. Import it anywhere to continue.", undo: false };
  notify();
}

export async function importSession(file) {
  if (!file) return;
  pushHistory();
  try {
    await readSessionFile(file);
    audio.setMaster(state.master);
    state.selected = { row: 0, col: 0 };
    state.message = { text: `Loaded ${file.name}. Imported samples need re-importing.`, undo: true };
  } catch (error) {
    console.error(error);
    historyUndo();
    state.message = { text: `Could not read ${file.name}: ${error.message}`, undo: false };
  }
  notify();
}

/** Forget the saved session and start from the default groove. */
export function freshSession() {
  pushHistory();
  clearLocal();
  state.board = patternFromGroove("backbeat");
  state.groove = "backbeat";
  state.slots = [null, null, null, null];
  state.activeSlot = 0;
  state.pendingSlot = null;
  state.message = { text: "Fresh board. The previous session is gone from this browser (Undo brings it back for now).", undo: true };
  notify();
  saveToLocal();
}

export async function importSample(file) {
  if (!file) return;
  try {
    await audio.ensure();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await audio.ac.decodeAudioData(arrayBuffer);
    const row = state.selected.row;
    const slot = state.rows[row].slot;
    pushHistory();
    state.rows[row].samples[slot] = buffer;
    state.rows[row].sampleNames[slot] = file.name;
    state.sampleStatus = `${ROWS[row].label} ${slot.toUpperCase()}: ${file.name}`;
    state.message = { text: `Imported ${file.name} into ${ROWS[row].label} slot ${slot.toUpperCase()}.`, undo: false };
  } catch (error) {
    console.error(error);
    state.sampleStatus = "Import failed";
    state.message = { text: "That audio file could not be decoded by the browser.", undo: false };
  }
  notify();
}
