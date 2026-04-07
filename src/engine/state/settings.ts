import type { GameStateKind, GameStore } from '../types';
import { emitSound } from '../output';
import {
  COLOR_MODE_OPTIONS,
  FONT_SIZE_OPTIONS,
  loadSettings,
  saveSettings,
  TEXT_SPEED_OPTIONS,
} from '../settings';

const SETTINGS_ROWS = ['Font Size', 'Color Mode', 'Text Speed', 'Master Volume', 'Sound Effects', 'Ambient Music', 'Typewriter Clicks'] as const;

export function openSettings(s: GameStore, fromState: GameStateKind): void {
  s.settingsPrevState = fromState;
  s.settingsSelected = 0;
  s.state = 'settings';
}

export function handleSettingsKey(s: GameStore, key: string): void {
  const settings = loadSettings();

  if (key === 'ArrowUp') {
    s.settingsSelected = (s.settingsSelected - 1 + SETTINGS_ROWS.length) % SETTINGS_ROWS.length;
    emitSound(s, 'menuMove');
  } else if (key === 'ArrowDown') {
    s.settingsSelected = (s.settingsSelected + 1) % SETTINGS_ROWS.length;
    emitSound(s, 'menuMove');
  } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const dir = key === 'ArrowRight' ? 1 : -1;
    const row = s.settingsSelected;

    if (row === 0) {
      const idx = FONT_SIZE_OPTIONS.indexOf(settings.fontSize);
      settings.fontSize = FONT_SIZE_OPTIONS[(idx + dir + FONT_SIZE_OPTIONS.length) % FONT_SIZE_OPTIONS.length];
    } else if (row === 1) {
      const idx = COLOR_MODE_OPTIONS.indexOf(settings.colorMode);
      settings.colorMode = COLOR_MODE_OPTIONS[(idx + dir + COLOR_MODE_OPTIONS.length) % COLOR_MODE_OPTIONS.length];
    } else if (row === 2) {
      const idx = TEXT_SPEED_OPTIONS.indexOf(settings.textSpeed);
      settings.textSpeed = TEXT_SPEED_OPTIONS[(idx + dir + TEXT_SPEED_OPTIONS.length) % TEXT_SPEED_OPTIONS.length];
    } else if (row === 3) {
      settings.masterVolume = Math.max(0, Math.min(100, settings.masterVolume + dir * 10));
    } else if (row === 4) {
      settings.sfxEnabled = !settings.sfxEnabled;
    } else if (row === 5) {
      settings.ambientEnabled = !settings.ambientEnabled;
    } else if (row === 6) {
      settings.typewriterSound = !settings.typewriterSound;
    }

    saveSettings(settings);
    emitSound(s, 'menuMove');
  } else if (key === 'Escape' || key === 'Enter') {
    s.state = s.settingsPrevState;
    emitSound(s, 'menuSelect');
  }
}
