// Every user-level operation lives here. UI modules call these; nothing
// else writes to state. Each action mutates state, then calls notify().

import {
  state, ROWS, STATE_ORDER, BPM_MIN, BPM_MAX, SWING_MAX,
  makeEmptyBoard, describeState, boardIsEmpty, clamp, notify
} from "./state.js";
import { pushHistory, undo as historyUndo, redo as historyRedo } from "./history.js";
import { KITS } from "./audio/kits.js";
import { getGroove, patternFromGroove, mutateBoard as mutatePattern, randomiseRow as randomisePattern, resetRow as resetPatternRow } from "./grooves.js";
import { AirBeatAudio } from "./audio/engine.js";

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
  if (param === "gain") rowState.gain = value / 100;
  else if (param === "drive") rowState.drive = value / 100;
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

export function setSlot(row, slot) {
  if (state.rows[row].slot === slot) return;
  pushHistory();
  state.rows[row].slot = slot;
  state.message = { text: `${ROWS[row].label} using sample slot ${slot.toUpperCase()}.`, undo: false };
  notify();
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
