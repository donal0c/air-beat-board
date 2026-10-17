// Session persistence: a JSON document that round-trips everything except
// decoded audio. Imported samples keep their names so the UI can say what
// was there; the buffers themselves must be re-imported.

import { state, ROWS, DEFAULT_SOUND, clamp, BPM_MIN, BPM_MAX, SWING_MAX, MAX_STEPS } from "./state.js";
import { KITS } from "./audio/kits.js";
import { getGroove, encodePattern, decodePattern } from "./grooves.js";

export const STORAGE_KEY = "air-beat-board:session:v1";
export const FORMAT_VERSION = 1;

const ROW_FIELDS = ["volume", "pitch", "send", "gain", "drive", "tone", "decay", "pan", "color", "muted", "slot"];

const encodeSlot = (slot) => (slot ? { board: encodePattern(slot.board), groove: slot.groove, length: slot.length } : null);
const decodeSlot = (slot) => (slot && Array.isArray(slot.board)
  ? { board: decodePattern(slot.board), groove: getGroove(slot.groove).id, length: clampLength(slot.length) }
  : null);

const clampLength = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 2 && n <= MAX_STEPS ? Math.round(n / 2) * 2 : MAX_STEPS;
};

/** Build the JSON-safe session document from state. */
export function serialize() {
  return {
    app: "air-beat-board",
    version: FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    bpm: state.bpm,
    swing: state.swing,
    length: state.length,
    kit: state.kit,
    groove: state.groove,
    master: state.master,
    board: encodePattern(state.board),
    rows: state.rows.map((row) => ({
      ...Object.fromEntries(ROW_FIELDS.map((field) => [field, row[field]])),
      sampleNames: { ...row.sampleNames }
    })),
    slots: state.slots.map(encodeSlot),
    activeSlot: state.activeSlot
  };
}

/**
 * Validate a document and copy it into state. Unknown or malformed fields
 * fall back to current values. Throws on anything that is not a session.
 */
export function deserialize(doc) {
  if (!doc || typeof doc !== "object" || doc.app !== "air-beat-board") {
    throw new Error("Not an Air Beat Board session file.");
  }
  if (!Array.isArray(doc.board) || doc.board.length !== ROWS.length) {
    throw new Error("Session file has no board.");
  }

  state.board = decodePattern(doc.board);
  state.bpm = clamp(Math.round(Number(doc.bpm) || state.bpm), BPM_MIN, BPM_MAX);
  state.swing = clamp(Number(doc.swing) || 0, 0, SWING_MAX);
  state.length = clampLength(doc.length);
  state.kit = KITS[doc.kit] ? doc.kit : state.kit;
  state.groove = getGroove(doc.groove).id;
  state.master = clamp(Number(doc.master) || state.master, 0, 1);

  if (Array.isArray(doc.rows)) {
    doc.rows.slice(0, ROWS.length).forEach((saved, index) => {
      if (!saved || typeof saved !== "object") return;
      const row = state.rows[index];
      for (const field of ROW_FIELDS) {
        if (field in saved) row[field] = saved[field];
      }
      row.slot = saved.slot === "b" ? "b" : "a";
      row.muted = Boolean(saved.muted);
      row.samples = { a: null, b: null };
      row.sampleNames = {
        a: typeof saved.sampleNames?.a === "string" ? saved.sampleNames.a : "built-in",
        b: typeof saved.sampleNames?.b === "string" ? saved.sampleNames.b : "empty"
      };
      for (const key of Object.keys(DEFAULT_SOUND)) {
        if (typeof row[key] !== "number" || Number.isNaN(row[key])) row[key] = DEFAULT_SOUND[key];
      }
      if (typeof row.volume !== "number") row.volume = 0.82;
      if (typeof row.pitch !== "number") row.pitch = 0;
    });
  }

  const slots = Array.isArray(doc.slots) ? doc.slots.map(decodeSlot) : [];
  state.slots = state.slots.map((_, index) => slots[index] ?? null);
  state.activeSlot = Number.isInteger(doc.activeSlot) && doc.activeSlot >= 0 && doc.activeSlot < state.slots.length
    ? doc.activeSlot
    : 0;
  state.pendingSlot = null;
}

export function saveToLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
    return true;
  } catch {
    return false;
  }
}

/** Returns true when a saved session was found and applied. */
export function loadFromLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    deserialize(JSON.parse(raw));
    return true;
  } catch (error) {
    console.warn("Saved session ignored:", error);
    return false;
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

/** Trigger a browser download of the current session. */
export function downloadSession() {
  const doc = serialize();
  const stamp = doc.savedAt.slice(0, 16).replace(/[:T]/g, "-");
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `air-beat-board-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a File and apply it. Resolves to the parsed document. */
export async function readSessionFile(file) {
  const text = await file.text();
  const doc = JSON.parse(text);
  deserialize(doc);
  return doc;
}

/** Debounced autosave: call once from app.js with the store's subscribe. */
export function startAutosave(subscribe, delayMs = 400) {
  let timer = null;
  subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      saveToLocal();
    }, delayMs);
  });
}

