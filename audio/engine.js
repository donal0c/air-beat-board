// AudioContext ownership, the master bus and the lookahead sequencer.
//
// The engine reads tempo, swing, length and row mutes from state on every
// scheduler tick, so changes apply on the next sixteenth without restarting.

import { state, cellTriggersStep, ROWS } from "../state.js";
import { triggerRow } from "./voices.js";

const SCHEDULER_INTERVAL_MS = 25;
const METER_FFT = 512;
const CHOKE_TAIL_S = 0.006;
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
    this.analyser = null;
    this.meterData = null;
    this.lastVoice = ROWS.map(() => null);
    this.timer = null;
    this.step = 0;
    this.nextStepTime = 0;
    this.level = 0;
    /** Steps already scheduled for audio, waiting for their visual moment. */
    this.visualQueue = [];
    /** Called with the step index when the playhead should move. */
    this.onStep = null;
    /** Called just before step 0 of each loop is scheduled. */
    this.onBar = null;
    /** Called with the row indexes that just fired, for strip flashes. */
    this.onHits = null;
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
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = METER_FFT;
    this.analyser.smoothingTimeConstant = 0;
    this.comp.connect(this.analyser);
    this.meterData = new Float32Array(this.analyser.fftSize);
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
    this.visualQueue.length = 0;
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
      if (step === 0) this.onBar?.();
      const swingOffset = step % 2 === 1 ? stepDur * (state.swing - 0.5) * 0.72 : 0;
      const fireAt = this.nextStepTime + swingOffset;
      const hits = this.scheduleStep(step, fireAt);
      this.queueVisualStep(step, fireAt, hits);

      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % state.length;
    }
  }

  queueVisualStep(step, t, hits) {
    this.visualQueue.push({ step, time: t, hits });
  }

  /**
   * Drain every queued step whose audio time has passed and move the
   * playhead to the latest one. Called once per animation frame, so the
   * visual stays locked to the audio clock instead of a timer.
   */
  pollVisuals() {
    if (!this.ac || !state.playing || this.visualQueue.length === 0) return;
    const now = this.ac.currentTime;
    let latest = null;
    const hits = new Set();
    while (this.visualQueue.length && this.visualQueue[0].time <= now) {
      latest = this.visualQueue.shift();
      for (const row of latest.hits) hits.add(row);
    }
    if (!latest) return;
    if (latest.step !== state.currentStep) {
      state.currentStep = latest.step;
      this.onStep?.(latest.step);
    }
    if (hits.size) this.onHits?.([...hits]);
  }

  /** Schedule every audible row for `step` at `t`. Returns the rows that fired. */
  scheduleStep(step, t) {
    const anySolo = state.rows.some((row) => row.solo);
    const hits = [];
    for (let row = 0; row < ROWS.length; row += 1) {
      const rowState = state.rows[row];
      if (rowState.muted || (anySolo && !rowState.solo)) continue;
      if (!cellTriggersStep(row, step)) continue;

      if (rowState.choke) this.chokeRow(row, t);
      this.lastVoice[row] = triggerRow(this, row, t);
      hits.push(row);
    }
    return hits;
  }

  /** Fade the row's previous voice out just before `t`. */
  chokeRow(row, t) {
    const node = this.lastVoice[row];
    if (!node) return;
    const param = node.gain;
    if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(t);
    else param.cancelScheduledValues(t);
    param.setTargetAtTime(0.0001, t, CHOKE_TAIL_S);
    this.lastVoice[row] = null;
  }

  /**
   * Master meter: RMS of the compressed output with a fast attack and a
   * slower fall. Called once per animation frame; returns 0..1.
   */
  tickMeter() {
    if (!this.analyser || !state.playing) {
      this.level = Math.max(0, this.level * 0.86 - 0.002);
      return this.level;
    }
    this.analyser.getFloatTimeDomainData(this.meterData);
    let sum = 0;
    for (let i = 0; i < this.meterData.length; i += 1) sum += this.meterData[i] * this.meterData[i];
    const rms = Math.sqrt(sum / this.meterData.length);
    const target = Math.min(1, rms * 3.2);
    this.level = target > this.level ? target : Math.max(target, this.level * 0.9);
    return this.level;
  }
}
