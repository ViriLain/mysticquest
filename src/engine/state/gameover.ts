import type { GameStore } from '../types';
import * as C from '../constants';
import { pushEffect } from '../effects';
import { anySlotHasData } from '../save';
import { addLine, clearTerminal, displayAscii, emitSound } from '../output';

export interface GameoverDeps {
  startMenu: () => void;
  openSlotPicker: (mode: 'load') => void;
  startDungeonMode: (seed: number) => void;
}

export function startGameover(store: GameStore): void {
  store.state = 'gameover';
  store.gameoverReady = false;
  emitSound(store, 'death');

  pushEffect(store.effects, 'shake', 0.5, { intensity: 8 });
  pushEffect(store.effects, 'flash', 0.5, { r: 1, g: 0, b: 0 });
  pushEffect(store.effects, 'glitch', 2.0, { intensity: 0.7 });

  clearTerminal(store);
  store.baseColor = [1.0, 0.2, 0.2, 1];

  if (store.gameMode === 'dungeon' && store.dungeon) {
    addLine(store, '');
    addLine(store, '=== DUNGEON RUN ENDED ===', C.ERROR_COLOR);
    addLine(store, `Floor reached: ${store.dungeon.floor}`, C.STAT_COLOR);
    addLine(store, `Floors cleared: ${store.dungeon.score.floorsCleared}`, C.STAT_COLOR);
    addLine(store, `Enemies killed: ${store.dungeon.score.enemiesKilled}`, C.STAT_COLOR);
    addLine(store, `Seed: ${store.dungeon.seed}`, C.HELP_COLOR);
    addLine(store, '');
    addLine(store, '[1] Return to Menu', C.HELP_COLOR);
    addLine(store, '[2] Retry (same seed)', C.HELP_COLOR);
    addLine(store, '');
  } else {
    addLine(store, '');
    displayAscii(store, 'death', C.ERROR_COLOR);
    addLine(store, '');
    addLine(store, 'YOU HAVE FALLEN', C.ERROR_COLOR);
    addLine(store, '');
    addLine(store, '[1] Load Save', C.HELP_COLOR);
    addLine(store, '[2] Quit to Menu', C.HELP_COLOR);
    addLine(store, '');
  }
}

export function handleGameoverInput(store: GameStore, input: string, deps: GameoverDeps): void {
  const trimmed = input.trim();
  if (store.gameMode === 'dungeon' && store.dungeon) {
    if (trimmed === '1' || trimmed.toLowerCase() === 'menu') {
      deps.startMenu();
    } else if (trimmed === '2' || trimmed.toLowerCase() === 'retry') {
      deps.startDungeonMode(store.dungeon.seed);
    } else {
      addLine(store, 'Choose [1] or [2].', C.ERROR_COLOR);
    }
    return;
  }
  if (trimmed === '1' || trimmed.toLowerCase() === 'load') {
    if (anySlotHasData()) {
      deps.openSlotPicker('load');
    } else {
      addLine(store, 'No save file found.', C.ERROR_COLOR);
    }
  } else if (trimmed === '2' || trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'menu') {
    deps.startMenu();
  } else {
    addLine(store, 'Choose [1] or [2].', C.ERROR_COLOR);
  }
}
