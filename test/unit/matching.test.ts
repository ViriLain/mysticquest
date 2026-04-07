import { describe, expect, it } from 'vitest';
import { createInitialStore } from '../../src/engine/gameReducer';
import { findAllMatches, resolveOrDisambiguate, type Matchable } from '../../src/engine/matching';

const data: Record<string, Matchable> = {
  rusty_dagger: { name: 'Rusty Dagger', match_words: ['dagger', 'rusty'] },
  iron_sword: { name: 'Iron Sword', match_words: ['sword', 'iron'] },
  silver_sword: { name: 'Silver Sword', match_words: ['sword', 'silver'] },
};

const ids = Object.keys(data);

describe('findAllMatches', () => {
  it('returns an exact id match immediately', () => {
    expect(findAllMatches('rusty_dagger', ids, data)).toEqual(['rusty_dagger']);
  });

  it('returns an exact full-name match immediately', () => {
    expect(findAllMatches('Iron Sword', ids, data)).toEqual(['iron_sword']);
  });

  it('uses exact match_words matches before partial matching', () => {
    expect(findAllMatches('rusty', ids, data)).toEqual(['rusty_dagger']);
  });

  it('falls back to partial matches on ids and names', () => {
    expect(findAllMatches('silver', ids, data)).toEqual(['silver_sword']);
  });

  it('returns multiple matches when a match word is shared', () => {
    expect(findAllMatches('sword', ids, data)).toEqual(['iron_sword', 'silver_sword']);
  });

  it('prints disambiguation output when multiple matches remain', () => {
    const store = createInitialStore();

    const resolved = resolveOrDisambiguate(store, ['iron_sword', 'silver_sword'], data, 'weapon');

    expect(resolved).toBeNull();
    expect(store.typewriterQueue.map(line => line.text)).toEqual([
      'Which weapon?',
      '  Iron Sword',
      '  Silver Sword',
    ]);
  });
});
