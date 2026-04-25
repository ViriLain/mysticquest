import { describe, expect, it } from 'vitest';
import { gameReducer, createInitialStore } from '../../src/engine/gameReducer';
import { MAX_COMMAND_INPUT_LENGTH, MAX_SLOT_NAME_LENGTH, parseCommand } from '../../src/engine/commands';

describe('command input hardening', () => {
  it('caps typed command input before parsing/history/autocomplete', () => {
    let store = createInitialStore();
    store.state = 'exploring';

    store = gameReducer(store, { type: 'TEXT_INPUT', text: 'x'.repeat(MAX_COMMAND_INPUT_LENGTH + 100) });

    expect(store.input).toHaveLength(MAX_COMMAND_INPUT_LENGTH);
  });

  it('caps slot rename input before persisting it to the manifest', () => {
    let store = createInitialStore();
    store.state = 'slot_picker';
    store.renamingSlot = true;

    store = gameReducer(store, { type: 'TEXT_INPUT', text: 'slot'.repeat(100) });

    expect(store.renameBuffer).toHaveLength(MAX_SLOT_NAME_LENGTH);
  });

  it('keeps short fuzzy verb matching but does not normalize oversized unknown verbs', () => {
    expect(parseCommand('loook')).toEqual(['look', '']);

    const oversizedVerb = `${'l'.repeat(64)}ook`;
    expect(parseCommand(oversizedVerb)).toEqual([oversizedVerb, '']);
  });
});
