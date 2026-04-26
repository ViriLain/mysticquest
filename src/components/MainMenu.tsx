import { memo } from 'react';
import { MENU_COLOR, MENU_DISABLED_COLOR, MENU_OPTIONS, MENU_SELECTED_COLOR, MENU_UNSELECTED_COLOR } from '../engine/constants';
import type { RGBA } from '../engine/types';

export interface MainMenuProps {
  selected: number;
  hasSave: boolean;
  colorCSS: (c: RGBA) => string;
}

/**
 * Title screen with NEW GAME / CONTINUE / DUNGEON / SETTINGS / QUIT options.
 * CONTINUE is greyed out when no slot has data. Memoized.
 */
function MainMenuImpl({ selected, hasSave, colorCSS }: MainMenuProps) {
  return (
    <div className="menu-overlay">
      <div className="menu-title">
        <span style={{ color: colorCSS(MENU_COLOR) }}>MYSTICQUEST</span>
        <span style={{ color: 'rgba(128, 204, 128, 0.6)' }}>{' '}v1.0</span>
      </div>
      {MENU_OPTIONS.map((option, i) => {
        const isContinue = option === 'CONTINUE';
        const isSelected = i === selected;
        let color: RGBA;
        if (isContinue && !hasSave) {
          color = MENU_DISABLED_COLOR;
        } else if (isSelected) {
          color = MENU_SELECTED_COLOR;
        } else {
          color = MENU_UNSELECTED_COLOR;
        }
        return (
          <div
            key={option}
            className="menu-option"
            style={{ color: colorCSS(color) }}
          >
            {isSelected ? '> ' : '  '}{option}
          </div>
        );
      })}
    </div>
  );
}

export default memo(MainMenuImpl);
