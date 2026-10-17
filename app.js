// Entry point: collect DOM refs, wire the UI modules to the store and the
// audio engine, seed the first board and start the meter loop.

import { state, notify } from "./state.js";
import { audio, seedPattern } from "./actions.js";
import { initBoard } from "./ui/board.js";
import { initPanels } from "./ui/panels.js";

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
  sessionSelectedCell: $("#sessionSelectedCell"),
  message: $("#message"),
  rowLabels: $("#rowLabels"),
  beatGrid: $("#beatGrid"),
  channelStrips: $("#channelStrips"),
  tokenTray: $("#tokenTray"),
  tokenCount: $("#tokenCount"),
  selectedReadout: $("#selectedReadout"),
  cellPanel: $("#cellPanel"),
  soundPanel: $("#soundPanel"),
  soundReadout: $("#soundReadout"),
  rowGainValue: $("#rowGainValue"),
  rowDriveValue: $("#rowDriveValue"),
  rowToneValue: $("#rowToneValue"),
  rowDecayValue: $("#rowDecayValue"),
  rowPanValue: $("#rowPanValue"),
  rowPitchValue: $("#rowPitchValue"),
  rowSendValue: $("#rowSendValue"),
  clearBtn: $("#clearBtn"),
  importBtn: $("#importBtn"),
  randomizeBtn: $("#randomizeBtn"),
  undoBtn: $("#undoBtn"),
  sampleInput: $("#sampleInput"),
  sampleStatus: $("#sampleStatus")
};

function startMeter() {
  const tick = () => {
    const level = audio.tickMeter();
    refs.masterMeter.style.height = `${Math.round((0.08 + level * 0.92) * 100)}%`;
    requestAnimationFrame(tick);
  };
  tick();
}

function init() {
  // Seed before the UI mounts so the first render already shows the groove.
  seedPattern("warm", { silent: true });
  state.message = { text: "Click cells to compose. Press play when the board looks alive.", undo: false };

  initPanels(refs);
  const board = initBoard(refs);
  audio.onStep = board.renderPlayhead;

  notify();
  startMeter();
}

init();
