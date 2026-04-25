import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings } from '../../src/engine/settings';

describe('settings storage hardening', () => {
  it('validates persisted settings before returning them', () => {
    localStorage.setItem('mysticquest_settings', JSON.stringify({
      fontSize: { invalid: true },
      colorMode: 'sepia',
      textSpeed: null,
      masterVolume: 999,
      sfxEnabled: 'yes',
      ambientEnabled: false,
      typewriterSound: 1,
      reduceMotion: true,
    }));

    expect(loadSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      masterVolume: 100,
      ambientEnabled: false,
      reduceMotion: true,
    });
  });
});
