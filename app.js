// Entry point: collect DOM refs, wire the UI modules to the store and the
// audio engine, seed the first board and start the meter loop.

import { state, notify, subscribe } from "./state.js";
import { audio, loadGroove, launchPendingSlot } from "./actions.js";
import { loadFromLocal, startAutosave } from "./storage.js";
import { initBoard } from "./ui/board.js";
import { initPanels } from "./ui/panels.js";
import { initKeyboard } from "./ui/keyboard.js";

const $ = (selector) => document.querySelector(selector);

const refs = {
  runtimeStatus: $("#runtimeStatus"),
  playBtn: $("#playBtn"),
  bigPlayBtn: $("#bigPlayBtn"),
  playIcon: $("#playIcon"),
  stopBtn: $("#stopBtn"),
  bpmInput: $("#bpmInput"),
  swingInput: $("#swingInput"),
  boardSwing: $("#boardSwing"),
  swingReadout: $("#swingReadout"),
  lengthSelect: $("#lengthSelect"),
  boardLength: $("#boardLength"),
  kitSelect: $("#kitSelect"),
  masterInput: $("#masterInput"),
  masterMeter: $("#masterMeter"),
  sessionKitReadout: $("#sessionKitReadout"),
  sessionBpmReadout: $("#sessionBpmReadout"),
  sessionLengthReadout: $("#sessionLengthReadout"),
  sessionSwingReadout: $("#sessionSwingReadout"),
  slotList: $("#slotList"),
  duplicateSlotBtn: $("#duplicateSlotBtn"),
  exportBtn: $("#exportBtn"),
  importSessionBtn: $("#importSessionBtn"),
  sessionInput: $("#sessionInput"),
  freshBtn: $("#freshBtn"),
  message: $("#message"),
  rowLabels: $("#rowLabels"),
  stepNumbers: $(".step-numbers"),
  beatGrid: $("#beatGrid"),
  channelStrips: $("#channelStrips"),
  tokenTray: $("#tokenTray"),
  tokenCount: $("#tokenCount"),
  selectedReadout: $("#selectedReadout"),
  cellPanel: $("#cellPanel"),
  soundPanel: $("#soundPanel"),
  soundReadout: $("#soundReadout"),
  rowDriveValue: $("#rowDriveValue"),
  rowToneValue: $("#rowToneValue"),
  rowDecayValue: $("#rowDecayValue"),
  rowPanValue: $("#rowPanValue"),
  rowPitchValue: $("#rowPitchValue"),
  rowSendValue: $("#rowSendValue"),
  clearBtn: $("#clearBtn"),
  importBtn: $("#importBtn"),
  grooveList: $("#grooveList"),
  grooveReadout: $("#grooveReadout"),
  mutateBtn: $("#mutateBtn"),
  resetGrooveBtn: $("#resetGrooveBtn"),
  randomiseRowBtn: $("#randomiseRowBtn"),
  resetRowBtn: $("#resetRowBtn"),
  undoBtn: $("#undoBtn"),
  redoBtn: $("#redoBtn"),
  sampleInput: $("#sampleInput"),
  sampleStatus: $("#sampleStatus")
};

function startFrameLoop() {
  const tick = () => {
    audio.pollVisuals();
    const level = audio.tickMeter();
    refs.masterMeter.style.height = `${Math.round((0.08 + level * 0.92) * 100)}%`;
    requestAnimationFrame(tick);
  };
  tick();
}

function init() {
  // Restore the last session, or seed the default groove on a first visit.
  if (loadFromLocal()) {
    state.message = { text: "Welcome back. Your last session was restored.", undo: false };
  } else {
    loadGroove(state.groove, { silent: true });
    state.message = { text: "Click cells to compose. Press play when the board looks alive.", undo: false };
  }

  const panels = initPanels(refs);
  const board = initBoard(refs);
  audio.onStep = board.renderPlayhead;
  audio.onBar = launchPendingSlot;
  audio.onHits = panels.flashRows;
  startAutosave(subscribe);
  initKeyboard({ focusSelectedCell: board.focusSelectedCell });

  notify();
  startFrameLoop();
}

init();
