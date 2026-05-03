import { afterEach, describe, expect, it, vi } from 'vitest';

const originalAudioContext = globalThis.AudioContext;

class FakeAudioParam {
  setValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
  linearRampToValueAtTime(): void {}
}

class FakeOscillator {
  type: OscillatorType = 'sine';
  frequency = new FakeAudioParam();

  connect(): void {}
  start(): void {
    FakeAudioContext.startedOscillators++;
  }
  stop(): void {}
}

class FakeGain {
  gain = new FakeAudioParam();

  connect(): void {}
}

class FakeBuffer {
  getChannelData(): Float32Array {
    return new Float32Array(16);
  }
}

class FakeBufferSource {
  buffer: AudioBuffer | null = null;
  loop = false;

  connect(): void {}
  start(): void {}
  stop(): void {}
}

class FakeAudioContext {
  static constructed = 0;
  static resumed = 0;
  static startedOscillators = 0;

  state: AudioContextState = 'suspended';
  currentTime = 0;
  sampleRate = 44100;
  destination = {};

  constructor() {
    FakeAudioContext.constructed++;
  }

  static reset(): void {
    FakeAudioContext.constructed = 0;
    FakeAudioContext.resumed = 0;
    FakeAudioContext.startedOscillators = 0;
  }

  resume(): Promise<void> {
    FakeAudioContext.resumed++;
    this.state = 'running';
    return Promise.resolve();
  }

  createOscillator(): OscillatorNode {
    return new FakeOscillator() as unknown as OscillatorNode;
  }

  createGain(): GainNode {
    return new FakeGain() as unknown as GainNode;
  }

  createBuffer(): AudioBuffer {
    return new FakeBuffer() as unknown as AudioBuffer;
  }

  createBufferSource(): AudioBufferSourceNode {
    return new FakeBufferSource() as unknown as AudioBufferSourceNode;
  }
}

async function loadAudioModule() {
  vi.resetModules();
  FakeAudioContext.reset();
  globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
  return import('../../src/engine/audio');
}

afterEach(() => {
  globalThis.AudioContext = originalAudioContext;
  vi.restoreAllMocks();
});

describe('audio startup', () => {
  it('does not create AudioContext before explicit audio initialization', async () => {
    const audio = await loadAudioModule();

    audio.sfxTypewriter();
    audio.setRegionAmbient('menu');

    expect(FakeAudioContext.constructed).toBe(0);
  });

  it('starts ambient audio after explicit audio initialization', async () => {
    const audio = await loadAudioModule();

    await audio.initAudio();
    audio.startAmbient();

    expect(FakeAudioContext.constructed).toBe(1);
    expect(FakeAudioContext.startedOscillators).toBeGreaterThan(0);
  });
});
