import { describe, it, expect } from 'vitest';
import { getAsciiLines, getRegionArtName } from '../../src/engine/asciiArt';

describe('getRegionArtName', () => {
  it('returns null for null region', () => {
    expect(getRegionArtName(null)).toBeNull();
  });

  it('returns null for unknown region', () => {
    expect(getRegionArtName('atlantis')).toBeNull();
  });

  it.each(['manor', 'wilds', 'darkness', 'wastes', 'hidden'])(
    'returns a loadable key for region %s',
    (region) => {
      const key = getRegionArtName(region);
      expect(key).toBe(`region_${region}`);
      const lines = getAsciiLines(key!);
      expect(lines).not.toBeNull();
      expect(lines!.length).toBeGreaterThan(0);
    }
  );

  it('region art lines never exceed 40 columns', () => {
    for (const region of ['manor', 'wilds', 'darkness', 'wastes', 'hidden']) {
      const lines = getAsciiLines(`region_${region}`)!;
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(40);
      }
    }
  });
});
