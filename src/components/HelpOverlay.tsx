import { memo } from 'react';
import { MENU_COLOR, MENU_HINT_COLOR, MENU_UNSELECTED_COLOR } from '../engine/constants';
import type { RGBA } from '../engine/types';

export interface HelpOverlayProps {
  colorCSS: (c: RGBA) => string;
}

const ROWS: ReadonlyArray<{ heading?: string; key?: string; desc?: string }> = [
  { heading: 'Movement & looking' },
  { key: 'go <dir>',       desc: 'Move (north/south/east/west/up/down or n/s/e/w/u/d)' },
  { key: 'look (l)',       desc: 'Re-display the current room' },
  { key: 'search',         desc: 'Search for hidden items + secret exits' },
  { key: 'warp <place>',   desc: 'Teleport to a visited location (HP cost)' },
  { heading: 'Items & combat' },
  { key: 'take <item>',    desc: 'Pick up an item or weapon' },
  { key: 'use <item>',     desc: 'Use a consumable, or equip gear' },
  { key: 'examine <thing>',desc: 'Inspect an item, weapon, or enemy' },
  { key: 'attack <enemy>', desc: 'Attack a foe in the room' },
  { key: 'skill <name>',   desc: 'Use a combat skill (cooldown-based)' },
  { heading: 'Info' },
  { key: 'inventory (i)',  desc: 'List equipped + carried items' },
  { key: 'stats / score',  desc: 'Per-character / lifetime stats' },
  { key: 'journal',        desc: 'Active and completed objectives' },
  { key: 'map',            desc: 'Open the area map' },
  { key: 'achievements',   desc: 'View achievements' },
  { key: 'save / load',    desc: 'Save or load (slot picker)' },
  { heading: 'Shortcuts' },
  { key: 'Tab',            desc: 'Autocomplete partial commands' },
  { key: 'arrow up/down',  desc: 'Browse command history' },
  { key: 'F1',             desc: 'Open this help overlay' },
  { key: 'Esc',            desc: 'Close any overlay (settings/map/help)' },
  { key: 'again (g)',      desc: 'Repeat your last command' },
];

/**
 * Global help overlay, opened from any state via F1. Lists the most useful
 * commands and keyboard shortcuts. Any key (intentionally including F1
 * itself) dismisses it. The actual dispatch is handled in
 * gameReducer.ts::handleKeyPressed; this component just renders the panel.
 */
function HelpOverlayImpl({ colorCSS }: HelpOverlayProps) {
  return (
    <div className="menu-overlay">
      <div className="menu-title">
        <span style={{ color: colorCSS(MENU_COLOR) }}>HELP</span>
      </div>
      {ROWS.map((row, i) => {
        if (row.heading) {
          return (
            <div
              key={i}
              className="menu-option"
              style={{ color: colorCSS([0.6, 1, 0.6, 1]), marginTop: i === 0 ? 0 : '0.5em' }}
            >
              {row.heading}
            </div>
          );
        }
        return (
          <div key={i} className="menu-option" style={{ color: colorCSS(MENU_UNSELECTED_COLOR) }}>
            {'  '}{(row.key ?? '').padEnd(18)}{row.desc}
          </div>
        );
      })}
      <div style={{ marginTop: '1.5em', color: colorCSS(MENU_HINT_COLOR) }}>
        {'  '}Press any key to close.
      </div>
    </div>
  );
}

export default memo(HelpOverlayImpl);
