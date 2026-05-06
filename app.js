import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/vision_bundle.mjs";

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

const ROWS = [
  { id: "kick", label: "Kick", color: "#ffba4d" },
  { id: "snare", label: "Snare", color: "#ff716b" },
  { id: "hat", label: "Hat", color: "#60f2ff" },
  { id: "perc", label: "Perc", color: "#8dff80" },
  { id: "bass", label: "Bass", color: "#d7a8ff" }
];

const KITS = {
  warm: {
    name: "Warm Studio",
    pattern: [
      ["both", "empty", "first", "empty", "first", "empty", "first", "empty"],
      ["empty", "empty", "second", "empty", "empty", "empty", "second", "empty"],
      ["first", "first", "first", "first", "first", "first", "first", "first"],
      ["empty", "second", "empty", "empty", "first", "empty", "empty", "second"],
      ["first", "empty", "empty", "second", "empty", "first", "empty", "empty"]
    ]
  },
  lofi: {
    name: "Lo-Fi Room",
    pattern: [
      ["first", "empty", "empty", "second", "first", "empty", "empty", "empty"],
      ["empty", "empty", "first", "empty", "empty", "second", "first", "empty"],
      ["first", "empty", "both", "empty", "first", "empty", "second", "empty"],
      ["empty", "second", "empty", "empty", "empty", "first", "empty", "second"],
      ["first", "empty", "second", "empty", "first", "empty", "empty", "empty"]
    ]
  },
  club: {
    name: "Club Utility",
    pattern: [
      ["both", "empty", "both", "empty", "both", "empty", "both", "empty"],
      ["empty", "empty", "first", "empty", "empty", "empty", "first", "empty"],
      ["both", "both", "both", "both", "both", "both", "both", "both"],
      ["empty", "first", "empty", "second", "empty", "first", "empty", "second"],
      ["first", "empty", "empty", "first", "empty", "empty", "second", "empty"]
    ]
  }
};

const STATE_ORDER = ["empty", "first", "second", "both"];
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

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
  cameraBtn: $("#cameraBtn"),
  cameraMode: $("#cameraMode"),
  webcam: $("#webcam"),
  handOverlay: $("#handOverlay"),
  cameraFallback: $("#cameraFallback"),
  leftCursor: $("#leftCursor"),
  rightCursor: $("#rightCursor"),
  leftConfidence: $("#leftConfidence"),
  rightConfidence: $("#rightConfidence"),
  message: $("#message"),
  rowLabels: $("#rowLabels"),
  beatGrid: $("#beatGrid"),
  channelStrips: $("#channelStrips"),
  tokenTray: $("#tokenTray"),
  tokenCount: $("#tokenCount"),
  selectedReadout: $("#selectedReadout"),
  clearBtn: $("#clearBtn"),
  importBtn: $("#importBtn"),
  randomizeBtn: $("#randomizeBtn"),
  undoBtn: $("#undoBtn"),
  sampleInput: $("#sampleInput"),
  sampleStatus: $("#sampleStatus")
};

const overlayCtx = refs.handOverlay.getContext("2d");

const makeEmptyBoard = () =>
  Array.from({ length: ROWS.length }, () =>
    Array.from({ length: 8 }, () => ({ state: "empty" }))
  );

const cloneBoard = (board) => board.map((row) => row.map((cell) => ({ ...cell })));

const state = {
  board: makeEmptyBoard(),
  selected: { row: 0, col: 0 },
  playing: false,
  currentStep: -1,
  bpm: 128,
  swing: 0.56,
  length: 16,
  kit: "warm",
  master: 0.82,
  rows: ROWS.map(() => ({
    volume: 0.82,
    pitch: 0,
    send: 0.18,
    muted: false,
    slot: "a",
    samples: { a: null, b: null },
    sampleNames: { a: "built-in", b: "empty" }
  })),
  history: [],
  drag: null,
  hand: {
    running: false,
    landmarker: null,
    stream: null,
    lastVideoTime: -1,
    left: null,
    right: null,
    prevPinch: false,
    prevFist: false,
    grabbed: null,
    lastFistAt: 0
  },
  suppressGridClick: false
};

class AirBeatAudio {
  constructor() {
    this.ac = null;
    this.master = null;
    this.comp = null;
    this.delay = null;
    this.delayFeedback = null;
    this.delayReturn = null;
    this.noiseBuffer = null;
    this.timer = null;
    this.step = 0;
    this.nextStepTime = 0;
    this.level = 0;
  }

  async ensure() {
    if (this.ac) {
      await this.ac.resume();
      return;
    }

    this.ac = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ac.createGain();
    this.master.gain.value = state.master;

    this.comp = this.ac.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 18;
    this.comp.ratio.value = 3.6;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.18;

    this.delay = this.ac.createDelay(1.2);
    this.delay.delayTime.value = 0.19;
    this.delayFeedback = this.ac.createGain();
    this.delayFeedback.gain.value = 0.28;
    this.delayReturn = this.ac.createGain();
    this.delayReturn.gain.value = 0.28;
    this.delay.connect(this.delayFeedback).connect(this.delay);
    this.delay.connect(this.delayReturn).connect(this.master);

    this.master.connect(this.comp).connect(this.ac.destination);
    this.noiseBuffer = this.createNoiseBuffer(2);

    await this.ac.resume();
  }

  createNoiseBuffer(seconds) {
    const buffer = this.ac.createBuffer(1, Math.floor(this.ac.sampleRate * seconds), this.ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  setMaster(value) {
    if (!this.master || !this.ac) return;
    this.master.gain.setTargetAtTime(value, this.ac.currentTime, 0.025);
  }

  async play() {
    await this.ensure();
    if (this.timer) return;

    this.step = Math.max(0, state.currentStep);
    this.nextStepTime = this.ac.currentTime + 0.08;
    this.timer = setInterval(() => this.scheduler(), 25);
  }

  pause() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  reset() {
    this.step = 0;
    this.nextStepTime = this.ac ? this.ac.currentTime + 0.08 : 0;
  }

  scheduler() {
    if (!this.ac || !state.playing) return;

    const stepDur = 60 / state.bpm / 4;
    const lookAhead = 0.15;

    while (this.nextStepTime < this.ac.currentTime + lookAhead) {
      const step = this.step % state.length;
      const swingOffset = step % 2 === 1 ? stepDur * (state.swing - 0.5) * 0.72 : 0;
      this.scheduleStep(step, this.nextStepTime + swingOffset);
      this.queueVisualStep(step, this.nextStepTime + swingOffset);

      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % state.length;
    }
  }

  queueVisualStep(step, t) {
    const delay = Math.max(0, (t - this.ac.currentTime) * 1000);
    setTimeout(() => {
      if (!state.playing) return;
      state.currentStep = step;
      renderPlayhead(step);
    }, delay);
  }

  scheduleStep(step, t) {
    for (let row = 0; row < ROWS.length; row += 1) {
      if (state.rows[row].muted) continue;
      if (cellTriggersStep(row, step)) {
        this.triggerRow(row, t);
      }
    }
  }

  triggerRow(row, t) {
    const rowState = state.rows[row];
    const slot = rowState.slot;
    const buffer = rowState.samples[slot];
    const volume = rowState.volume;
    const send = rowState.send;

    if (buffer) {
      this.sample(row, t, buffer, volume, rowState.pitch, send);
    } else {
      const kitLift = state.kit === "club" ? 1.12 : state.kit === "lofi" ? 0.82 : 1;
      if (row === 0) this.kick(t, volume * kitLift, rowState.pitch, send);
      if (row === 1) this.snare(t, volume * kitLift, rowState.pitch, send);
      if (row === 2) this.hat(t, volume * kitLift, rowState.pitch, send);
      if (row === 3) this.perc(t, volume * kitLift, rowState.pitch, send);
      if (row === 4) this.bass(t, volume * kitLift, rowState.pitch, send);
    }

    this.level = Math.min(1, this.level + 0.18 + volume * 0.2);
  }

  voiceOutput(gainValue, sendValue) {
    const out = this.ac.createGain();
    out.gain.value = gainValue;
    out.connect(this.master);

    if (sendValue > 0) {
      const send = this.ac.createGain();
      send.gain.value = sendValue * 0.46;
      out.connect(send).connect(this.delay);
    }

    return out;
  }

  envGain(t, peak, attack, decay, end = 0.0001) {
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(end, t + attack + decay);
    return g;
  }

  sample(row, t, buffer, volume, pitch, send) {
    const src = this.ac.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.pow(2, pitch / 12);

    const out = this.voiceOutput(0.78 * volume, send);
    src.connect(out);
    src.start(t);
  }

  kick(t, volume, pitch, send) {
    const osc = this.ac.createOscillator();
    const body = this.ac.createOscillator();
    const gain = this.envGain(t, 0.9 * volume, 0.004, 0.32);
    const out = this.voiceOutput(0.92, send);
    const pitchMul = Math.pow(2, pitch / 24);

    osc.type = "sine";
    body.type = "triangle";
    osc.frequency.setValueAtTime((132 + pitch * 2) * pitchMul, t);
    osc.frequency.exponentialRampToValueAtTime(44 * pitchMul, t + 0.18);
    body.frequency.value = 55 * pitchMul;

    osc.connect(gain);
    body.connect(gain);
    gain.connect(out);
    osc.start(t);
    body.start(t);
    osc.stop(t + 0.38);
    body.stop(t + 0.22);
  }

  snare(t, volume, pitch, send) {
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = this.ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1000 + pitch * 42;
    const bp = this.ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1850 + pitch * 35;
    bp.Q.value = 0.9;

    const gain = this.envGain(t, 0.35 * volume, 0.003, 0.16);
    const out = this.voiceOutput(1, send);

    src.connect(hp).connect(bp).connect(gain).connect(out);
    src.start(t);
    src.stop(t + 0.18);
  }

  hat(t, volume, pitch, send) {
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6200 + pitch * 110;
    const gain = this.envGain(t, 0.12 * volume, 0.001, 0.045);
    const out = this.voiceOutput(1, send);
    src.connect(hp).connect(gain).connect(out);
    src.start(t);
    src.stop(t + 0.08);
  }

  perc(t, volume, pitch, send) {
    const osc = this.ac.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(210 * Math.pow(2, pitch / 18), t);
    osc.frequency.exponentialRampToValueAtTime(125 * Math.pow(2, pitch / 18), t + 0.08);
    const gain = this.envGain(t, 0.22 * volume, 0.003, 0.105);
    const out = this.voiceOutput(0.85, send);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  bass(t, volume, pitch, send) {
    const osc = this.ac.createOscillator();
    const filter = this.ac.createBiquadFilter();
    const gain = this.envGain(t, 0.24 * volume, 0.006, 0.19);
    const out = this.voiceOutput(0.78, send);
    const root = state.kit === "lofi" ? 43 : state.kit === "club" ? 36 : 40;
    const freq = 440 * Math.pow(2, (root + pitch - 69) / 12);

    osc.type = "sawtooth";
    osc.frequency.value = freq;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900 + volume * 900, t);
    filter.frequency.exponentialRampToValueAtTime(180 + volume * 360, t + 0.18);
    filter.Q.value = 5.8;

    osc.connect(filter).connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.24);
  }
}

const audio = new AirBeatAudio();

function cellTriggersStep(row, step) {
  const col = Math.floor(step / 2);
  const sub = step % 2;
  const cell = state.board[row]?.[col];
  if (!cell || step >= state.length) return false;
  if (cell.state === "both") return true;
  if (cell.state === "first" && sub === 0) return true;
  if (cell.state === "second" && sub === 1) return true;
  return false;
}

function pushHistory() {
  state.history.push(cloneBoard(state.board));
  if (state.history.length > 40) state.history.shift();
}

function setMessage(text) {
  refs.message.textContent = text;
}

function setCell(row, col, value, options = {}) {
  if (!state.board[row] || !state.board[row][col]) return;
  if (!options.skipHistory) pushHistory();
  state.board[row][col].state = value;
  state.selected = { row, col };
  renderBoard();
  renderSelection();
}

function cycleCell(row, col) {
  const current = state.board[row][col].state;
  const next = STATE_ORDER[(STATE_ORDER.indexOf(current) + 1) % STATE_ORDER.length];
  setCell(row, col, next);
  setMessage(`${ROWS[row].label} column ${col + 1}: ${describeState(next)}`);
}

function describeState(value) {
  if (value === "first") return "first sixteenth";
  if (value === "second") return "second sixteenth";
  if (value === "both") return "both sixteenths";
  return "empty";
}

function selectCell(row, col) {
  state.selected = { row, col };
  renderBoard();
  renderSelection();
}

function flipSelected() {
  const { row, col } = state.selected;
  const current = state.board[row][col].state;
  if (current === "first") setCell(row, col, "second");
  else if (current === "second") setCell(row, col, "first");
  else if (current === "empty") setCell(row, col, "first");
  else setMessage("Stacked tokens already trigger both sixteenths.");
}

function seedPattern(key = state.kit) {
  pushHistory();
  state.board = KITS[key].pattern.map((row) => row.map((cellState) => ({ state: cellState })));
  renderBoard();
  renderSelection();
  setMessage(`${KITS[key].name} pattern loaded.`);
}

function renderStaticUi() {
  refs.rowLabels.innerHTML = ROWS.map((row, index) => `
    <div class="row-label" data-row-label="${index}">
      <strong>${index + 1}</strong>
      <span></span>
      <em>${row.label}</em>
    </div>
  `).join("");

  refs.channelStrips.innerHTML = ROWS.map((row, index) => `
    <div class="channel-strip" data-row="${index}">
      <div class="channel-meta">
        <span>Row ${index + 1}</span>
        <strong>${row.label}</strong>
        <i class="row-dot" style="background:${row.color};box-shadow:0 0 14px ${row.color}"></i>
      </div>
      <div class="channel-controls">
        <label class="knob-control">
          <span>Vol</span>
          <input class="row-volume" data-row="${index}" type="range" min="0" max="100" value="${Math.round(state.rows[index].volume * 100)}" />
        </label>
        <label class="knob-control">
          <span>Pitch</span>
          <input class="row-pitch" data-row="${index}" type="range" min="-24" max="24" value="0" />
        </label>
        <label class="knob-control">
          <span>Send</span>
          <input class="row-send" data-row="${index}" type="range" min="0" max="100" value="${Math.round(state.rows[index].send * 100)}" />
        </label>
        <div class="toggle-row">
          <button class="toggle-button mute-button" data-mute-row="${index}">Mute</button>
          <span>Sample</span>
          <button class="toggle-button slot-button active" data-slot-row="${index}" data-slot="a">A</button>
          <button class="toggle-button slot-button" data-slot-row="${index}" data-slot="b">B</button>
        </div>
      </div>
    </div>
  `).join("");

  refs.tokenTray.innerHTML = Array.from({ length: 12 }, (_, index) => `
    <button class="token ghost-token" data-token-index="${index}" aria-label="Drag beat token"></button>
  `).join("");
}

function renderBoard() {
  refs.beatGrid.innerHTML = "";

  for (let row = 0; row < ROWS.length; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const cell = document.createElement("button");
      const cellState = state.board[row][col].state;
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.dataset.testid = `cell-${row}-${col}`;
      cell.setAttribute("aria-label", `${ROWS[row].label} column ${col + 1}, ${describeState(cellState)}`);

      if (state.selected.row === row && state.selected.col === col) {
        cell.classList.add("selected");
      }

      if (col * 2 >= state.length) {
        cell.classList.add("outside-length");
      }

      if (cellState !== "empty") {
        const token = document.createElement("span");
        token.className = `token ${cellState}`;
        token.dataset.tokenCell = `${row}-${col}`;
        cell.appendChild(token);
      }

      refs.beatGrid.appendChild(cell);
    }
  }

  renderPlayhead(state.currentStep);
}

function renderPlayhead(step) {
  $$(".cell").forEach((cell) => {
    cell.classList.remove("play-col", "play-hit");
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (step >= 0 && col === Math.floor(step / 2)) {
      cell.classList.add("play-col");
      if (cellTriggersStep(row, step)) cell.classList.add("play-hit");
    }
  });

  $$("[data-row-label]").forEach((label) => {
    const row = Number(label.dataset.rowLabel);
    label.classList.toggle("active", step >= 0 && cellTriggersStep(row, step));
  });
}

function renderSelection() {
  const { row, col } = state.selected;
  const cellState = state.board[row][col].state;
  refs.selectedReadout.textContent = `${ROWS[row].label} · Col ${col + 1}`;

  $$(".state-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.state === cellState);
  });
}

function renderGlobalControls() {
  refs.playBtn.classList.toggle("playing", state.playing);
  refs.playIcon.textContent = state.playing ? "❚❚" : "▶";
  refs.bigPlayBtn.querySelector("span").textContent = state.playing ? "❚❚" : "▶";
  refs.runtimeStatus.textContent = state.playing ? "Playing" : "Ready";
  refs.runtimeStatus.classList.toggle("hot", state.playing);
  refs.bpmInput.value = String(state.bpm);
  refs.swingInput.value = String(Math.round(state.swing * 100));
  refs.boardSwing.value = String(Math.round(state.swing * 100));
  refs.swingReadout.textContent = `${Math.round(state.swing * 100)}%`;
  refs.lengthSelect.value = String(state.length);
  refs.boardLength.value = String(state.length);
  refs.masterInput.value = String(Math.round(state.master * 100));
}

function bindEvents() {
  refs.beatGrid.addEventListener("click", (evt) => {
    if (state.suppressGridClick) {
      state.suppressGridClick = false;
      return;
    }
    if (state.drag) return;
    const cell = evt.target.closest(".cell");
    if (!cell) return;
    cycleCell(Number(cell.dataset.row), Number(cell.dataset.col));
  });

  refs.beatGrid.addEventListener("pointerdown", (evt) => {
    const token = evt.target.closest(".token");
    if (!token) return;
    const cell = evt.target.closest(".cell");
    if (!cell) return;
    evt.preventDefault();
    evt.stopPropagation();
    selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
    startDrag({
      pointerId: evt.pointerId,
      x: evt.clientX,
      y: evt.clientY,
      source: { type: "cell", row: Number(cell.dataset.row), col: Number(cell.dataset.col) },
      tokenState: state.board[Number(cell.dataset.row)][Number(cell.dataset.col)].state
    });
  });

  refs.tokenTray.addEventListener("pointerdown", (evt) => {
    const token = evt.target.closest(".ghost-token");
    if (!token) return;
    evt.preventDefault();
    startDrag({
      pointerId: evt.pointerId,
      x: evt.clientX,
      y: evt.clientY,
      source: { type: "tray" },
      tokenState: "first"
    });
  });

  document.addEventListener("pointermove", (evt) => {
    if (!state.drag || state.drag.pointerId !== evt.pointerId) return;
    moveDrag(evt.clientX, evt.clientY);
  });

  document.addEventListener("pointerup", (evt) => {
    if (!state.drag || state.drag.pointerId !== evt.pointerId) return;
    finishDrag(evt.clientX, evt.clientY);
  });

  $$(".state-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const { row, col } = state.selected;
      setCell(row, col, btn.dataset.state);
      setMessage(`${ROWS[row].label} column ${col + 1}: ${describeState(btn.dataset.state)}`);
    });
  });

  refs.playBtn.addEventListener("click", togglePlayback);
  refs.bigPlayBtn.addEventListener("click", togglePlayback);
  refs.stopBtn.addEventListener("click", stopAndReset);
  refs.clearBtn.addEventListener("click", clearBoard);
  refs.randomizeBtn.addEventListener("click", () => seedPattern(state.kit));
  refs.undoBtn.addEventListener("click", undoBoard);
  refs.importBtn.addEventListener("click", () => refs.sampleInput.click());
  refs.sampleInput.addEventListener("change", handleSampleImport);
  refs.cameraBtn.addEventListener("click", toggleCamera);

  refs.bpmInput.addEventListener("input", () => {
    state.bpm = clamp(Number(refs.bpmInput.value) || 128, 70, 180);
  });

  const syncSwing = (value) => {
    state.swing = clamp(Number(value) / 100, 0, 0.72);
    refs.swingInput.value = String(Math.round(state.swing * 100));
    refs.boardSwing.value = String(Math.round(state.swing * 100));
    refs.swingReadout.textContent = `${Math.round(state.swing * 100)}%`;
  };

  refs.swingInput.addEventListener("input", () => syncSwing(refs.swingInput.value));
  refs.boardSwing.addEventListener("input", () => syncSwing(refs.boardSwing.value));

  const syncLength = (value) => {
    state.length = Number(value);
    refs.lengthSelect.value = String(state.length);
    refs.boardLength.value = String(state.length);
    renderBoard();
  };

  refs.lengthSelect.addEventListener("change", () => syncLength(refs.lengthSelect.value));
  refs.boardLength.addEventListener("input", () => syncLength(refs.boardLength.value));

  refs.kitSelect.addEventListener("change", () => {
    state.kit = refs.kitSelect.value;
    seedPattern(state.kit);
  });

  refs.masterInput.addEventListener("input", () => {
    state.master = Number(refs.masterInput.value) / 100;
    audio.setMaster(state.master);
  });

  refs.channelStrips.addEventListener("input", (evt) => {
    const target = evt.target;
    if (target.classList.contains("row-volume")) {
      state.rows[Number(target.dataset.row)].volume = Number(target.value) / 100;
    }
    if (target.classList.contains("row-pitch")) {
      state.rows[Number(target.dataset.row)].pitch = Number(target.value);
    }
    if (target.classList.contains("row-send")) {
      state.rows[Number(target.dataset.row)].send = Number(target.value) / 100;
    }
  });

  refs.channelStrips.addEventListener("click", (evt) => {
    const mute = evt.target.closest("[data-mute-row]");
    if (mute) {
      const row = Number(mute.dataset.muteRow);
      state.rows[row].muted = !state.rows[row].muted;
      mute.classList.toggle("muted", state.rows[row].muted);
      mute.textContent = state.rows[row].muted ? "Muted" : "Mute";
      setMessage(`${ROWS[row].label} ${state.rows[row].muted ? "muted" : "back in"}.`);
      return;
    }

    const slot = evt.target.closest("[data-slot-row]");
    if (slot) {
      const row = Number(slot.dataset.slotRow);
      state.rows[row].slot = slot.dataset.slot;
      refs.channelStrips
        .querySelectorAll(`[data-slot-row="${row}"]`)
        .forEach((btn) => btn.classList.toggle("active", btn.dataset.slot === slot.dataset.slot));
      setMessage(`${ROWS[row].label} using sample slot ${slot.dataset.slot.toUpperCase()}.`);
    }
  });
}

function startDrag(data) {
  state.drag = {
    ...data,
    moved: false,
    proxy: document.createElement("div")
  };
  state.drag.proxy.className = "drag-proxy";
  state.drag.proxy.innerHTML = `<span class="token ${data.tokenState}"></span>`;
  document.body.appendChild(state.drag.proxy);
  moveDrag(data.x, data.y);
}

function moveDrag(x, y) {
  if (!state.drag) return;
  state.drag.moved = true;
  state.drag.proxy.style.left = `${x - 27}px`;
  state.drag.proxy.style.top = `${y - 27}px`;
}

function finishDrag(x, y) {
  if (!state.drag) return;
  const drag = state.drag;
  drag.proxy.remove();
  state.drag = null;

  const dropTarget = document.elementFromPoint(x, y)?.closest?.(".cell");
  state.suppressGridClick = true;
  if (!dropTarget) {
    setMessage("Token released outside the board.");
    return;
  }

  const row = Number(dropTarget.dataset.row);
  const col = Number(dropTarget.dataset.col);
  pushHistory();

  if (drag.source.type === "cell") {
    state.board[drag.source.row][drag.source.col].state = "empty";
  }

  const existing = state.board[row][col].state;
  state.board[row][col].state = existing === "empty" ? drag.tokenState : "both";
  state.selected = { row, col };
  renderBoard();
  renderSelection();
  setMessage(`${ROWS[row].label} column ${col + 1}: ${describeState(state.board[row][col].state)}.`);
}

function undoBoard() {
  const previous = state.history.pop();
  if (!previous) {
    setMessage("No board changes to undo.");
    return;
  }
  state.board = previous;
  renderBoard();
  renderSelection();
  setMessage("Board change undone.");
}

function clearBoard() {
  pushHistory();
  state.board = makeEmptyBoard();
  state.currentStep = -1;
  renderBoard();
  renderSelection();
  setMessage("Board cleared. Start with one token and let it loop.");
}

async function togglePlayback() {
  if (state.playing) {
    state.playing = false;
    audio.pause();
    renderGlobalControls();
    setMessage("Playback paused.");
    return;
  }

  state.playing = true;
  renderGlobalControls();
  setMessage("Playback running. Move tokens while the loop plays.");
  await audio.play();
}

function stopAndReset() {
  state.playing = false;
  state.currentStep = -1;
  audio.pause();
  audio.reset();
  renderGlobalControls();
  renderPlayhead(-1);
  setMessage("Playhead reset.");
}

async function handleSampleImport() {
  const file = refs.sampleInput.files?.[0];
  if (!file) return;

  try {
    await audio.ensure();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await audio.ac.decodeAudioData(arrayBuffer);
    const row = state.selected.row;
    const slot = state.rows[row].slot;
    state.rows[row].samples[slot] = buffer;
    state.rows[row].sampleNames[slot] = file.name;
    refs.sampleStatus.textContent = `${ROWS[row].label} ${slot.toUpperCase()}: ${file.name}`;
    setMessage(`Imported ${file.name} into ${ROWS[row].label} slot ${slot.toUpperCase()}.`);
  } catch (error) {
    console.error(error);
    refs.sampleStatus.textContent = "Import failed";
    setMessage("That audio file could not be decoded by the browser.");
  } finally {
    refs.sampleInput.value = "";
  }
}

async function toggleCamera() {
  if (state.hand.running) {
    stopCamera();
    return;
  }
  await startCamera();
}

async function startCamera() {
  refs.cameraBtn.disabled = true;
  refs.cameraBtn.textContent = "Loading...";
  refs.cameraMode.textContent = "Starting tracker";
  setMessage("Loading hand tracker...");

  try {
    state.hand.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 960 },
        facingMode: "user"
      }
    });

    refs.webcam.srcObject = state.hand.stream;
    await new Promise((resolve) => {
      refs.webcam.onloadedmetadata = resolve;
    });
    await refs.webcam.play();

    if (!state.hand.landmarker) {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      state.hand.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55
      });
    }

    state.hand.running = true;
    refs.webcam.classList.add("live");
    refs.cameraFallback.classList.add("hidden");
    refs.cameraBtn.disabled = false;
    refs.cameraBtn.textContent = "Stop camera";
    refs.cameraBtn.classList.add("running");
    refs.cameraMode.textContent = "Tracking enabled";
    setMessage("Camera live. Open hand moves the cursor; pinch grabs tokens.");
    requestAnimationFrame(handFrameLoop);
  } catch (error) {
    console.error(error);
    refs.cameraBtn.disabled = false;
    refs.cameraBtn.textContent = "Start camera";
    refs.cameraBtn.classList.remove("running");
    refs.cameraMode.textContent = "Camera unavailable";
    refs.runtimeStatus.classList.add("warn");
    setMessage(cameraErrorMessage(error));
  }
}

function stopCamera() {
  state.hand.running = false;
  state.hand.left = null;
  state.hand.right = null;
  state.hand.prevPinch = false;
  state.hand.prevFist = false;
  if (state.hand.stream) {
    state.hand.stream.getTracks().forEach((track) => track.stop());
    state.hand.stream = null;
  }
  refs.webcam.pause();
  refs.webcam.srcObject = null;
  refs.webcam.classList.remove("live");
  refs.cameraFallback.classList.remove("hidden");
  refs.cameraBtn.textContent = "Start camera";
  refs.cameraBtn.classList.remove("running");
  refs.cameraMode.textContent = "Manual mode";
  refs.leftCursor.style.display = "none";
  refs.rightCursor.style.display = "none";
  refs.leftConfidence.textContent = "not visible";
  refs.rightConfidence.textContent = "not visible";
  overlayCtx.clearRect(0, 0, refs.handOverlay.width, refs.handOverlay.height);
  setMessage("Camera stopped. Mouse and touch still control the board.");
}

function cameraErrorMessage(error) {
  if (!navigator.mediaDevices?.getUserMedia) return "This browser context does not support camera access.";
  if (error?.name === "NotAllowedError") return "Camera permission was blocked. Manual controls are still fully available.";
  if (error?.name === "NotFoundError") return "No camera was found. Manual controls are still fully available.";
  if (error?.name === "NotReadableError") return "The camera is busy in another app. Manual controls are still fully available.";
  return "Camera or hand tracking failed. Manual controls are still fully available.";
}

function handFrameLoop() {
  if (!state.hand.running) return;

  resizeOverlay();

  if (refs.webcam.readyState >= 2 && refs.webcam.currentTime !== state.hand.lastVideoTime) {
    state.hand.lastVideoTime = refs.webcam.currentTime;
    const results = state.hand.landmarker.detectForVideo(refs.webcam, performance.now());
    processHands(results);
    drawHands(results);
    updateHandControls();
  }

  requestAnimationFrame(handFrameLoop);
}

function resizeOverlay() {
  const width = refs.webcam.videoWidth || 640;
  const height = refs.webcam.videoHeight || 480;
  if (refs.handOverlay.width !== width || refs.handOverlay.height !== height) {
    refs.handOverlay.width = width;
    refs.handOverlay.height = height;
  }
}

function processHands(results) {
  const detected = [];
  const hands = results?.landmarks ?? [];
  const handedness = results?.handednesses ?? results?.handedness ?? [];

  for (let i = 0; i < hands.length; i += 1) {
    const landmarks = hands[i];
    const center = palmCenter(landmarks);
    const score = handedness[i]?.[0]?.score ?? 0.9;

    detected.push({
      x: 1 - center.x,
      y: center.y,
      z: center.z,
      raw: landmarks,
      mirrored: landmarks.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z ?? 0 })),
      score
    });
  }

  detected.sort((a, b) => a.x - b.x);
  state.hand.left = detected[0] ?? null;
  state.hand.right = detected.length > 1 ? detected[detected.length - 1] : null;

  if (detected.length === 1 && detected[0].x > 0.5) {
    state.hand.left = null;
    state.hand.right = detected[0];
  }

  refs.leftConfidence.textContent = state.hand.left ? `${Math.round(state.hand.left.score * 100)}%` : "not visible";
  refs.rightConfidence.textContent = state.hand.right ? `${Math.round(state.hand.right.score * 100)}%` : "not visible";
}

function palmCenter(landmarks) {
  const ids = [0, 5, 9, 13, 17];
  const sum = ids.reduce((acc, id) => {
    acc.x += landmarks[id].x;
    acc.y += landmarks[id].y;
    acc.z += landmarks[id].z ?? 0;
    return acc;
  }, { x: 0, y: 0, z: 0 });

  return {
    x: sum.x / ids.length,
    y: sum.y / ids.length,
    z: sum.z / ids.length
  };
}

function updateHandControls() {
  const hand = state.hand.right || state.hand.left;
  updateCursor(refs.leftCursor, state.hand.left, "L");
  updateCursor(refs.rightCursor, state.hand.right, "R");

  if (!hand) {
    state.hand.prevPinch = false;
    state.hand.prevFist = false;
    return;
  }

  const pointer = projectHandToViewport(hand);
  const pinch = isPinch(hand);
  const fist = isFist(hand);

  if (pinch && !state.hand.prevPinch) {
    beginHandGrab(pointer.x, pointer.y);
  }

  if (!pinch && state.hand.prevPinch) {
    endHandGrab(pointer.x, pointer.y);
  }

  if (state.hand.grabbed && pinch) {
    moveHandGrab(pointer.x, pointer.y);
  }

  if (fist && !state.hand.prevFist && performance.now() - state.hand.lastFistAt > 700) {
    const cell = document.elementFromPoint(pointer.x, pointer.y)?.closest?.(".cell");
    if (cell) selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
    flipSelected();
    state.hand.lastFistAt = performance.now();
  }

  state.hand.prevPinch = pinch;
  state.hand.prevFist = fist;
}

function projectHandToViewport(hand) {
  return {
    x: hand.x * window.innerWidth,
    y: hand.y * window.innerHeight
  };
}

function updateCursor(el, hand, label) {
  if (!hand) {
    el.style.display = "none";
    return;
  }
  const pointer = projectHandToViewport(hand);
  el.style.display = "grid";
  el.style.left = `${pointer.x}px`;
  el.style.top = `${pointer.y}px`;
  el.textContent = label;
  el.classList.toggle("grabbing", isPinch(hand));
}

function beginHandGrab(x, y) {
  const cell = document.elementFromPoint(x, y)?.closest?.(".cell");
  if (!cell) return;

  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  selectCell(row, col);

  const tokenState = state.board[row][col].state === "empty" ? "first" : state.board[row][col].state;
  state.hand.grabbed = {
    source: state.board[row][col].state === "empty" ? { type: "hand" } : { type: "cell", row, col },
    tokenState,
    proxy: document.createElement("div")
  };
  state.hand.grabbed.proxy.className = "drag-proxy";
  state.hand.grabbed.proxy.innerHTML = `<span class="token ${tokenState}"></span>`;
  document.body.appendChild(state.hand.grabbed.proxy);
  moveHandGrab(x, y);
}

function moveHandGrab(x, y) {
  const drag = state.hand.grabbed;
  if (!drag) return;
  drag.proxy.style.left = `${x - 27}px`;
  drag.proxy.style.top = `${y - 27}px`;
}

function endHandGrab(x, y) {
  const drag = state.hand.grabbed;
  if (!drag) return;
  drag.proxy.remove();
  state.hand.grabbed = null;

  const cell = document.elementFromPoint(x, y)?.closest?.(".cell");
  if (!cell) return;

  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  pushHistory();
  if (drag.source.type === "cell") {
    state.board[drag.source.row][drag.source.col].state = "empty";
  }
  const existing = state.board[row][col].state;
  state.board[row][col].state = existing === "empty" ? drag.tokenState : "both";
  state.selected = { row, col };
  renderBoard();
  renderSelection();
  setMessage(`Hand placed token on ${ROWS[row].label} column ${col + 1}.`);
}

function isPinch(hand) {
  const points = hand.raw;
  if (!points?.length) return false;
  return dist(points[4], points[8]) < 0.055;
}

function isFist(hand) {
  const points = hand.raw;
  if (!points?.length) return false;
  const folded = [
    points[8].y - points[6].y > 0.006,
    points[12].y - points[10].y > 0.006,
    points[16].y - points[14].y > 0.006,
    points[20].y - points[18].y > 0.006
  ].every(Boolean);

  const compact = dist(points[8], points[20]) < dist(points[5], points[17]) + 0.1;
  return folded && compact;
}

function drawHands(results) {
  const width = refs.handOverlay.width;
  const height = refs.handOverlay.height;
  overlayCtx.clearRect(0, 0, width, height);
  overlayCtx.lineCap = "round";
  overlayCtx.lineJoin = "round";

  for (const landmarks of results?.landmarks ?? []) {
    const mirrored = landmarks.map((p) => ({
      x: (1 - p.x) * width,
      y: p.y * height
    }));
    const palm = palmCenter(landmarks);
    const color = 1 - palm.x < 0.5 ? "#f0c46d" : "#ffb43f";

    overlayCtx.strokeStyle = color;
    overlayCtx.fillStyle = color;
    overlayCtx.lineWidth = 3;
    overlayCtx.shadowColor = color;
    overlayCtx.shadowBlur = 10;

    for (const [a, b] of HAND_CONNECTIONS) {
      overlayCtx.beginPath();
      overlayCtx.moveTo(mirrored[a].x, mirrored[a].y);
      overlayCtx.lineTo(mirrored[b].x, mirrored[b].y);
      overlayCtx.stroke();
    }

    for (const point of mirrored) {
      overlayCtx.beginPath();
      overlayCtx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      overlayCtx.fill();
    }
  }
  overlayCtx.shadowBlur = 0;
}

function updateMeter() {
  audio.level = Math.max(0, audio.level - 0.018);
  refs.masterMeter.style.height = `${Math.round((0.08 + audio.level * 0.92) * 100)}%`;
  requestAnimationFrame(updateMeter);
}

function init() {
  renderStaticUi();
  seedPattern("warm");
  renderGlobalControls();
  bindEvents();
  updateMeter();
}

init();
