import { describe, expect, it } from 'vitest';
import { newGame, input } from '../fixtures/mock-input';
import { gameReducer } from '../../src/engine/gameReducer';
import { expectLine } from '../fixtures/assert-output';

function key(store: ReturnType<typeof newGame>, k: string) {
  return gameReducer(store, { type: 'KEY_PRESSED', key: k });
}

describe('skill tree flow', () => {
  it('opens skill tree, navigates, learns a skill, and returns to exploring', () => {
    let s = newGame();
    s.player!.skillPoints = 3;

    // Type "skills" to open the tree
    s = input(s, 'skills');
    expect(s.state).toBe('skill_tree');
    expectLine(s, 'Skill Tree');
    expectLine(s, 'Tier 1');

    // Learn Iron Will (tier 1, index 0 — default position)
    s = key(s, 'Enter');
    expect(s.player!.skills['iron_will']).toBe(true);
    expect(s.player!.skillPoints).toBe(2);
    // displaySkillTree clears the terminal and re-renders; the confirmation
    // appears in the detail line as "LEARNED" rather than the transient message
    expectLine(s, 'Iron Will — LEARNED');

    // Navigate right to Sharp Eyes and learn it
    s = key(s, 'ArrowRight');
    s = key(s, 'Enter');
    expect(s.player!.skills['sharp_eyes']).toBe(true);
    expect(s.player!.skillPoints).toBe(1);

    // Navigate down to tier 2 (now unlocked) and learn
    s = key(s, 'ArrowDown');
    s = key(s, 'ArrowLeft'); // go to index 0
    s = key(s, 'Enter');
    expect(s.player!.skills['heavy_blows']).toBe(true);
    expect(s.player!.skillPoints).toBe(0);

    // Escape back to exploring
    s = key(s, 'Escape');
    expect(s.state).toBe('exploring');
  });

  it('learn command still works as text shortcut', () => {
    let s = newGame();
    s.player!.skillPoints = 1;
    s = input(s, 'learn iron will');
    expect(s.player!.skills['iron_will']).toBe(true);
    expect(s.state).toBe('exploring');
  });
});
