import * as C from '../constants';
import { addLine, emitSound } from '../output';
import { saveToSlot } from '../save';
import type { GameStore } from '../types';

export interface PauseMenuDeps {
  startMenu: () => void;
  openSettings: () => void;
  openSlotPicker: (mode: 'save') => void;
}

export const PAUSE_MENU_OPTIONS = ['Resume', 'Save', 'Settings', 'Quit to Title'] as const;

export function openPauseMenu(store: GameStore): void {
  store.state = 'paused';
  store.pauseMenuSelected = 0;
}

export function handlePauseMenuKey(s: GameStore, key: string, deps: PauseMenuDeps): void {
  if (key === 'ArrowUp') {
    s.pauseMenuSelected = (s.pauseMenuSelected - 1 + PAUSE_MENU_OPTIONS.length) % PAUSE_MENU_OPTIONS.length;
    emitSound(s, 'menuMove');
    return;
  }
  if (key === 'ArrowDown') {
    s.pauseMenuSelected = (s.pauseMenuSelected + 1) % PAUSE_MENU_OPTIONS.length;
    emitSound(s, 'menuMove');
    return;
  }
  if (key === 'Escape') {
    // Esc treats the pause menu like a transparent overlay — resume play.
    s.state = 'exploring';
    return;
  }
  if (key === 'Enter') {
    emitSound(s, 'menuSelect');
    const choice = PAUSE_MENU_OPTIONS[s.pauseMenuSelected];
    if (choice === 'Resume') {
      s.state = 'exploring';
      return;
    }
    if (choice === 'Save') {
      // If a slot is active, save in place; otherwise hand off to the
      // slot picker so the player chooses one.
      if (s.activeSlot !== null && s.player && s.world) {
        if (saveToSlot(s.activeSlot, s.player, s.world, s.dungeon, s.shopState.runtime)) {
          addLine(s, 'Game saved.', C.ITEM_COLOR);
          emitSound(s, 'save');
        } else {
          addLine(s, 'Failed to save game.', C.ERROR_COLOR);
        }
        s.state = 'exploring';
      } else {
        deps.openSlotPicker('save');
      }
      return;
    }
    if (choice === 'Settings') {
      deps.openSettings();
      return;
    }
    if (choice === 'Quit to Title') {
      deps.startMenu();
      return;
    }
  }
}
