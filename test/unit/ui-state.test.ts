import { describe, expect, it } from 'vitest';
import { createInitialStore } from '../../src/engine/gameReducer';
import { handleGameoverInput, startGameover } from '../../src/engine/state/gameover';
import { handleMenuKey } from '../../src/engine/state/menu';
import { openSettings } from '../../src/engine/state/settings';
import { openSlotPicker } from '../../src/engine/state/slot-picker';
import { createPlayer } from '../../src/engine/player';
import { createWorld } from '../../src/engine/world';

describe('ui state helpers', () => {
  it('menu enter delegates new game selection', () => {
    const store = createInitialStore();
    let started = 0;

    handleMenuKey(store, 'Enter', {
      startNewGame: () => {
        started++;
      },
      openSlotPicker: () => {},
      startDungeonMode: () => {},
      openSettings: () => {},
    });

    expect(started).toBe(1);
  });

  it('openSettings and openSlotPicker update state fields', () => {
    const store = createInitialStore();

    openSettings(store, 'menu');
    expect(store.state).toBe('settings');
    expect(store.settingsPrevState).toBe('menu');

    openSlotPicker(store, 'save');
    expect(store.state).toBe('slot_picker');
    expect(store.slotPickerMode).toBe('save');
  });

  it('startGameover and gameover input delegate restart options', () => {
    const store = createInitialStore();
    store.player = createPlayer();
    store.world = createWorld();
    store.gameMode = 'dungeon';
    store.dungeon = {
      seed: 7,
      floor: 2,
      score: { floorsCleared: 1, enemiesKilled: 3, itemsFound: 0, totalXp: 0 },
      floorEnemies: {},
      dungeonPerks: [],
    };

    let retried: number | null = null;
    startGameover(store);
    handleGameoverInput(store, '2', {
      startMenu: () => {},
      openSlotPicker: () => {},
      startDungeonMode: seed => {
        retried = seed;
      },
    });

    expect(store.state).toBe('gameover');
    expect(retried).toBe(7);
  });
});
