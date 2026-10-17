// AudioContext ownership, the master bus and the lookahead sequencer.
//
// The engine reads tempo, swing, length and row mutes from state on every
// scheduler tick, so changes apply on the next sixteenth without restarting.

import { state, cellTriggersStep, ROWS } from "../state.js";
import { triggerRow } from "./voices.js";

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_S = 0.15;
const START_LATENCY_S = 0.08;

export class AirBeatAudio {
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
    /** Called with the step index when the playhead should move. */
    this.onStep = null;
  }

  async ensure() {
    if (this.ac) {
      await this.ac.resume();
      return;
    }

    const ac = new (window.AudioContext || window.webkitAudioContext)();
    this.ac = ac;
    this.master = ac.createGain();
    this.master.gain.value = state.master;

    this.comp = ac.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 18;
    this.comp.ratio.value = 3.6;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.18;

    this.delay = ac.createDelay(1.2);
    this.delay.delayTime.value = 0.19;
    this.delayFeedback = ac.createGain();
    this.delayFeedback.gain.value = 0.28;
    this.delayReturn = ac.createGain();
    this.delayReturn.gain.value = 0.28;
    this.delay.connect(this.delayFeedback).connect(this.delay);
    this.delay.connect(this.delayReturn).connect(this.master);

    this.master.connect(this.comp).connect(ac.destination);
    this.noiseBuffer = this.createNoiseBuffer(2);

    await ac.resume();
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
    this.nextStepTime = this.ac.currentTime + START_LATENCY_S;
    this.timer = setInterval(() => this.scheduler(), SCHEDULER_INTERVAL_MS);
  }

  pause() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  reset() {
    this.step = 0;
    this.nextStepTime = this.ac ? this.ac.currentTime + START_LATENCY_S : 0;
  }

  scheduler() {
    if (!this.ac || !state.playing) return;

    const stepDur = 60 / state.bpm / 4;

    while (this.nextStepTime < this.ac.currentTime + LOOKAHEAD_S) {
      const step = this.step % state.length;
      const swingOffset = step % 2 === 1 ? stepDur * (state.swing - 0.5) * 0.72 : 0;
      const fireAt = this.nextStepTime + swingOffset;
      this.scheduleStep(step, fireAt);
      this.queueVisualStep(step, fireAt);

      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % state.length;
    }
  }

  // Visual playhead still rides on setTimeout; A_PLUS_PLAN 3.3 moves it to
  // a time-stamped queue drained from the rAF loop.
  queueVisualStep(step, t) {
    const delay = Math.max(0, (t - this.ac.currentTime) * 1000);
    setTimeout(() => {
      if (!state.playing) return;
      state.currentStep = step;
      this.onStep?.(step);
    }, delay);
  }

  scheduleStep(step, t) {
    for (let row = 0; row < ROWS.length; row += 1) {
      if (state.rows[row].muted) continue;
      if (cellTriggersStep(row, step)) {
        const loudness = triggerRow(this, row, t);
        this.level = Math.min(1, this.level + loudness);
      }
    }
  }

  /** Decay the meter level; called once per animation frame. */
  tickMeter() {
    this.level = Math.max(0, this.level - 0.018);
    return this.level;
  }
}
