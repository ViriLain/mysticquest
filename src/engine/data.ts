// Centralized typed loaders for the JSON content under `src/data/`.
//
// Each JSON file is imported and cast exactly once here. Consumer modules
// import the typed exports (`WEAPONS`, `ITEMS`, ...) directly instead of
// re-casting at every import site, which removes ~20 redundant
// `as Record<string, X>` casts and pins the cast-vs-validation boundary in a
// single location.
//
// Shape validation is provided by `contentValidation.ts` and exercised in
// `test/unit/contentValidation.test.ts`. CI catches a bad content commit
// before it can ship.

// `OBJECTIVES` lives in `objectives.ts` (alongside the trigger/completion
// machinery that consumes it) — import from there, not from this file.

import type {
  AccessoryDef, ArmorDef, EndingDef, EnemyDef, ItemDef,
  NpcDef, RegionData, WeaponDef,
} from './types';
import type { ShopDef } from './economy';

import accessoriesJson from '../data/accessories.json';
import armorJson from '../data/armor.json';
import enemiesJson from '../data/enemies.json';
import endingsJson from '../data/endings.json';
import itemsJson from '../data/items.json';
import npcsJson from '../data/npcs.json';
import shopsJson from '../data/shops.json';
import weaponsJson from '../data/weapons.json';

import darknessJson from '../data/regions/darkness.json';
import hiddenJson from '../data/regions/hidden.json';
import manorJson from '../data/regions/manor.json';
import wastesJson from '../data/regions/wastes.json';
import wildsJson from '../data/regions/wilds.json';

export const ACCESSORIES = accessoriesJson as Record<string, AccessoryDef>;
export const ARMOR = armorJson as Record<string, ArmorDef>;
export const ENEMIES = enemiesJson as Record<string, EnemyDef>;
export const ENDINGS = endingsJson as Record<string, EndingDef>;
export const ITEMS = itemsJson as Record<string, ItemDef>;
export const NPCS = npcsJson as Record<string, NpcDef>;
export const SHOPS = shopsJson as Record<string, ShopDef>;
export const WEAPONS = weaponsJson as Record<string, WeaponDef>;

// Regions need the two-step `as unknown as` cast: each room's `exits` is
// inferred by TypeScript as a union of literal subsets (e.g. `{north: string,
// south: string}`) which doesn't structurally overlap `Record<string, string>`.
// The runtime shape is correct; the cast just bridges JSON inference to the
// engine's typed view.
export const STORY_REGIONS: readonly RegionData[] = [
  manorJson as unknown as RegionData,
  wildsJson as unknown as RegionData,
  darknessJson as unknown as RegionData,
  wastesJson as unknown as RegionData,
  hiddenJson as unknown as RegionData,
];
