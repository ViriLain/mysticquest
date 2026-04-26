import { describe, expect, it } from 'vitest';
import { validateContent, type ContentBundle } from '../../src/engine/contentValidation';
import type {
  AccessoryDef, ArmorDef, EndingDef, EnemyDef, ItemDef, NpcDef,
  ObjectiveDef, RegionData, WeaponDef,
} from '../../src/engine/types';
import type { ShopDef } from '../../src/engine/economy';

import manorJson from '../../src/data/regions/manor.json';
import wildsJson from '../../src/data/regions/wilds.json';
import darknessJson from '../../src/data/regions/darkness.json';
import wastesJson from '../../src/data/regions/wastes.json';
import hiddenJson from '../../src/data/regions/hidden.json';
import itemsJson from '../../src/data/items.json';
import weaponsJson from '../../src/data/weapons.json';
import armorJson from '../../src/data/armor.json';
import accessoriesJson from '../../src/data/accessories.json';
import enemiesJson from '../../src/data/enemies.json';
import npcsJson from '../../src/data/npcs.json';
import shopsJson from '../../src/data/shops.json';
import endingsJson from '../../src/data/endings.json';
import objectivesJson from '../../src/data/objectives.json';

function liveBundle(): ContentBundle {
  return {
    regions: [
      manorJson as RegionData,
      wildsJson as RegionData,
      darknessJson as RegionData,
      wastesJson as RegionData,
      hiddenJson as RegionData,
    ],
    items: itemsJson as Record<string, ItemDef>,
    weapons: weaponsJson as Record<string, WeaponDef>,
    armor: armorJson as Record<string, ArmorDef>,
    accessories: accessoriesJson as Record<string, AccessoryDef>,
    enemies: enemiesJson as Record<string, EnemyDef>,
    npcs: npcsJson as Record<string, NpcDef>,
    shops: shopsJson as Record<string, ShopDef>,
    endings: endingsJson as Record<string, EndingDef>,
    objectives: objectivesJson as ObjectiveDef[],
    startingRoom: 'manor_entry',
  };
}

describe('content validation', () => {
  it('the live content has zero validation errors', () => {
    const errors = validateContent(liveBundle());
    expect(errors).toEqual([]);
  });

  it('flags an exit pointing at a non-existent room', () => {
    const bundle = liveBundle();
    const broken: RegionData = {
      rooms: [{
        id: 'broken_room',
        name: 'Broken',
        region: 'manor',
        description: 'x',
        exits: { north: 'does_not_exist' },
      }],
    };
    bundle.regions = [...bundle.regions, broken];
    const errors = validateContent(bundle);
    expect(errors).toContain('rooms.broken_room.exits.north: target "does_not_exist" is not a known room');
  });

  it('flags a missing starting room', () => {
    const bundle = liveBundle();
    bundle.startingRoom = 'no_such_room';
    const errors = validateContent(bundle);
    expect(errors).toContain('startingRoom: "no_such_room" does not exist');
  });

  it('flags a shop selling an unknown item', () => {
    const bundle = liveBundle();
    bundle.shops = {
      ...bundle.shops,
      bad_shop: {
        owner_npc: 'manor_merchant',
        name: 'Bad Shop',
        buys: 'all',
        stock: [{ id: 'phantom_item', qty: 1 }],
      },
    };
    const errors = validateContent(bundle);
    expect(errors).toContain('shops.bad_shop.stock[0]: "phantom_item" is not a known item');
  });

  it('flags an enemy whose loot drop does not exist', () => {
    const bundle = liveBundle();
    bundle.enemies = {
      ...bundle.enemies,
      ghost_enemy: {
        name: 'Ghost',
        hp: 10, attack: 1, defense: 0, xp: 1,
        loot: ['nonexistent_potion'],
        region: 'manor',
        description: 'x',
        is_boss: false,
      },
    };
    const errors = validateContent(bundle);
    expect(errors).toContain('enemies.ghost_enemy.loot: "nonexistent_potion" is not a known item/weapon/armor/accessory');
  });

  it('flags a dialogue choice pointing at an unknown next node', () => {
    const bundle = liveBundle();
    bundle.npcs = {
      ...bundle.npcs,
      bad_npc: {
        name: 'Bad NPC',
        description: 'x',
        match_words: ['bad'],
        dialogue: {
          start: {
            text: ['hi'],
            choices: [{ label: 'go', next: 'missing_node' }],
          },
        },
      },
    };
    const errors = validateContent(bundle);
    expect(errors).toContain('npcs.bad_npc.dialogue.start.choices[0].next: "missing_node" is not a known dialogue node');
  });

  it('flags an objective trigger referencing an unknown enemy', () => {
    const bundle = liveBundle();
    bundle.objectives = [
      ...bundle.objectives,
      {
        id: 'broken_objective',
        title: 'Broken',
        hint: 'x',
        trigger: { type: 'defeated_enemy', enemy: 'phantom_enemy' },
        completion: { type: 'enemy_defeated', enemy: 'phantom_enemy' },
        completion_text: 'x',
      },
    ];
    const errors = validateContent(bundle);
    expect(errors.some(e => e.includes('phantom_enemy'))).toBe(true);
  });

  it('flags an unknown on_enter event', () => {
    const bundle = liveBundle();
    const broken: RegionData = {
      rooms: [{
        id: 'event_room',
        name: 'Event Room',
        region: 'manor',
        description: 'x',
        exits: {},
        on_enter: 'fictional_event',
      }],
    };
    bundle.regions = [...bundle.regions, broken];
    const errors = validateContent(bundle);
    expect(errors).toContain('rooms.event_room.on_enter: unknown event "fictional_event"');
  });
});
