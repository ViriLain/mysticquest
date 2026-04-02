// Persistent game settings stored in localStorage

const STORAGE_KEY = 'mysticquest_settings';

export type FontSize = 'small' | 'normal' | 'large';
export type ColorMode = 'normal' | 'high_contrast' | 'colorblind';
export type TextSpeed = 'instant' | 'fast' | 'normal' | 'slow';

export interface GameSettings {
  fontSize: FontSize;
  colorMode: ColorMode;
  textSpeed: TextSpeed;
  masterVolume: number;   // 0-100
  sfxEnabled: boolean;
  ambientEnabled: boolean;
  typewriterSound: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  fontSize: 'normal',
  colorMode: 'normal',
  textSpeed: 'normal',
  masterVolume: 80,
  sfxEnabled: true,
  ambientEnabled: true,
  typewriterSound: true,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: GameSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// Font size in pixels
export function fontSizePx(size: FontSize): number {
  switch (size) {
    case 'small': return 13;
    case 'normal': return 16;
    case 'large': return 20;
  }
}

// Typewriter speed in seconds per character
export function typewriterDelay(speed: TextSpeed): number {
  switch (speed) {
    case 'instant': return 0;
    case 'fast': return 0.008;
    case 'normal': return 0.02;
    case 'slow': return 0.04;
  }
}

// Colorblind-safe palette remappings (deuteranopia-friendly)
// Replaces red/green distinctions with blue/orange
import type { RGBA } from './types';

export interface ColorRemap {
  normal: RGBA;
  remapped: RGBA;
}

// The colorblind mode replaces problematic colors
export function remapColor(color: RGBA, mode: ColorMode): RGBA {
  if (mode === 'normal') return color;

  if (mode === 'high_contrast') {
    // Boost all colors toward pure white/black extremes
    return [
      color[0] > 0.5 ? 1 : 0,
      color[1] > 0.5 ? 1 : 0,
      color[2] > 0.5 ? 1 : 0,
      color[3],
    ];
  }

  if (mode === 'colorblind') {
    // Deuteranopia: red-green confusion
    // Replace greens with cyan, reds with orange/yellow
    const [r, g, b, a] = color;

    // Pure green text (base terminal color, item color) → cyan
    if (g > 0.7 && r < 0.5 && b < 0.5) {
      return [0.2, g * 0.8, 1.0, a]; // shift to cyan
    }
    // Red text (error, enemy) → bright orange
    if (r > 0.7 && g < 0.5 && b < 0.5) {
      return [1.0, 0.6, 0.1, a]; // orange
    }
    // Yellow-green → pure yellow
    if (r > 0.3 && g > 0.7 && b < 0.5) {
      return [1.0, 0.9, 0.2, a];
    }
    return color;
  }

  return color;
}

// Setting option labels for the settings menu
export const FONT_SIZE_OPTIONS: FontSize[] = ['small', 'normal', 'large'];
export const COLOR_MODE_OPTIONS: ColorMode[] = ['normal', 'high_contrast', 'colorblind'];
export const TEXT_SPEED_OPTIONS: TextSpeed[] = ['instant', 'fast', 'normal', 'slow'];

export function fontSizeLabel(s: FontSize): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function colorModeLabel(m: ColorMode): string {
  switch (m) {
    case 'normal': return 'Normal';
    case 'high_contrast': return 'High Contrast';
    case 'colorblind': return 'Colorblind';
  }
}

export function textSpeedLabel(s: TextSpeed): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
