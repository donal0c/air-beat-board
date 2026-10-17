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
const DEFAULT_SOUND = {
  gain: 0.8,
  drive: 0,
  tone: 0.62,
  decay: 1,
  pan: 0,
  send: 0.18,
  color: 0.48
};
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const closeTo = (a, b, epsilon = 0.0001) => Math.abs(a - b) <= epsilon;

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
  rowGain: $("#rowGain"),
  rowGainValue: $("#rowGainValue"),
  rowDrive: $("#rowDrive"),
  rowDriveValue: $("#rowDriveValue"),
  rowTone: $("#rowTone"),
  rowToneValue: $("#rowToneValue"),
  rowDecay: $("#rowDecay"),
  rowDecayValue: $("#rowDecayValue"),
  rowPan: $("#rowPan"),
  rowPanValue: $("#rowPanValue"),
  rowPitchDetail: $("#rowPitchDetail"),
  rowPitchValue: $("#rowPitchValue"),
  rowSendDetail: $("#rowSendDetail"),
  rowSendValue: $("#rowSendValue"),
  clearBtn: $("#clearBtn"),
  importBtn: $("#importBtn"),
  randomizeBtn: $("#randomizeBtn"),
  undoBtn: $("#undoBtn"),
  sampleInput: $("#sampleInput"),
  sampleStatus: $("#sampleStatus")
};

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
  inspectorTab: "cell",
  rows: ROWS.map(() => ({
    volume: 0.82,
    pitch: 0,
    send: DEFAULT_SOUND.send,
    gain: DEFAULT_SOUND.gain,
    drive: DEFAULT_SOUND.drive,
    tone: DEFAULT_SOUND.tone,
    decay: DEFAULT_SOUND.decay,
    pan: DEFAULT_SOUND.pan,
    color: DEFAULT_SOUND.color,
    muted: false,
    slot: "a",
    samples: { a: null, b: null },
    sampleNames: { a: "built-in", b: "empty" }
  })),
  history: [],
  drag: null,
  pendingDrag: null,
  suppressGridClick: false
};

const DRAG_THRESHOLD_PX = 6;

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
    const volume = rowState.volume * (rowState.gain / 0.8);
    const send = rowState.send;
    const pitch = rowState.pitch;

    if (buffer) {
      this.sample(row, t, buffer, volume, pitch, send);
    } else {
      const kitLift = state.kit === "club" ? 1.12 : state.kit === "lofi" ? 0.82 : 1;
      if (row === 0) this.kick(row, t, volume * kitLift, pitch, send);
      if (row === 1) this.snare(row, t, volume * kitLift, pitch, send);
      if (row === 2) this.hat(row, t, volume * kitLift, pitch, send);
      if (row === 3) this.perc(row, t, volume * kitLift, pitch, send);
      if (row === 4) this.bass(row, t, volume * kitLift, pitch, send);
    }

    this.level = Math.min(1, this.level + 0.18 + volume * 0.2);
  }

  effectiveTone(row) {
    const rowState = state.rows[row];
    return clamp(rowState.tone + (rowState.color - 0.5) * 0.34, 0, 1);
  }

  effectiveDrive(row) {
    const rowState = state.rows[row];
    return clamp(rowState.drive, 0, 1);
  }

  usesNeutralSoundPath(row) {
    const rowState = state.rows[row];
    return closeTo(rowState.gain, DEFAULT_SOUND.gain)
      && closeTo(rowState.drive, DEFAULT_SOUND.drive)
      && closeTo(rowState.tone, DEFAULT_SOUND.tone)
      && closeTo(rowState.decay, DEFAULT_SOUND.decay)
      && closeTo(rowState.pan, DEFAULT_SOUND.pan)
      && closeTo(rowState.color, DEFAULT_SOUND.color);
  }

  voiceOutput(row, gainValue, sendValue) {
    const rowState = state.rows[row];
    if (this.usesNeutralSoundPath(row)) {
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

    const tone = this.effectiveTone(row);
    const drive = this.effectiveDrive(row);
    const out = this.ac.createGain();
    out.gain.value = gainValue;
    let tail = out;

    if (drive > 0.02) {
      const driveGain = this.ac.createGain();
      const shaper = this.ac.createWaveShaper();
      driveGain.gain.value = lerp(1, 3.8, drive);
      shaper.curve = this.distortionCurve(drive);
      shaper.oversample = "2x";
      tail = tail.connect(driveGain).connect(shaper);
    }

    if (!closeTo(rowState.tone, DEFAULT_SOUND.tone) || !closeTo(rowState.color, DEFAULT_SOUND.color)) {
      const filter = this.ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lerp(520, 11800, tone);
      filter.Q.value = lerp(0.35, 1.2, tone);
      tail = tail.connect(filter);
    }

    if (!closeTo(rowState.pan, DEFAULT_SOUND.pan)) {
      const panner = this.ac.createStereoPanner();
      panner.pan.value = rowState.pan;
      tail = tail.connect(panner);
    }

    tail.connect(this.master);

    if (sendValue > 0) {
      const send = this.ac.createGain();
      send.gain.value = sendValue * 0.46;
      out.connect(send).connect(this.delay);
    }

    return out;
  }

  distortionCurve(amount) {
    const samples = 256;
    const curve = new Float32Array(samples);
    const k = 8 + amount * 52;
    for (let i = 0; i < samples; i += 1) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
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

    const rowState = state.rows[row];
    const env = this.envGain(t, 0.78 * volume, 0.004, Math.min(buffer.duration, 0.72) * rowState.decay);
    const out = this.voiceOutput(row, 1, send);
    src.connect(env).connect(out);
    src.start(t);
    src.stop(t + Math.min(buffer.duration / src.playbackRate.value, 1.4 * rowState.decay));
  }

  kick(row, t, volume, pitch, send) {
    const osc = this.ac.createOscillator();
    const body = this.ac.createOscillator();
    const decay = state.rows[row].decay;
    const gain = this.envGain(t, 0.9 * volume, 0.004, 0.32 * decay);
    const out = this.voiceOutput(row, 0.92, send);
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
    osc.stop(t + 0.38 * decay);
    body.stop(t + 0.22 * decay);
  }

  snare(row, t, volume, pitch, send) {
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuffer;
    const decay = state.rows[row].decay;

    const hp = this.ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1000 + pitch * 42;
    const bp = this.ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1850 + pitch * 35;
    bp.Q.value = 0.9;

    const gain = this.envGain(t, 0.35 * volume, 0.003, 0.16 * decay);
    const out = this.voiceOutput(row, 1, send);

    src.connect(hp).connect(bp).connect(gain).connect(out);
    src.start(t);
    src.stop(t + 0.18 * decay);
  }

  hat(row, t, volume, pitch, send) {
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuffer;
    const decay = state.rows[row].decay;
    const hp = this.ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6200 + pitch * 110;
    const gain = this.envGain(t, 0.12 * volume, 0.001, 0.045 * decay);
    const out = this.voiceOutput(row, 1, send);
    src.connect(hp).connect(gain).connect(out);
    src.start(t);
    src.stop(t + 0.08 * decay);
  }

  perc(row, t, volume, pitch, send) {
    const osc = this.ac.createOscillator();
    const decay = state.rows[row].decay;
    osc.type = "triangle";
    osc.frequency.setValueAtTime(210 * Math.pow(2, pitch / 18), t);
    osc.frequency.exponentialRampToValueAtTime(125 * Math.pow(2, pitch / 18), t + 0.08);
    const gain = this.envGain(t, 0.22 * volume, 0.003, 0.105 * decay);
    const out = this.voiceOutput(row, 0.85, send);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.13 * decay);
  }

  bass(row, t, volume, pitch, send) {
    const osc = this.ac.createOscillator();
    const filter = this.ac.createBiquadFilter();
    const decay = state.rows[row].decay;
    const gain = this.envGain(t, 0.24 * volume, 0.006, 0.19 * decay);
    const out = this.voiceOutput(row, 0.78, send);
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
    osc.stop(t + 0.24 * decay);
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

function setMessage(text, options = {}) {
  refs.message.textContent = text;
  if (options.undo) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "message-undo";
    button.textContent = "Undo";
    button.addEventListener("click", undoBoard);
    refs.message.append(" ", button);
  }
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

function boardIsEmpty() {
  return state.board.every((row) => row.every((cell) => cell.state === "empty"));
}

function seedPattern(key = state.kit, options = {}) {
  const replaced = !boardIsEmpty();
  pushHistory();
  state.board = KITS[key].pattern.map((row) => row.map((cellState) => ({ state: cellState })));
  renderBoard();
  renderSelection();
  if (options.silent) return;
  if (replaced) {
    setMessage(`${KITS[key].name} pattern replaced your board.`, { undo: true });
  } else {
    setMessage(`${KITS[key].name} pattern loaded.`);
  }
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
          <span>Color</span>
          <input class="row-color" data-row="${index}" type="range" min="0" max="100" value="${Math.round(state.rows[index].color * 100)}" />
        </label>
        <div class="toggle-row">
          <button class="toggle-button mute-button" data-mute-row="${index}">Mute</button>
          <span>Slot</span>
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
  const rowState = state.rows[row];
  const slot = rowState.slot;
  refs.selectedReadout.textContent = `${ROWS[row].label} · Col ${col + 1}`;
  refs.soundReadout.textContent = `${ROWS[row].label} · Slot ${slot.toUpperCase()} ${rowState.sampleNames[slot]}`;
  refs.sessionSelectedCell.textContent = `${ROWS[row].label} · Col ${col + 1} · ${describeState(cellState)}`;

  $$(".state-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.state === cellState);
  });

  $$(".session-state-guide [data-state-key]").forEach((item) => {
    item.classList.toggle("active", item.dataset.stateKey === cellState);
  });

  refs.rowGain.value = String(Math.round(rowState.gain * 100));
  refs.rowDrive.value = String(Math.round(rowState.drive * 100));
  refs.rowTone.value = String(Math.round(rowState.tone * 100));
  refs.rowDecay.value = String(Math.round(rowState.decay * 100));
  refs.rowPan.value = String(Math.round(rowState.pan * 100));
  refs.rowPitchDetail.value = String(rowState.pitch);
  refs.rowSendDetail.value = String(Math.round(rowState.send * 100));
  refs.rowGainValue.textContent = `${Math.round(rowState.gain * 100)}%`;
  refs.rowDriveValue.textContent = `${Math.round(rowState.drive * 100)}%`;
  refs.rowToneValue.textContent = `${Math.round(rowState.tone * 100)}%`;
  refs.rowDecayValue.textContent = `${Math.round(rowState.decay * 100)}%`;
  refs.rowPanValue.textContent = rowState.pan === 0 ? "C" : `${rowState.pan > 0 ? "R" : "L"}${Math.abs(Math.round(rowState.pan * 100))}`;
  refs.rowPitchValue.textContent = rowState.pitch === 0 ? "0" : `${rowState.pitch > 0 ? "+" : ""}${rowState.pitch}`;
  refs.rowSendValue.textContent = `${Math.round(rowState.send * 100)}%`;

  refs.cellPanel.classList.toggle("hidden", state.inspectorTab !== "cell");
  refs.soundPanel.classList.toggle("hidden", state.inspectorTab !== "sound");
  $$("[data-inspector-tab]").forEach((btn) => {
    const active = btn.dataset.inspectorTab === state.inspectorTab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  $$("[data-row]").forEach((strip) => {
    strip.classList.toggle("selected-row", Number(strip.dataset.row) === row);
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
  refs.sessionKitReadout.textContent = KITS[state.kit].name;
  refs.sessionBpmReadout.textContent = String(state.bpm);
  refs.sessionLengthReadout.textContent = String(state.length);
  refs.sessionSwingReadout.textContent = `${Math.round(state.swing * 100)}%`;
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

  // A press on a token only *arms* a drag. The drag starts once the pointer
  // travels past DRAG_THRESHOLD_PX; a plain click falls through to the grid
  // click handler and cycles the cell as normal.
  refs.beatGrid.addEventListener("pointerdown", (evt) => {
    if (evt.button !== 0 && evt.pointerType === "mouse") return;
    const token = evt.target.closest(".token");
    if (!token) return;
    const cell = evt.target.closest(".cell");
    if (!cell) return;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    state.pendingDrag = {
      pointerId: evt.pointerId,
      x: evt.clientX,
      y: evt.clientY,
      captureEl: refs.beatGrid,
      source: { type: "cell", row, col },
      tokenState: state.board[row][col].state
    };
  });

  refs.tokenTray.addEventListener("pointerdown", (evt) => {
    if (evt.button !== 0 && evt.pointerType === "mouse") return;
    const token = evt.target.closest(".ghost-token");
    if (!token) return;
    state.pendingDrag = {
      pointerId: evt.pointerId,
      x: evt.clientX,
      y: evt.clientY,
      captureEl: refs.tokenTray,
      source: { type: "tray" },
      tokenState: "first"
    };
  });

  document.addEventListener("pointermove", (evt) => {
    const pending = state.pendingDrag;
    if (pending && pending.pointerId === evt.pointerId) {
      const dx = evt.clientX - pending.x;
      const dy = evt.clientY - pending.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      state.pendingDrag = null;
      if (pending.source.type === "cell") {
        selectCell(pending.source.row, pending.source.col);
      }
      startDrag(pending);
    }
    if (!state.drag || state.drag.pointerId !== evt.pointerId) return;
    moveDrag(evt.clientX, evt.clientY);
  });

  const endPointer = (evt) => {
    if (state.pendingDrag && state.pendingDrag.pointerId === evt.pointerId) {
      state.pendingDrag = null;
      return;
    }
    if (!state.drag || state.drag.pointerId !== evt.pointerId) return;
    finishDrag(evt.clientX, evt.clientY, evt.type === "pointercancel");
  };

  document.addEventListener("pointerup", endPointer);
  document.addEventListener("pointercancel", endPointer);

  $$(".state-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const { row, col } = state.selected;
      setCell(row, col, btn.dataset.state);
      setMessage(`${ROWS[row].label} column ${col + 1}: ${describeState(btn.dataset.state)}`);
    });
  });

  $$("[data-inspector-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.inspectorTab = btn.dataset.inspectorTab;
      renderSelection();
    });
  });

  $$(".sound-control input").forEach((input) => {
    input.addEventListener("input", () => {
      setSelectedRowParam(input.dataset.soundParam, Number(input.value));
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

  const commitBpm = (value) => {
    const parsed = Number(value);
    state.bpm = clamp(Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : state.bpm, 70, 180);
    renderGlobalControls();
  };

  // Clamp on commit, not on every keystroke, so typing "95" lands on 95.
  refs.bpmInput.addEventListener("change", () => commitBpm(refs.bpmInput.value));
  refs.bpmInput.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") {
      refs.bpmInput.blur();
      return;
    }
    if (evt.key !== "ArrowUp" && evt.key !== "ArrowDown") return;
    evt.preventDefault();
    const step = evt.shiftKey ? 5 : 1;
    commitBpm(state.bpm + (evt.key === "ArrowUp" ? step : -step));
  });
  refs.bpmInput.addEventListener("wheel", (evt) => {
    if (document.activeElement !== refs.bpmInput) return;
    evt.preventDefault();
    const step = evt.shiftKey ? 5 : 1;
    commitBpm(state.bpm + (evt.deltaY < 0 ? step : -step));
  }, { passive: false });

  const syncSwing = (value) => {
    state.swing = clamp(Number(value) / 100, 0, 0.72);
    renderGlobalControls();
  };

  refs.swingInput.addEventListener("input", () => syncSwing(refs.swingInput.value));
  refs.boardSwing.addEventListener("input", () => syncSwing(refs.boardSwing.value));

  const syncLength = (value) => {
    state.length = Number(value);
    renderGlobalControls();
    renderBoard();
  };

  refs.lengthSelect.addEventListener("change", () => syncLength(refs.lengthSelect.value));
  refs.boardLength.addEventListener("input", () => syncLength(refs.boardLength.value));

  // Changing the kit only changes the sound. Loading its groove is an
  // explicit action (Seed pattern), so a kit switch never wipes the board.
  refs.kitSelect.addEventListener("change", () => {
    state.kit = refs.kitSelect.value;
    renderGlobalControls();
    setMessage(`${KITS[state.kit].name} kit. Board kept; use Seed pattern to load its groove.`);
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
    if (target.classList.contains("row-color")) {
      state.rows[Number(target.dataset.row)].color = Number(target.value) / 100;
    }
    renderSelection();
  });

  refs.channelStrips.addEventListener("click", (evt) => {
    const strip = evt.target.closest("[data-row]");
    if (strip && !evt.target.closest("button, input")) {
      const row = Number(strip.dataset.row);
      state.selected = { row, col: state.selected.col };
      state.inspectorTab = "sound";
      renderBoard();
      renderSelection();
      setMessage(`${ROWS[row].label} sound controls selected.`);
      return;
    }

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
      renderSelection();
      setMessage(`${ROWS[row].label} using sample slot ${slot.dataset.slot.toUpperCase()}.`);
    }
  });
}

function setSelectedRowParam(param, value) {
  const row = state.selected.row;
  const rowState = state.rows[row];
  if (param === "gain") rowState.gain = value / 100;
  if (param === "drive") rowState.drive = value / 100;
  if (param === "tone") rowState.tone = value / 100;
  if (param === "decay") rowState.decay = value / 100;
  if (param === "pan") rowState.pan = value / 100;
  if (param === "pitch") rowState.pitch = value;
  if (param === "send") rowState.send = value / 100;
  renderSelection();
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
  document.body.classList.add("dragging");
  try {
    data.captureEl?.setPointerCapture(data.pointerId);
  } catch {
    // Capture is a nicety; dragging still works via the document listeners.
  }
  moveDrag(data.x, data.y);
}

function moveDrag(x, y) {
  if (!state.drag) return;
  state.drag.moved = true;
  state.drag.proxy.style.left = `${x - 27}px`;
  state.drag.proxy.style.top = `${y - 27}px`;
}

function finishDrag(x, y, cancelled = false) {
  if (!state.drag) return;
  const drag = state.drag;
  drag.proxy.remove();
  document.body.classList.remove("dragging");
  try {
    drag.captureEl?.releasePointerCapture(drag.pointerId);
  } catch {
    // Already released.
  }
  state.drag = null;

  // The click that follows this pointerup belongs to the drag, not the cell.
  // Clear the flag on the next tick so a swallowed click can never stick.
  state.suppressGridClick = true;
  setTimeout(() => {
    state.suppressGridClick = false;
  }, 0);

  if (cancelled) {
    setMessage("Drag cancelled.");
    return;
  }

  const dropTarget = document.elementFromPoint(x, y)?.closest?.(".cell");
  if (!dropTarget) {
    setMessage("Token released outside the board.");
    return;
  }

  const row = Number(dropTarget.dataset.row);
  const col = Number(dropTarget.dataset.col);

  if (drag.source.type === "cell" && drag.source.row === row && drag.source.col === col) {
    // Dropped back where it came from: nothing changed, nothing to undo.
    return;
  }

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
  setMessage("Board cleared. Start with one token and let it loop.", { undo: true });
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

function updateMeter() {
  audio.level = Math.max(0, audio.level - 0.018);
  refs.masterMeter.style.height = `${Math.round((0.08 + audio.level * 0.92) * 100)}%`;
  requestAnimationFrame(updateMeter);
}

function init() {
  renderStaticUi();
  seedPattern("warm", { silent: true });
  setMessage("Click cells to compose. Press play when the board looks alive.");
  renderGlobalControls();
  bindEvents();
  updateMeter();
}

init();
