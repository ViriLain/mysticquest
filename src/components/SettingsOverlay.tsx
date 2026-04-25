import { memo } from 'react';
import { MENU_COLOR, MENU_SELECTED_COLOR } from '../engine/constants';
import { colorModeLabel, fontSizeLabel, loadSettings, textSpeedLabel } from '../engine/settings';
import type { RGBA } from '../engine/types';

export interface SettingsOverlayProps {
  selected: number;
  colorCSS: (c: RGBA) => string;
}

/**
 * Settings menu overlay. Reads from `loadSettings()` directly each render so
 * it always reflects the latest persisted values (the engine writes settings
 * synchronously on each Left/Right tweak). Memoized — re-renders only when
 * `selected` changes (so arrow keys still work but cursor blinks don't
 * trigger a re-render here).
 */
function SettingsOverlayImpl({ selected, colorCSS }: SettingsOverlayProps) {
  const s = loadSettings();
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Font Size', value: fontSizeLabel(s.fontSize) },
    { label: 'Color Mode', value: colorModeLabel(s.colorMode) },
    { label: 'Text Speed', value: textSpeedLabel(s.textSpeed) },
    { label: 'Master Volume', value: `${s.masterVolume}%` },
    { label: 'Sound Effects', value: s.sfxEnabled ? 'ON' : 'OFF' },
    { label: 'Ambient Music', value: s.ambientEnabled ? 'ON' : 'OFF' },
    { label: 'Typewriter Clicks', value: s.typewriterSound ? 'ON' : 'OFF' },
    { label: 'Reduce Motion', value: s.reduceMotion ? 'ON' : 'OFF' },
  ];

  return (
    <div className="menu-overlay">
      <div className="menu-title">
        <span style={{ color: colorCSS(MENU_COLOR) }}>SETTINGS</span>
      </div>
      {rows.map((row, i) => {
        const isSelected = i === selected;
        const c: RGBA = isSelected ? MENU_SELECTED_COLOR : [0.5, 0.8, 0.5, 0.8];
        const prefix = isSelected ? '> ' : '  ';
        return (
          <div key={i} className="menu-option" style={{ color: colorCSS(c) }}>
            {prefix}{row.label.padEnd(20)}{`< ${row.value} >`}
          </div>
        );
      })}
      <div style={{ marginTop: '2em', color: colorCSS([0.5, 0.5, 0.5, 0.8]) }}>
        {'  '}Left/Right: Change{'  '}Esc: Back
      </div>
    </div>
  );
}

export default memo(SettingsOverlayImpl);
