import { describe, expect, it, beforeEach } from 'vitest';
import { createInitialStore } from '../../src/engine/gameReducer';
import { handleSettingsKey, openSettings } from '../../src/engine/state/settings';
import { DEFAULT_SETTINGS, saveSettings } from '../../src/engine/settings';

beforeEach(() => {
  // Each test gets a clean settings record so volume tweaks don't leak.
  saveSettings({ ...DEFAULT_SETTINGS });
});

describe('settings state', () => {
  it('volume slider plays a louder preview cue (pickup) on change', () => {
    const s = createInitialStore();
    openSettings(s, 'menu');
    s.settingsSelected = 3; // Master Volume

    s.soundQueue = [];
    handleSettingsKey(s, 'ArrowRight');

    expect(s.soundQueue).toContain('pickup');
  });

  it('non-volume rows use the quieter menuMove cue', () => {
    const s = createInitialStore();
    openSettings(s, 'menu');
    s.settingsSelected = 0; // Font Size

    s.soundQueue = [];
    handleSettingsKey(s, 'ArrowRight');

    expect(s.soundQueue).toContain('menuMove');
    expect(s.soundQueue).not.toContain('pickup');
  });

  it('toggling SFX ON plays a preview, toggling OFF stays silent', () => {
    saveSettings({ ...DEFAULT_SETTINGS, sfxEnabled: false });

    const s = createInitialStore();
    openSettings(s, 'menu');
    s.settingsSelected = 4; // Sound Effects

    // First press: OFF → ON → preview cue
    s.soundQueue = [];
    handleSettingsKey(s, 'ArrowRight');
    expect(s.soundQueue).toContain('pickup');

    // Second press: ON → OFF → no preview (using menuMove instead, since
    // playing pickup at the moment SFX got disabled would be confusing).
    s.soundQueue = [];
    handleSettingsKey(s, 'ArrowRight');
    expect(s.soundQueue).not.toContain('pickup');
    expect(s.soundQueue).toContain('menuMove');
  });
});
