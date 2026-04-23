import { describe, it, expect } from 'vitest';
import { getAsciiLines, getRegionArtName, getWeaponArtName } from '../../src/engine/asciiArt';

const REGIONS = ['manor', 'wilds', 'darkness', 'wastes', 'hidden'];
const MAGIC_WEAPONS = ['hrunting', 'tyrfing', 'excalibur', 'keyblade', 'anduril', 'ragnarok'];

describe('getRegionArtName', () => {
  it('returns null for null region', () => {
    expect(getRegionArtName(null)).toBeNull();
  });

  it('returns null for unknown region', () => {
    expect(getRegionArtName('atlantis')).toBeNull();
  });

  it.each(REGIONS)('returns a loadable key for region %s', (region) => {
    const key = getRegionArtName(region);
    expect(key).toBe(`region_${region}`);
    const lines = getAsciiLines(key!);
    expect(lines).not.toBeNull();
    expect(lines!.length).toBeGreaterThan(0);
  });

  it('region art lines never exceed 40 columns', () => {
    for (const region of REGIONS) {
      const lines = getAsciiLines(`region_${region}`)!;
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(40);
      }
    }
  });
});

describe('getWeaponArtName', () => {
  it('returns null for a weapon without registered art', () => {
    expect(getWeaponArtName('rusty_dagger')).toBeNull();
    expect(getWeaponArtName('iron_sword')).toBeNull();
    expect(getWeaponArtName('')).toBeNull();
  });

  it.each(MAGIC_WEAPONS)('returns a loadable key for magic weapon %s', (weaponId) => {
    const key = getWeaponArtName(weaponId);
    expect(key).toBe(`weapon_${weaponId}`);
    const lines = getAsciiLines(key!);
    expect(lines).not.toBeNull();
    expect(lines!.length).toBeGreaterThan(0);
  });

  it('weapon art lines never exceed 40 columns', () => {
    for (const weaponId of MAGIC_WEAPONS) {
      const lines = getAsciiLines(`weapon_${weaponId}`)!;
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(40);
      }
    }
  });
});
