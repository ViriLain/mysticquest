import type { EffectsState, ActiveEffect } from './types';

export function createEffects(): EffectsState {
  return {
    shake: { x: 0, y: 0 },
    flash: { r: 0, g: 0, b: 0, a: 0 },
    tint: { r: 0, g: 0, b: 0, a: 0 },
    glitch: 0,
    jitter: 0,
    rainbowTime: 0,
    active: [],
  };
}

export function pushEffect(effects: EffectsState, type: ActiveEffect['type'], duration: number, params: Record<string, number> = {}): void {
  effects.active.push({ type, duration, elapsed: 0, params });
}

export function updateEffects(effects: EffectsState, dt: number): void {
  effects.shake.x = 0;
  effects.shake.y = 0;
  effects.flash.a = 0;
  effects.glitch = 0;
  effects.jitter = 0;
  effects.rainbowTime += dt;

  let i = 0;
  while (i < effects.active.length) {
    const e = effects.active[i];
    e.elapsed += dt;
    if (e.elapsed >= e.duration) {
      effects.active.splice(i, 1);
      continue;
    }

    const progress = e.elapsed / e.duration;
    if (e.type === 'shake') {
      const intensity = (e.params.intensity ?? 5) * (1 - progress);
      effects.shake.x = (Math.random() - 0.5) * intensity * 2;
      effects.shake.y = (Math.random() - 0.5) * intensity * 2;
    } else if (e.type === 'flash') {
      const fade = 1 - progress;
      effects.flash.r = (e.params.r ?? 1) * fade;
      effects.flash.g = (e.params.g ?? 0) * fade;
      effects.flash.b = (e.params.b ?? 0) * fade;
      effects.flash.a = fade * 0.3;
    } else if (e.type === 'glitch') {
      effects.glitch = (e.params.intensity ?? 0.5) * (1 - progress);
    } else if (e.type === 'jitter') {
      effects.jitter = e.params.intensity ?? 0.3;
    }
    i++;
  }
}

export function setRegionTint(effects: EffectsState, r: number, g: number, b: number, a = 0.1): void {
  effects.tint = { r, g, b, a };
}

export function clearRegionTint(effects: EffectsState): void {
  effects.tint = { r: 0, g: 0, b: 0, a: 0 };
}

export function updateRainbowTint(effects: EffectsState): void {
  const t = effects.rainbowTime * 0.5;
  const r = Math.sin(t) * 0.5 + 0.5;
  const g = Math.sin(t + 2.094) * 0.5 + 0.5;
  const b = Math.sin(t + 4.189) * 0.5 + 0.5;
  effects.tint = { r: r * 0.15, g: g * 0.15, b: b * 0.15, a: 0.05 };
}
