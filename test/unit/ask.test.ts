import { describe, expect, it } from 'vitest';
import itemsJson from '../../src/data/items.json';
import npcsJson from '../../src/data/npcs.json';
import wildsJson from '../../src/data/regions/wilds.json';
import weaponsJson from '../../src/data/weapons.json';
import { createInitialStore } from '../../src/engine/gameReducer';
import { handleAsk } from '../../src/engine/handlers/ask';
import { createPlayer } from '../../src/engine/player';
import type { ItemDef, NpcDef, RegionData, WeaponDef } from '../../src/engine/types';
import { createWorld, loadRegion } from '../../src/engine/world';

const itemData = itemsJson as Record<string, ItemDef>;
const npcData = npcsJson as Record<string, NpcDef>;
const weaponData = weaponsJson as Record<string, WeaponDef>;

function makeAskStore(roomId = 'wilds_clearing') {
  const store = createInitialStore();
  const world = createWorld();
  loadRegion(world, wildsJson as RegionData);
  store.world = world;
  store.player = createPlayer(roomId);
  return store;
}

describe('ask handler', () => {
  it('asks the only nearby NPC about an item by item name', () => {
    const store = makeAskStore();

    handleAsk(store, 'about ancient map', itemData, weaponData, npcData);

    expect(store.typewriterQueue.map(line => line.text)).toContain(
      'Wren taps the Ancient Map. "It marks old paths that the forest tries to forget. If a route feels wrong, check the map and trust the hidden trail."',
    );
  });

  it('asks a named nearby NPC about a unique weapon', () => {
    const store = makeAskStore();

    handleAsk(store, 'guide about Hrunting', itemData, weaponData, npcData);

    expect(store.typewriterQueue.map(line => line.text)).toContain(
      'Wren says, "Hrunting is older than these trees. If you carry it, listen for the hum before a fight; that is the blade waking up."',
    );
  });

  it('uses the NPC fallback when the topic has no answer', () => {
    const store = makeAskStore();

    handleAsk(store, 'about picnic baskets', itemData, weaponData, npcData);

    expect(store.typewriterQueue.map(line => line.text)).toContain(
      'Wren narrows her eyes. "If it matters, the forest will leave tracks. I do not know that one."',
    );
  });
});
