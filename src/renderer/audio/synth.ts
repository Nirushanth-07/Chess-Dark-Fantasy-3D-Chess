/**
 * A very small Web Audio synth.
 *
 * The game's sounds are generated rather than loaded. That keeps the repo free
 * of binary audio assets and unlicensed samples while the game is in
 * development, and every sound stays a tunable set of numbers. Phase 4 of the
 * plan swaps these for recorded samples via Howler; `audio/index.ts` is the
 * only file that would change.
 */

let context: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let reverb: ConvolverNode | null = null;

export function audioContext(): AudioContext {
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.7;
    master.connect(context.destination);

    reverb = context.createConvolver();
    reverb.buffer = impulseResponse(context, 2.4, 2.6);
    const reverbGain = context.createGain();
    reverbGain.gain.value = 0.32;
    reverb.connect(reverbGain);
    reverbGain.connect(master);

    sfxBus = context.createGain();
    sfxBus.gain.value = 1;
    sfxBus.connect(master);
    sfxBus.connect(reverb);

    musicBus = context.createGain();
    musicBus.gain.value = 0.34;
    musicBus.connect(master);
  }
  return context;
}

export function sfxOutput(): GainNode {
  audioContext();
  return sfxBus!;
}

export function musicOutput(): GainNode {
  audioContext();
  return musicBus!;
}

export function setMasterVolume(value: number): void {
  audioContext();
  master!.gain.value = Math.max(0, Math.min(1, value));
}

export function setMusicVolume(value: number): void {
  audioContext();
  musicBus!.gain.value = Math.max(0, Math.min(1, value)) * 0.5;
}

/** Browsers start the context suspended until a user gesture. */
export function resumeAudio(): void {
  const ctx = audioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

/** Ducks the music under a sting, then restores it. */
export function duckMusic(amount = 0.45, holdSeconds = 1.2): void {
  const ctx = audioContext();
  const bus = musicOutput();
  const now = ctx.currentTime;
  const original = bus.gain.value;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setValueAtTime(bus.gain.value, now);
  bus.gain.linearRampToValueAtTime(original * amount, now + 0.12);
  bus.gain.setValueAtTime(original * amount, now + holdSeconds);
  bus.gain.linearRampToValueAtTime(original, now + holdSeconds + 0.8);
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function impulseResponse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

export interface ToneOptions {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Frequency at the end of the note, for slides. */
  endFrequency?: number;
  attack?: number;
  delay?: number;
  detune?: number;
  destination?: AudioNode;
}

export function tone(options: ToneOptions): void {
  const ctx = audioContext();
  const {
    frequency,
    duration,
    type = 'sine',
    gain = 0.25,
    endFrequency,
    attack = 0.008,
    delay = 0,
    detune = 0,
    destination = sfxOutput(),
  } = options;

  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
  }
  osc.detune.value = detune;

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(envelope);
  envelope.connect(destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

export interface NoiseOptions {
  duration: number;
  gain?: number;
  /** Band-pass centre; the character of an impact lives here. */
  frequency?: number;
  q?: number;
  delay?: number;
  sweepTo?: number;
  destination?: AudioNode;
}

export function noise(options: NoiseOptions): void {
  const ctx = audioContext();
  const {
    duration,
    gain = 0.3,
    frequency = 1400,
    q = 1.2,
    delay = 0,
    sweepTo,
    destination = sfxOutput(),
  } = options;

  const start = ctx.currentTime + delay;
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(frequency, start);
  filter.Q.value = q;
  if (sweepTo !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), start + duration);
  }

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(destination);
  source.start(start);
  source.stop(start + duration + 0.05);
}

/** Equal-tempered note number → Hz. A4 (note 69) = 440. */
export function note(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
