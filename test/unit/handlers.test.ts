import { describe, expect, it } from 'vitest';
import manorJson from '../../src/data/regions/manor.json';
import { createInitialStore } from '../../src/engine/gameReducer';
import { handleHelp } from '../../src/engine/handlers/help';
import { handleLook } from '../../src/engine/handlers/look';
import { createPlayer } from '../../src/engine/player';
import type { RegionData } from '../../src/engine/types';
import { createWorld, loadRegion } from '../../src/engine/world';

describe('read-only handlers', () => {
  it('look adds spacing then renders the current room', () => {
    const store = createInitialStore();
    const world = createWorld();
    loadRegion(world, manorJson as RegionData);
    store.world = world;
    store.player = createPlayer();

    handleLook(store);

    expect(store.typewriterQueue.map(line => line.text).slice(0, 5)).toEqual([
      '',
      '----------------------------------------',
      'Entry',
      '',
      'You are inside the entry room of an old manor. It is reasonably large, with old chairs and a coat rack on the west wall. The walls are upholstered, and an ornate chandelier hangs from the ceiling. A window to the south is the room\'s only source of light.',
    ]);
  });

  it('help renders the command reference text', () => {
    const store = createInitialStore();

    handleHelp(store);

    const lines = store.typewriterQueue.map(line => line.text);
    expect(lines.slice(0, 5)).toEqual([
      '',
      '----------------------------------------',
      '=== COMMANDS ===',
      '',
      ' MOVEMENT',
    ]);
    expect(lines).toContain('  help (?)        - Show this help');
    expect(lines.at(-1)).toBe('----------------------------------------');
  });
});
