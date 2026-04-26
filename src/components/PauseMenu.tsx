import { memo } from 'react';
import { MENU_COLOR, MENU_HINT_COLOR, MENU_SELECTED_COLOR, MENU_UNSELECTED_COLOR } from '../engine/constants';
import { PAUSE_MENU_OPTIONS } from '../engine/state/pause-menu';
import type { RGBA } from '../engine/types';

export interface PauseMenuProps {
  selected: number;
  colorCSS: (c: RGBA) => string;
}

/**
 * Pause overlay shown when the player presses Esc in exploring state.
 * Resume / Save / Settings / Quit to Title. Memoized — re-renders only
 * when `selected` changes.
 */
function PauseMenuImpl({ selected, colorCSS }: PauseMenuProps) {
  return (
    <div className="menu-overlay">
      <div className="menu-title">
        <span style={{ color: colorCSS(MENU_COLOR) }}>PAUSED</span>
      </div>
      {PAUSE_MENU_OPTIONS.map((option, i) => {
        const isSelected = i === selected;
        const color: RGBA = isSelected ? MENU_SELECTED_COLOR : MENU_UNSELECTED_COLOR;
        return (
          <div key={option} className="menu-option" style={{ color: colorCSS(color) }}>
            {isSelected ? '> ' : '  '}{option}
          </div>
        );
      })}
      <div style={{ marginTop: '1.5em', color: colorCSS(MENU_HINT_COLOR) }}>
        {'  '}Up/Down: Navigate{'  '}Enter: Select{'  '}Esc: Resume
      </div>
    </div>
  );
}

export default memo(PauseMenuImpl);
