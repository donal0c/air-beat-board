// Procedural voices and sample playback.
//
// Every voice takes the engine (for the AudioContext and buses), the row
// index, and the AudioContext time to fire at. Row parameters are read from
// state so the inspector sliders apply to the next hit immediately.

import { state, DEFAULT_SOUND, clamp, lerp, closeTo } from "../state.js";
import { KITS } from "./kits.js";

const CURVE_SAMPLES = 256;
const curveCache = new Map();

/** Waveshaper curve for a drive amount, cached per rounded amount. */
function distortionCurve(amount) {
  const key = Math.round(amount * 50);
  let curve = curveCache.get(key);
  if (curve) return curve;
  curve = new Float32Array(CURVE_SAMPLES);
  const k = 8 + (key / 50) * 52;
  for (let i = 0; i < CURVE_SAMPLES; i += 1) {
    const x = (i * 2) / CURVE_SAMPLES - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  curveCache.set(key, curve);
  return curve;
}

function effectiveTone(rowState) {
  return clamp(rowState.tone + (rowState.color - 0.5) * 0.34, 0, 1);
}

function usesNeutralSoundPath(rowState) {
  return closeTo(rowState.gain, DEFAULT_SOUND.gain)
    && closeTo(rowState.drive, DEFAULT_SOUND.drive)
    && closeTo(rowState.tone, DEFAULT_SOUND.tone)
    && closeTo(rowState.decay, DEFAULT_SOUND.decay)
    && closeTo(rowState.pan, DEFAULT_SOUND.pan)
    && closeTo(rowState.color, DEFAULT_SOUND.color);
}

/**
 * Build the per-hit output chain (drive, tone, pan, send) and return the
 * node a voice should connect into.
 */
function voiceOutput(engine, row, gainValue, sendValue) {
  const { ac, master, delay } = engine;
  const rowState = state.rows[row];
  const out = ac.createGain();
  out.gain.value = gainValue;

  const connectSend = () => {
    if (sendValue <= 0) return;
    const send = ac.createGain();
    send.gain.value = sendValue * 0.46;
    out.connect(send).connect(delay);
  };

  if (usesNeutralSoundPath(rowState)) {
    out.connect(master);
    connectSend();
    return out;
  }

  const tone = effectiveTone(rowState);
  const drive = clamp(rowState.drive, 0, 1);
  let tail = out;

  if (drive > 0.02) {
    const driveGain = ac.createGain();
    const shaper = ac.createWaveShaper();
    driveGain.gain.value = lerp(1, 3.8, drive);
    shaper.curve = distortionCurve(drive);
    shaper.oversample = "2x";
    tail = tail.connect(driveGain).connect(shaper);
  }

  if (!closeTo(rowState.tone, DEFAULT_SOUND.tone) || !closeTo(rowState.color, DEFAULT_SOUND.color)) {
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lerp(520, 11800, tone);
    filter.Q.value = lerp(0.35, 1.2, tone);
    tail = tail.connect(filter);
  }

  if (!closeTo(rowState.pan, DEFAULT_SOUND.pan)) {
    const panner = ac.createStereoPanner();
    panner.pan.value = rowState.pan;
    tail = tail.connect(panner);
  }

  tail.connect(master);
  connectSend();
  return out;
}

function envGain(ac, t, peak, attack, decay, end = 0.0001) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(end, t + attack + decay);
  return g;
}

function sample(engine, row, t, buffer, volume, pitch, send) {
  const { ac } = engine;
  const rowState = state.rows[row];
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = Math.pow(2, pitch / 12);

  const env = envGain(ac, t, 0.78 * volume, 0.004, Math.min(buffer.duration, 0.72) * rowState.decay);
  const out = voiceOutput(engine, row, 1, send);
  src.connect(env).connect(out);
  src.start(t);
  src.stop(t + Math.min(buffer.duration / src.playbackRate.value, 1.4 * rowState.decay));
}

function kick(engine, row, t, volume, pitch, send) {
  const { ac } = engine;
  const decay = state.rows[row].decay;
  const osc = ac.createOscillator();
  const body = ac.createOscillator();
  const gain = envGain(ac, t, 0.9 * volume, 0.004, 0.32 * decay);
  const out = voiceOutput(engine, row, 0.92, send);
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

function snare(engine, row, t, volume, pitch, send) {
  const { ac, noiseBuffer } = engine;
  const decay = state.rows[row].decay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;

  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1000 + pitch * 42;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1850 + pitch * 35;
  bp.Q.value = 0.9;

  const gain = envGain(ac, t, 0.35 * volume, 0.003, 0.16 * decay);
  const out = voiceOutput(engine, row, 1, send);

  src.connect(hp).connect(bp).connect(gain).connect(out);
  src.start(t);
  src.stop(t + 0.18 * decay);
}

function hat(engine, row, t, volume, pitch, send) {
  const { ac, noiseBuffer } = engine;
  const decay = state.rows[row].decay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6200 + pitch * 110;
  const gain = envGain(ac, t, 0.12 * volume, 0.001, 0.045 * decay);
  const out = voiceOutput(engine, row, 1, send);
  src.connect(hp).connect(gain).connect(out);
  src.start(t);
  src.stop(t + 0.08 * decay);
}

function perc(engine, row, t, volume, pitch, send) {
  const { ac } = engine;
  const decay = state.rows[row].decay;
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(210 * Math.pow(2, pitch / 18), t);
  osc.frequency.exponentialRampToValueAtTime(125 * Math.pow(2, pitch / 18), t + 0.08);
  const gain = envGain(ac, t, 0.22 * volume, 0.003, 0.105 * decay);
  const out = voiceOutput(engine, row, 0.85, send);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 0.13 * decay);
}

function bass(engine, row, t, volume, pitch, send) {
  const { ac } = engine;
  const decay = state.rows[row].decay;
  const osc = ac.createOscillator();
  const filter = ac.createBiquadFilter();
  const gain = envGain(ac, t, 0.24 * volume, 0.006, 0.19 * decay);
  const out = voiceOutput(engine, row, 0.78, send);
  const root = KITS[state.kit].bassRoot;
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

const PROCEDURAL = [kick, snare, hat, perc, bass];

/**
 * Fire row `row` at time `t`: the loaded sample for the active slot if there
 * is one, otherwise the row's procedural voice. Returns the loudness
 * contribution used by the master meter.
 */
export function triggerRow(engine, row, t) {
  const rowState = state.rows[row];
  const buffer = rowState.samples[rowState.slot];
  const volume = rowState.volume * (rowState.gain / 0.8);
  const { send, pitch } = rowState;

  if (buffer) {
    sample(engine, row, t, buffer, volume, pitch, send);
  } else {
    const voice = PROCEDURAL[row];
    if (voice) voice(engine, row, t, volume * KITS[state.kit].lift, pitch, send);
  }

  return 0.18 + volume * 0.2;
}
