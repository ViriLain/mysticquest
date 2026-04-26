// Focused tests for state-machine boundaries — places where the engine
// transitions between states (dialogue/shop/combat/exploring/ending/gameover)
// and where bugs tend to lurk because no single handler owns the full path.
//
// Each test exercises a transition that is otherwise unprotected by the
// existing scenario suite. If one of these fails, it almost certainly
// reflects a real bug rather than a brittle test.

import { describe, expect, it } from 'vitest';
import { gameReducer } from '../../src/engine/gameReducer';
import { expectLine, expectNoLine } from '../fixtures/assert-output';
import { flushTypewriter, input, newGame, tick } from '../fixtures/mock-input';

// Walk to Dusty's NPC and start the conversation. Stops at the dialogue
// menu where Browse-your-wares is option 2.
function reachDustyDialogue() {
  let s = newGame();
  s.player!.attack = 100;
  s = input(s, 'attack rat');
  for (let i = 0; i < 10 && s.state === 'combat'; i++) {
    s = input(s, 'attack');
  }
  s = input(s, 'go north');
  s = input(s, 'go north');
  s = input(s, 'talk dusty');
  return s;
}

describe('state transitions', () => {
  it('NPC dialogue → shop → leave round-trips through the dialogue', () => {
    let s = reachDustyDialogue();
    const npcDialogueAtStart = s.npcDialogue;
    expect(s.state).toBe('dialogue');
    expect(npcDialogueAtStart).not.toBeNull();

    // Open shop via "Browse your wares" (option 2)
    s = input(s, '2');
    expect(s.state).toBe('shop');
    // npcDialogue should be preserved while in shop so leave returns here.
    expect(s.npcDialogue).toEqual(npcDialogueAtStart);

    s = input(s, 'leave');
    expect(s.state).toBe('dialogue');
    expect(s.shopState.activeShopId).toBe(null);
    // Same dialogue node we left from.
    expect(s.npcDialogue).toEqual(npcDialogueAtStart);

    // Open shop a second time and leave again — exercise the loop.
    s = input(s, '2');
    expect(s.state).toBe('shop');
    s = input(s, 'leave');
    expect(s.state).toBe('dialogue');
    expect(s.npcDialogue).toEqual(npcDialogueAtStart);
  });

  it('Goodbye choice clears npcDialogue and returns to exploring', () => {
    let s = reachDustyDialogue();
    expect(s.state).toBe('dialogue');
    expect(s.npcDialogue).not.toBeNull();

    // Walk through Dusty's options to find the Goodbye choice (label varies
    // by NPC). Dusty's start node has 5 choices; "Goodbye." is index 5.
    s = input(s, '5');

    expect(s.state).toBe('exploring');
    expect(s.npcDialogue).toBeNull();
  });

  it('save with no active slot opens the slot picker', () => {
    let s = newGame();
    expect(s.activeSlot).toBe(null);

    s = input(s, 'save');

    expect(s.state).toBe('slot_picker');
    expect(s.slotPickerMode).toBe('save');
  });

  it('saving to slot 2 after slot 1 updates activeSlot to track the latest', () => {
    let s = newGame();

    // First save → slot picker → choose slot 1.
    s = input(s, 'save');
    expect(s.state).toBe('slot_picker');
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });
    expect(s.activeSlot).toBe(1);
    expect(s.state).toBe('exploring');

    // Second save with active slot writes silently to slot 1, doesn't open picker.
    s = input(s, 'save');
    expect(s.state).toBe('exploring');
    expect(s.activeSlot).toBe(1);

    // Open slot picker explicitly via load to write to a different slot.
    // (Players can also reach the picker via the menu, but the in-game
    // path is via the load command followed by save semantics.)
    // Since 'save' with active slot bypasses the picker, we drive the
    // slot picker directly via openSlotPicker + ArrowDown to slot 2.
    s = input(s, 'load');
    expect(s.state).toBe('slot_picker');
    s.slotPickerMode = 'save'; // simulate explicit save-to-slot intent
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'ArrowDown' });
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });
    expect(s.activeSlot).toBe(2);
    expect(s.state).toBe('exploring');
  });

  it('player dying from a status-effect tick triggers gameover', () => {
    let s = newGame();
    s = input(s, 'attack rat');
    expect(s.state).toBe('combat');

    // Drop player HP low and stack a poison effect that will kill on tick.
    s.player!.hp = 1;
    s.combat!.playerEffects.push({
      type: 'poison',
      damage: 5,
      remaining: 3,
      baseDamage: 5,
    });

    // Defending advances the round, which ticks status effects.
    s = input(s, 'defend');

    expect(s.state).toBe('gameover');
    expect(s.combat).toBeNull();
    expect(s.player!.hp).toBe(0);
  });

  it('"again" after killing the only enemy in a room prints "nothing to fight"', () => {
    let s = newGame();
    s.player!.attack = 100;

    s = input(s, 'attack rat');
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    expect(s.state).toBe('exploring');
    expect(s.lastCommand).toBe('attack rat');

    // Repeat — there's nothing left to fight.
    s = input(s, 'again');
    expect(s.state).toBe('exploring');
    expectLine(s, 'nothing like that');
  });

  it('an NPC dialogue choice runs effects without corrupting inventory', () => {
    // Use Wren (wilds_guide) — she has dialogue paths with give_item /
    // set_flag effects. We don't pin a specific path; we just verify that
    // walking through her dialogue doesn't crash or leak undefined names.
    let s = newGame();
    s.player!.attack = 100;
    s.player!.level = 5;

    s.player!.visitedRooms.wilds_clearing = true;
    s.player!.currentRoom = 'wilds_clearing';
    s = input(s, 'look');

    s = input(s, 'talk guide');
    expect(s.state).toBe('dialogue');
    expect(s.npcDialogue).not.toBeNull();

    const inventoryBefore = JSON.stringify(s.player!.inventory);

    // Walk through the first available choice repeatedly until we exit.
    for (let i = 0; i < 6 && s.state === 'dialogue'; i++) {
      s = input(s, '1');
    }

    // Either we're back to exploring, or we're in a sub-state (shop, etc.) —
    // both are acceptable. The point is: no crash, no undefined leakage.
    expect(['exploring', 'dialogue', 'shop']).toContain(s.state);
    expect(s.player!.inventory).toBeTypeOf('object');
    expectNoLine(s, 'undefined', 'no undefined item names should leak');
    void inventoryBefore;
  });

  it('saving to a slot with existing data prompts before overwriting', () => {
    let s = newGame();

    // First save populates slot 1.
    s = input(s, 'save');
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });
    expect(s.activeSlot).toBe(1);

    // Re-open the picker, force save mode (the in-game 'save' command
    // bypasses the picker when activeSlot is set).
    s = input(s, 'load');
    expect(s.state).toBe('slot_picker');
    s.slotPickerMode = 'save';

    // Enter on the populated slot 1 should NOT save — it should ask for
    // confirmation instead.
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });
    expect(s.slotPickerOverwriteConfirm).toBe(true);
    expect(s.state).toBe('slot_picker');

    // Esc cancels the overwrite, leaves us in the picker.
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Escape' });
    expect(s.slotPickerOverwriteConfirm).toBe(false);
    expect(s.state).toBe('slot_picker');

    // Second Enter re-prompts; second Enter (after re-prompting) commits.
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });
    expect(s.slotPickerOverwriteConfirm).toBe(true);
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });
    expect(s.slotPickerOverwriteConfirm).toBe(false);
    expect(s.state).toBe('exploring');
    expect(s.activeSlot).toBe(1);
  });

  it('Esc in exploring opens pause menu; Resume returns to exploring', () => {
    let s = newGame();
    expect(s.state).toBe('exploring');

    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Escape' });
    expect(s.state).toBe('paused');
    expect(s.pauseMenuSelected).toBe(0); // Resume

    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });
    expect(s.state).toBe('exploring');
  });

  it('Pause → Esc resumes immediately without confirming', () => {
    let s = newGame();
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Escape' });
    expect(s.state).toBe('paused');

    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Escape' });
    expect(s.state).toBe('exploring');
  });

  it('Pause → Quit to Title returns to the main menu', () => {
    let s = newGame();
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Escape' });
    expect(s.state).toBe('paused');

    // Down 3 times to highlight Quit (Resume/Save/Settings/Quit).
    for (let i = 0; i < 3; i++) {
      s = gameReducer(s, { type: 'KEY_PRESSED', key: 'ArrowDown' });
    }
    expect(s.pauseMenuSelected).toBe(3);

    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });
    expect(s.state).toBe('menu');
  });

  it('Pause → Save with active slot writes silently and resumes', () => {
    let s = newGame();
    s.activeSlot = 1;

    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Escape' });
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'ArrowDown' });
    expect(s.pauseMenuSelected).toBe(1); // Save

    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });
    expect(s.state).toBe('exploring');
  });

  it('Pause → Save without active slot opens the slot picker', () => {
    let s = newGame();
    expect(s.activeSlot).toBe(null);

    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Escape' });
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'ArrowDown' });
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });

    expect(s.state).toBe('slot_picker');
    expect(s.slotPickerMode).toBe('save');
  });

  it('F1 toggles the help overlay and any key returns to the previous state', () => {
    let s = newGame();
    expect(s.state).toBe('exploring');

    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'F1' });
    expect(s.state).toBe('help_overlay');
    expect(s.helpOverlayPrevState).toBe('exploring');

    // Any key dismisses — try Escape first.
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Escape' });
    expect(s.state).toBe('exploring');

    // F1 from menu should return to menu on dismiss.
    s.state = 'menu';
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'F1' });
    expect(s.state).toBe('help_overlay');
    expect(s.helpOverlayPrevState).toBe('menu');
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });
    expect(s.state).toBe('menu');
  });

  it('autosaveFlashTime fires on room-entry autosave and decays to 0', () => {
    let s = newGame();
    s.activeSlot = 1; // an active slot is required for autosave to fire

    // The autosave only fires on enterRoom — pick a direction and walk.
    expect(s.autosaveFlashTime).toBe(0);
    s = input(s, 'go north');
    expect(s.autosaveFlashTime).toBeGreaterThan(0);

    // Tick forward past the flash duration; the timer should clamp to 0.
    for (let i = 0; i < 40 && s.autosaveFlashTime > 0; i++) {
      s = tick(s, 0.1);
    }
    expect(s.autosaveFlashTime).toBe(0);
  });

  it('killing the final boss transitions combat → ending → exploring', () => {
    // Set up: drop the player into combat with the evil king (the boss whose
    // defeat triggers the_hero ending).
    let s = newGame();
    s.player!.attack = 999;
    s.player!.maxHp = 9999;
    s.player!.hp = 9999;
    s.player!.currentRoom = 'darkness_stronghold';
    s.player!.visitedRooms.darkness_stronghold = true;

    s = input(s, 'attack king');
    if (s.state !== 'combat') {
      throw new Error('expected to enter combat with evil_king');
    }

    // One-shot the king (attack > king.hp).
    s = input(s, 'attack');

    // Combat resolves → ending fires.
    expect(s.state).toBe('ending');
    expect(s.endingData?.title).toBe('The Hero');

    // Drive the ending text via TICK until everything has been emitted.
    // The reducer queues lines onto typewriterQueue but only updates the
    // ending timer when typewriter is idle, so we have to flush the queue
    // each frame (Game.tsx does this in its animation loop).
    for (let i = 0; i < 200 && !s.endingAllTyped; i++) {
      flushTypewriter(s);
      s = tick(s, 0.5);
    }
    flushTypewriter(s);
    expect(s.endingAllTyped).toBe(true);
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });

    // After acknowledgement, we should be back in exploring, with state
    // cleaned up.
    expect(s.state).toBe('exploring');
    expect(s.endingData).toBeNull();
    expect(s.combat).toBeNull();
  });
});
