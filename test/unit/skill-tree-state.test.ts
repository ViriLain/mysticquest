import { describe, expect, it } from 'vitest';
import { createInitialStore } from '../../src/engine/gameReducer';
import { displaySkillTree, handleSkillTreeKey, type SkillTreeDeps } from '../../src/engine/state/skill-tree';
import { createPlayer } from '../../src/engine/player';
import { createWorld, loadRegion } from '../../src/engine/world';
import { allLines } from '../fixtures/assert-output';
import manorJson from '../../src/data/regions/manor.json';
import type { RegionData } from '../../src/engine/types';

function makeStore() {
  const store = createInitialStore();
  store.world = createWorld();
  loadRegion(store.world, manorJson as RegionData);
  store.player = createPlayer();
  store.player.skillPoints = 2;
  store.state = 'skill_tree';
  return store;
}

function makeDeps(): SkillTreeDeps {
  return {
    refreshHeader: () => {},
    emit: () => {},
    checkScholar: () => {},
  };
}

describe('skill tree state', () => {
  it('displays skill tree with tiers', () => {
    const store = makeStore();
    displaySkillTree(store);
    const lines = allLines(store);
    expect(lines.some(l => l.includes('Skill Tree'))).toBe(true);
    expect(lines.some(l => l.includes('Tier 1'))).toBe(true);
    expect(lines.some(l => l.includes('Tier 5'))).toBe(true);
    expect(lines.some(l => l.includes('Iron Will'))).toBe(true);
  });

  it('navigates with arrow keys', () => {
    const store = makeStore();
    displaySkillTree(store);

    expect(store.skillTreeSelected).toEqual({ tier: 1, index: 0 });

    handleSkillTreeKey(store, 'ArrowRight', makeDeps());
    expect(store.skillTreeSelected).toEqual({ tier: 1, index: 1 });

    handleSkillTreeKey(store, 'ArrowDown', makeDeps());
    expect(store.skillTreeSelected).toEqual({ tier: 2, index: 1 });

    handleSkillTreeKey(store, 'ArrowLeft', makeDeps());
    expect(store.skillTreeSelected).toEqual({ tier: 2, index: 0 });
  });

  it('clamps at boundaries', () => {
    const store = makeStore();
    displaySkillTree(store);

    handleSkillTreeKey(store, 'ArrowUp', makeDeps());
    expect(store.skillTreeSelected.tier).toBe(1);

    handleSkillTreeKey(store, 'ArrowLeft', makeDeps());
    expect(store.skillTreeSelected.index).toBe(0);

    for (let i = 0; i < 5; i++) handleSkillTreeKey(store, 'ArrowDown', makeDeps());
    expect(store.skillTreeSelected.tier).toBe(5);

    handleSkillTreeKey(store, 'ArrowRight', makeDeps());
    handleSkillTreeKey(store, 'ArrowRight', makeDeps());
    expect(store.skillTreeSelected.index).toBe(2);

    handleSkillTreeKey(store, 'ArrowRight', makeDeps());
    expect(store.skillTreeSelected.index).toBe(2);
  });

  it('learns a skill on Enter', () => {
    const store = makeStore();
    displaySkillTree(store);

    handleSkillTreeKey(store, 'Enter', makeDeps());
    expect(store.player!.skills['iron_will']).toBe(true);
    expect(store.player!.skillPoints).toBe(1);
    expect(store.state).toBe('skill_tree');
  });

  it('shows error when no skill points', () => {
    const store = makeStore();
    store.player!.skillPoints = 0;
    displaySkillTree(store);

    handleSkillTreeKey(store, 'Enter', makeDeps());
    expect(store.player!.skills['iron_will']).toBeUndefined();
    const lines = allLines(store);
    expect(lines.some(l => l.includes('no skill points'))).toBe(true);
  });

  it('shows error for locked skill', () => {
    const store = makeStore();
    displaySkillTree(store);

    handleSkillTreeKey(store, 'ArrowDown', makeDeps());
    handleSkillTreeKey(store, 'Enter', makeDeps());
    expect(store.player!.skills['heavy_blows']).toBeUndefined();
    const lines = allLines(store);
    expect(lines.some(l => l.includes('previous tier'))).toBe(true);
  });

  it('returns to exploring on Escape', () => {
    const store = makeStore();
    store.skillTreePrevState = 'exploring';
    displaySkillTree(store);

    handleSkillTreeKey(store, 'Escape', makeDeps());
    expect(store.state).toBe('exploring');
  });
});
