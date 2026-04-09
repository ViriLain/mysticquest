import { describe, expect, it } from 'vitest';
import { newGame, input } from '../fixtures/mock-input';

/**
 * Scenario: the player picks up all four mushrooms, talks to Sir Whiskers,
 * and sees the Enlightened objective ("The Diner Mystery") flip directly from
 * untriggered → active → complete in a single call. The Whiskers trigger
 * fires AFTER the mushrooms are in inventory, proving reverse-order discovery
 * works through the full reducer stack.
 */
describe('scenario: the_diner_mystery end-to-end', () => {
  it('activates and completes in one talk after mushrooms are collected', () => {
    // newGame() ticks past boot, selects NEW GAME, and leaves us in
    // 'exploring' at manor_entry with a player ready.
    const store = newGame();
    expect(store.state).toBe('exploring');
    expect(store.player?.currentRoom).toBe('manor_entry');

    // Fabricate post-exploration state: place player in hidden_shroomy_forest
    // (where hidden_cat_friend actually lives per hidden.json) with all four
    // mushrooms. We skip the real travel path because the per-command wiring
    // is covered by Task 9's integration — this test only verifies
    // reverse-order discovery through the full reducer stack.
    store.player!.currentRoom = 'hidden_shroomy_forest';
    store.player!.inventory = {
      red_mushroom: 1,
      grey_mushroom: 1,
      green_mushroom: 1,
      orange_mushroom: 1,
    };

    // Confirm the objective is not yet active.
    expect(store.player!.objectives.the_diner_mystery).toBeUndefined();

    // Dispatch `talk cat` via the mock-input helper. `cat` is in the NPC's
    // match_words list, so fuzzy matching resolves to hidden_cat_friend.
    const after = input(store, 'talk cat');

    // After talk fires the talked_to_npc event, reverse-order discovery should
    // flip the objective from untriggered → active → complete in one call.
    expect(after.player!.objectives.the_diner_mystery).toBe('complete');

    // Verify both notification lines were written in the correct order.
    // addLine writes to store.typewriterQueue (drained by the UI layer into
    // store.lines via the animation loop); in a headless test we read
    // directly from the queue.
    const texts = after.typewriterQueue.map(l => l.text);
    const newEntryIdx = texts.findIndex(t => t === '* New journal entry: The Diner Mystery');
    const completeIdx = texts.findIndex(t => t === '* Journal complete: The Diner Mystery');
    expect(newEntryIdx).toBeGreaterThan(-1);
    expect(completeIdx).toBeGreaterThan(newEntryIdx);
  });
});
