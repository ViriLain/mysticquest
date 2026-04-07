import { describe, expect, it } from 'vitest';
import itemsJson from '../../src/data/items.json';
import manorJson from '../../src/data/regions/manor.json';
import npcsJson from '../../src/data/npcs.json';
import weaponsJson from '../../src/data/weapons.json';
import { createInitialStore } from '../../src/engine/gameReducer';
import { createPlayer } from '../../src/engine/player';
import type { ItemDef, NpcDef, RegionData, WeaponDef } from '../../src/engine/types';
import { createWorld, loadRegion } from '../../src/engine/world';
import { handleNpcDialogueInput, handleTalk } from '../../src/engine/handlers/talk';

const itemData = itemsJson as Record<string, ItemDef>;
const weaponData = weaponsJson as Record<string, WeaponDef>;
const npcData = npcsJson as Record<string, NpcDef>;

function makeTalkStore() {
  const store = createInitialStore();
  const world = createWorld();
  loadRegion(world, manorJson as RegionData);
  store.world = world;
  store.player = createPlayer('manor_main_hall');
  return store;
}

describe('talk handlers', () => {
  it('starts dialogue with the room NPC and shows visible choices', () => {
    const store = makeTalkStore();
    let chatterboxChecks = 0;

    handleTalk(store, '', npcData, () => {
      chatterboxChecks++;
    });

    expect(store.state).toBe('dialogue');
    expect(store.npcDialogue).toEqual({ npcId: 'manor_merchant', currentNode: 'start' });
    expect(store.dialogueOptions).toEqual([
      'What do you have for sale?',
      'Browse your wares',
      'What happened to this manor?',
      'Know anything about the cellar?',
      'Goodbye.',
    ]);
    expect(store.player?.firedEvents.talked_manor_merchant).toBe(true);
    expect(chatterboxChecks).toBe(1);
  });

  it('applies dialogue effects and advances to the next node', () => {
    const store = makeTalkStore();

    handleTalk(store, '', npcData, () => {});
    handleNpcDialogueInput(store, '1', itemData, weaponData, npcData, () => {}, () => {});
    handleNpcDialogueInput(store, '1', itemData, weaponData, npcData, () => {}, () => {});

    expect(store.player?.inventory.potion).toBe(1);
    expect(store.npcDialogue).toEqual({ npcId: 'manor_merchant', currentNode: 'shop_thanks' });
    expect(store.dialogueOptions).toEqual([
      'Where am I headed?',
      'Goodbye.',
    ]);
    expect(store.typewriterQueue.map(line => line.text)).toContain('Received: Potion');
  });

  it('opens a shop when the dialogue effect requests it', () => {
    const store = makeTalkStore();
    let openedShopId: string | null = null;

    handleTalk(store, '', npcData, () => {});
    handleNpcDialogueInput(store, '2', itemData, weaponData, npcData, () => {}, shopId => {
      openedShopId = shopId;
    });

    expect(openedShopId).toBe('manor_dusty');
  });
});
