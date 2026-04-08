import type { GameStore } from '../types';
import * as C from '../constants';
import { addLine, clearTerminal, emitSound, hideHeader } from '../output';
import { anySlotHasData } from '../save';

export interface MenuDeps {
  startNewGame: () => void;
  openSlotPicker: (mode: 'load') => void;
  startDungeonMode: () => void;
  openSettings: () => void;
}

export function handleMenuKey(s: GameStore, key: string, deps: MenuDeps): void {
  if (key === 'ArrowUp' || key === 'w') {
    s.menuSelected--;
    if (s.menuSelected < 0) s.menuSelected = C.MENU_OPTIONS.length - 1;
    emitSound(s, 'menuMove');
  } else if (key === 'ArrowDown' || key === 's') {
    s.menuSelected++;
    if (s.menuSelected >= C.MENU_OPTIONS.length) s.menuSelected = 0;
    emitSound(s, 'menuMove');
  } else if (key === 'Enter') {
    const option = C.MENU_OPTIONS[s.menuSelected];
    if (option === 'NEW GAME') {
      emitSound(s, 'menuSelect');
      deps.startNewGame();
    } else if (option === 'CONTINUE') {
      emitSound(s, 'menuSelect');
      if (anySlotHasData()) deps.openSlotPicker('load');
    } else if (option === 'DUNGEON MODE') {
      emitSound(s, 'menuSelect');
      deps.startDungeonMode();
    } else if (option === 'SETTINGS') {
      emitSound(s, 'menuSelect');
      deps.openSettings();
    } else if (option === 'QUIT') {
      emitSound(s, 'menuSelect');
      clearTerminal(s);
      hideHeader(s);
      addLine(s, '');
      addLine(s, 'Thanks for playing MysticQuest.', C.MENU_COLOR);
      addLine(s, '');
      addLine(s, 'You can close this browser tab.', C.HELP_COLOR);
      s.state = 'quit';
    }
  }
}
