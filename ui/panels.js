// Everything around the board: transport, master, Session panel, Inspector
// and the channel strips. Static DOM is built once; render() patches values.

import { state, ROWS, describeState, subscribe } from "../state.js";
import { KITS } from "../audio/kits.js";
import * as actions from "../actions.js";

const SOUND_PARAMS = ["gain", "drive", "tone", "decay", "pan", "pitch", "send"];

/** Set an input's value unless the user is currently editing it. */
function setInputValue(input, value) {
  if (document.activeElement === input) return;
  const next = String(value);
  if (input.value !== next) input.value = next;
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

export function initPanels(refs) {
  // ---------------------------------------------------------- build once

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
          <button type="button" class="toggle-button mute-button" data-mute-row="${index}">Mute</button>
          <span>Slot</span>
          <button type="button" class="toggle-button slot-button active" data-slot-row="${index}" data-slot="a">A</button>
          <button type="button" class="toggle-button slot-button" data-slot-row="${index}" data-slot="b">B</button>
        </div>
      </div>
    </div>
  `).join("");

  const strips = ROWS.map((_, index) => {
    const root = refs.channelStrips.querySelector(`.channel-strip[data-row="${index}"]`);
    return {
      root,
      volume: root.querySelector(".row-volume"),
      color: root.querySelector(".row-color"),
      mute: root.querySelector("[data-mute-row]"),
      slotA: root.querySelector('[data-slot="a"]'),
      slotB: root.querySelector('[data-slot="b"]')
    };
  });

  const stateButtons = [...document.querySelectorAll(".state-btn")];
  const stateGuide = [...document.querySelectorAll(".session-state-guide [data-state-key]")];
  const inspectorTabs = [...document.querySelectorAll("[data-inspector-tab]")];
  const soundInputs = Object.fromEntries(
    SOUND_PARAMS.map((param) => [param, document.querySelector(`[data-sound-param="${param}"]`)])
  );
  const soundOutputs = {
    gain: refs.rowGainValue,
    drive: refs.rowDriveValue,
    tone: refs.rowToneValue,
    decay: refs.rowDecayValue,
    pan: refs.rowPanValue,
    pitch: refs.rowPitchValue,
    send: refs.rowSendValue
  };
  const bigPlayIcon = refs.bigPlayBtn.querySelector("span");

  let renderedMessage = null;

  // ---------------------------------------------------------- rendering

  function renderGlobals() {
    const playing = state.playing;
    refs.playBtn.classList.toggle("playing", playing);
    setText(refs.playIcon, playing ? "❚❚" : "▶");
    setText(bigPlayIcon, playing ? "❚❚" : "▶");
    setText(refs.runtimeStatus, playing ? "Playing" : "Ready");
    refs.runtimeStatus.classList.toggle("hot", playing);

    const swingPercent = Math.round(state.swing * 100);
    setInputValue(refs.bpmInput, state.bpm);
    setInputValue(refs.swingInput, swingPercent);
    setInputValue(refs.boardSwing, swingPercent);
    setText(refs.swingReadout, `${swingPercent}%`);
    setInputValue(refs.lengthSelect, state.length);
    setInputValue(refs.boardLength, state.length);
    setInputValue(refs.kitSelect, state.kit);
    setInputValue(refs.masterInput, Math.round(state.master * 100));

    setText(refs.sessionKitReadout, KITS[state.kit].name);
    setText(refs.sessionBpmReadout, String(state.bpm));
    setText(refs.sessionLengthReadout, String(state.length));
    setText(refs.sessionSwingReadout, `${swingPercent}%`);
    setText(refs.sampleStatus, state.sampleStatus);
  }

  function renderSelection() {
    const { row, col } = state.selected;
    const cellState = state.board[row][col].state;
    const rowState = state.rows[row];
    const slot = rowState.slot;
    const label = ROWS[row].label;

    setText(refs.selectedReadout, `${label} · Col ${col + 1}`);
    setText(refs.soundReadout, `${label} · Slot ${slot.toUpperCase()} ${rowState.sampleNames[slot]}`);
    setText(refs.sessionSelectedCell, `${label} · Col ${col + 1} · ${describeState(cellState)}`);

    stateButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.state === cellState));
    stateGuide.forEach((item) => item.classList.toggle("active", item.dataset.stateKey === cellState));

    const percent = (value) => Math.round(value * 100);
    setInputValue(soundInputs.gain, percent(rowState.gain));
    setInputValue(soundInputs.drive, percent(rowState.drive));
    setInputValue(soundInputs.tone, percent(rowState.tone));
    setInputValue(soundInputs.decay, percent(rowState.decay));
    setInputValue(soundInputs.pan, percent(rowState.pan));
    setInputValue(soundInputs.pitch, rowState.pitch);
    setInputValue(soundInputs.send, percent(rowState.send));
    setText(soundOutputs.gain, `${percent(rowState.gain)}%`);
    setText(soundOutputs.drive, `${percent(rowState.drive)}%`);
    setText(soundOutputs.tone, `${percent(rowState.tone)}%`);
    setText(soundOutputs.decay, `${percent(rowState.decay)}%`);
    setText(soundOutputs.pan, rowState.pan === 0 ? "C" : `${rowState.pan > 0 ? "R" : "L"}${Math.abs(percent(rowState.pan))}`);
    setText(soundOutputs.pitch, rowState.pitch === 0 ? "0" : `${rowState.pitch > 0 ? "+" : ""}${rowState.pitch}`);
    setText(soundOutputs.send, `${percent(rowState.send)}%`);

    refs.cellPanel.classList.toggle("hidden", state.inspectorTab !== "cell");
    refs.soundPanel.classList.toggle("hidden", state.inspectorTab !== "sound");
    inspectorTabs.forEach((btn) => {
      const active = btn.dataset.inspectorTab === state.inspectorTab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", String(active));
    });
  }

  function renderStrips() {
    strips.forEach((strip, index) => {
      const rowState = state.rows[index];
      strip.root.classList.toggle("selected-row", index === state.selected.row);
      setInputValue(strip.volume, Math.round(rowState.volume * 100));
      setInputValue(strip.color, Math.round(rowState.color * 100));
      strip.mute.classList.toggle("muted", rowState.muted);
      setText(strip.mute, rowState.muted ? "Muted" : "Mute");
      strip.slotA.classList.toggle("active", rowState.slot === "a");
      strip.slotB.classList.toggle("active", rowState.slot === "b");
    });
  }

  function renderMessage() {
    if (renderedMessage === state.message) return;
    renderedMessage = state.message;
    refs.message.textContent = state.message.text;
    if (state.message.undo) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "message-undo";
      button.textContent = "Undo";
      button.addEventListener("click", actions.undoBoard);
      refs.message.append(" ", button);
    }
  }

  function render() {
    renderGlobals();
    renderSelection();
    renderStrips();
    renderMessage();
  }

  // -------------------------------------------------------------- events

  stateButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const { row, col } = state.selected;
      actions.setCell(row, col, btn.dataset.state);
    });
  });

  inspectorTabs.forEach((btn) => {
    btn.addEventListener("click", () => actions.setInspectorTab(btn.dataset.inspectorTab));
  });

  SOUND_PARAMS.forEach((param) => {
    soundInputs[param].addEventListener("input", () => {
      actions.setSelectedRowParam(param, Number(soundInputs[param].value));
    });
  });

  refs.playBtn.addEventListener("click", actions.togglePlayback);
  refs.bigPlayBtn.addEventListener("click", actions.togglePlayback);
  refs.stopBtn.addEventListener("click", actions.stopAndReset);
  refs.clearBtn.addEventListener("click", actions.clearBoard);
  refs.randomizeBtn.addEventListener("click", () => actions.seedPattern(state.kit));
  refs.undoBtn.addEventListener("click", actions.undoBoard);
  refs.importBtn.addEventListener("click", () => refs.sampleInput.click());
  refs.sampleInput.addEventListener("change", async () => {
    await actions.importSample(refs.sampleInput.files?.[0]);
    refs.sampleInput.value = "";
  });

  // BPM clamps on commit, not on every keystroke, so typing "95" lands on 95.
  refs.bpmInput.addEventListener("change", () => actions.setBpm(refs.bpmInput.value));
  refs.bpmInput.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") {
      refs.bpmInput.blur();
      return;
    }
    if (evt.key !== "ArrowUp" && evt.key !== "ArrowDown") return;
    evt.preventDefault();
    const step = evt.shiftKey ? 5 : 1;
    actions.nudgeBpm(evt.key === "ArrowUp" ? step : -step);
  });
  refs.bpmInput.addEventListener("wheel", (evt) => {
    if (document.activeElement !== refs.bpmInput) return;
    evt.preventDefault();
    const step = evt.shiftKey ? 5 : 1;
    actions.nudgeBpm(evt.deltaY < 0 ? step : -step);
  }, { passive: false });

  refs.swingInput.addEventListener("input", () => actions.setSwing(refs.swingInput.value));
  refs.boardSwing.addEventListener("input", () => actions.setSwing(refs.boardSwing.value));
  refs.lengthSelect.addEventListener("change", () => actions.setLength(refs.lengthSelect.value));
  refs.boardLength.addEventListener("input", () => actions.setLength(refs.boardLength.value));
  refs.kitSelect.addEventListener("change", () => actions.setKit(refs.kitSelect.value));
  refs.masterInput.addEventListener("input", () => actions.setMaster(refs.masterInput.value));

  refs.channelStrips.addEventListener("input", (evt) => {
    const target = evt.target;
    const row = Number(target.dataset.row);
    if (target.classList.contains("row-volume")) actions.setRowVolume(row, target.value);
    if (target.classList.contains("row-color")) actions.setRowColor(row, target.value);
  });

  refs.channelStrips.addEventListener("click", (evt) => {
    const mute = evt.target.closest("[data-mute-row]");
    if (mute) {
      actions.toggleMute(Number(mute.dataset.muteRow));
      return;
    }
    const slot = evt.target.closest("[data-slot-row]");
    if (slot) {
      actions.setSlot(Number(slot.dataset.slotRow), slot.dataset.slot);
      return;
    }
    const strip = evt.target.closest(".channel-strip");
    if (strip && !evt.target.closest("button, input")) {
      actions.selectRow(Number(strip.dataset.row));
    }
  });

  subscribe(render);
  render();
}
