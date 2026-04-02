// Retro 8-bit style sound effects using Web Audio API

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

// Ensure audio context is resumed (browsers require user gesture)
export function initAudio(): void {
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = 'square',
  volume = 0.08,
  freqEnd?: number,
): void {
  try {
    const c = getCtx();
    if (c.state === 'suspended') return;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (freqEnd !== undefined) {
      osc.frequency.linearRampToValueAtTime(freqEnd, c.currentTime + duration);
    }
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
  } catch {
    // Silently fail if audio is unavailable
  }
}

function playNoise(duration: number, volume = 0.04): void {
  try {
    const c = getCtx();
    if (c.state === 'suspended') return;

    const bufferSize = Math.floor(c.sampleRate * duration);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = c.createBufferSource();
    source.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    source.connect(gain);
    gain.connect(c.destination);
    source.start(c.currentTime);
  } catch {
    // Silently fail
  }
}

// ---- Game sounds ----

export function sfxTypewriter(): void {
  playTone(800 + Math.random() * 400, 0.03, 'square', 0.02);
}

export function sfxSubmit(): void {
  playTone(440, 0.05, 'square', 0.05);
  setTimeout(() => playTone(660, 0.05, 'square', 0.05), 50);
}

export function sfxPickup(): void {
  playTone(523, 0.08, 'square', 0.06);
  setTimeout(() => playTone(784, 0.1, 'square', 0.06), 80);
}

export function sfxEquip(): void {
  playTone(330, 0.06, 'triangle', 0.06);
  setTimeout(() => playTone(440, 0.06, 'triangle', 0.06), 60);
  setTimeout(() => playTone(660, 0.08, 'triangle', 0.06), 120);
}

export function sfxError(): void {
  playTone(200, 0.15, 'square', 0.05);
  setTimeout(() => playTone(150, 0.15, 'square', 0.05), 100);
}

export function sfxPlayerHit(): void {
  playNoise(0.15, 0.06);
  playTone(150, 0.2, 'sawtooth', 0.04);
}

export function sfxEnemyHit(): void {
  playTone(300, 0.08, 'square', 0.05);
  setTimeout(() => playTone(400, 0.06, 'square', 0.04), 50);
}

export function sfxCritical(): void {
  playTone(600, 0.1, 'sawtooth', 0.06);
  setTimeout(() => playTone(900, 0.15, 'sawtooth', 0.06), 80);
}

export function sfxDeath(): void {
  playTone(400, 0.3, 'sawtooth', 0.06, 80);
  setTimeout(() => playNoise(0.4, 0.05), 200);
}

export function sfxVictory(): void {
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.12, 'square', 0.05), i * 100);
  });
}

export function sfxLevelUp(): void {
  const notes = [440, 554, 659, 880];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.15, 'triangle', 0.06), i * 120);
  });
}

export function sfxSave(): void {
  playTone(880, 0.08, 'sine', 0.04);
  setTimeout(() => playTone(1100, 0.12, 'sine', 0.04), 80);
}

export function sfxMenuMove(): void {
  playTone(600, 0.04, 'square', 0.03);
}

export function sfxMenuSelect(): void {
  playTone(800, 0.06, 'square', 0.05);
  setTimeout(() => playTone(1000, 0.08, 'square', 0.05), 60);
}

export function sfxBossAppear(): void {
  playTone(100, 0.4, 'sawtooth', 0.06, 50);
  setTimeout(() => playNoise(0.3, 0.04), 200);
  setTimeout(() => playTone(80, 0.5, 'sawtooth', 0.05), 400);
}

export function sfxFleeSuccess(): void {
  playTone(400, 0.08, 'square', 0.04, 800);
}

export function sfxFleeFail(): void {
  playTone(300, 0.1, 'square', 0.04, 150);
}

export function sfxAchievement(): void {
  const notes = [659, 880, 1047, 1319];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.2, 'triangle', 0.07), i * 80);
  });
}

// ---- Region ambient music ----
let currentAmbientRegion: string | null = null;
let ambientNodes: OscillatorNode[] = [];
let ambientGains: GainNode[] = [];
let ambientNoiseSource: AudioBufferSourceNode | null = null;
let ambientNoiseGain: GainNode | null = null;

interface RegionSound {
  freqs: number[];
  types: OscillatorType[];
  volume: number;
  useNoise?: boolean;
  noiseVolume?: number;
}

const REGION_SOUNDS: Record<string, RegionSound> = {
  manor:    { freqs: [82.4, 123.5], types: ['sine', 'sine'], volume: 0.012 },
  wilds:    { freqs: [220], types: ['triangle'], volume: 0.01 },
  darkness: { freqs: [65.4, 98], types: ['sawtooth', 'sine'], volume: 0.01 },
  wastes:   { freqs: [73.4], types: ['sine'], volume: 0.006, useNoise: true, noiseVolume: 0.015 },
  hidden:   { freqs: [261.6, 329.6, 392], types: ['sine', 'sine', 'sine'], volume: 0.008 },
  dungeon:  { freqs: [73.4], types: ['square'], volume: 0.01 },
  menu:     { freqs: [55], types: ['sine'], volume: 0.015 },
};

function stopCurrentAmbient(): void {
  for (const gain of ambientGains) {
    try {
      gain.gain.exponentialRampToValueAtTime(0.001, getCtx().currentTime + 0.8);
    } catch { /* ignore */ }
  }
  // Schedule cleanup
  const oldNodes = ambientNodes;
  const oldNoiseSource = ambientNoiseSource;
  ambientNodes = [];
  ambientGains = [];
  ambientNoiseSource = null;
  ambientNoiseGain = null;
  setTimeout(() => {
    for (const osc of oldNodes) {
      try { osc.stop(); } catch { /* ignore */ }
    }
    if (oldNoiseSource) {
      try { oldNoiseSource.stop(); } catch { /* ignore */ }
    }
  }, 1000);
}

export function setRegionAmbient(region: string | null): void {
  if (region === currentAmbientRegion) return;
  currentAmbientRegion = region;

  stopCurrentAmbient();

  if (!region) return;
  const config = REGION_SOUNDS[region] || REGION_SOUNDS['menu'];

  try {
    const c = getCtx();
    if (c.state === 'suspended') return;

    const newNodes: OscillatorNode[] = [];
    const newGains: GainNode[] = [];

    for (let i = 0; i < config.freqs.length; i++) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = config.types[i] || 'sine';
      osc.frequency.setValueAtTime(config.freqs[i], c.currentTime);
      gain.gain.setValueAtTime(0.001, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(config.volume, c.currentTime + 1.0);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start();
      newNodes.push(osc);
      newGains.push(gain);
    }

    // Hidden region: slowly cycle the frequencies for a dreamy effect
    if (region === 'hidden' && newNodes.length >= 3) {
      const cycle = () => {
        if (currentAmbientRegion !== 'hidden') return;
        const t = c.currentTime;
        newNodes[0]?.frequency.linearRampToValueAtTime(261.6 + Math.sin(t * 0.3) * 20, t + 2);
        newNodes[1]?.frequency.linearRampToValueAtTime(329.6 + Math.sin(t * 0.4) * 15, t + 2);
        newNodes[2]?.frequency.linearRampToValueAtTime(392 + Math.sin(t * 0.5) * 10, t + 2);
        setTimeout(cycle, 2000);
      };
      setTimeout(cycle, 2000);
    }

    // Noise for wastes
    if (config.useNoise) {
      const bufferSize = Math.floor(c.sampleRate * 2);
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.3;
      }
      const source = c.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const nGain = c.createGain();
      nGain.gain.setValueAtTime(0.001, c.currentTime);
      nGain.gain.exponentialRampToValueAtTime(config.noiseVolume || 0.01, c.currentTime + 1.0);
      source.connect(nGain);
      nGain.connect(c.destination);
      source.start();
      ambientNoiseSource = source;
      ambientNoiseGain = nGain;
    }

    ambientNodes = newNodes;
    ambientGains = newGains;
  } catch {
    // Silently fail
  }
}

export function startAmbient(): void {
  setRegionAmbient('menu');
}

export function stopAmbient(): void {
  stopCurrentAmbient();
  currentAmbientRegion = null;
}
