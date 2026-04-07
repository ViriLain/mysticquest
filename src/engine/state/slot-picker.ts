import type { GameStore } from '../types';
import * as C from '../constants';
import { addLine, emitSound } from '../output';
import { loadManifest, renameSlot, saveToSlot } from '../save';

export interface SlotPickerDeps {
  startContinue: (slot: number) => void;
}

export function openSlotPicker(store: GameStore, mode: 'save' | 'load'): void {
  store.slotPickerMode = mode;
  store.slotPickerSelected = 0;
  store.slotManifest = loadManifest();
  store.renamingSlot = false;
  store.renameBuffer = '';
  store.state = 'slot_picker';
}

export function handleSlotPickerKey(s: GameStore, key: string, deps: SlotPickerDeps): void {
  if (!s.slotManifest) return;

  if (s.renamingSlot) {
    if (key === 'Enter') {
      const slot = s.slotPickerSelected + 1;
      renameSlot(slot, s.renameBuffer);
      s.slotManifest = loadManifest();
      s.renamingSlot = false;
      s.renameBuffer = '';
    } else if (key === 'Escape') {
      s.renamingSlot = false;
      s.renameBuffer = '';
    } else if (key === 'Backspace') {
      s.renameBuffer = s.renameBuffer.slice(0, -1);
    }
    return;
  }

  if (key === 'ArrowUp') {
    s.slotPickerSelected--;
    if (s.slotPickerSelected < 0) s.slotPickerSelected = s.slotManifest.slots.length - 1;
    emitSound(s, 'menuMove');
  } else if (key === 'ArrowDown') {
    s.slotPickerSelected++;
    if (s.slotPickerSelected >= s.slotManifest.slots.length) s.slotPickerSelected = 0;
    emitSound(s, 'menuMove');
  } else if (key === 'Enter') {
    const slot = s.slotPickerSelected + 1;
    if (s.slotPickerMode === 'save') {
      if (s.player && s.world && saveToSlot(slot, s.player, s.world, s.dungeon, s.shopState.runtime)) {
        s.activeSlot = slot;
        emitSound(s, 'save');
        s.state = 'exploring';
        s.slotPickerMode = null;
        addLine(s, 'Game saved.', C.ITEM_COLOR);
      }
    } else if (s.slotPickerMode === 'load') {
      const meta = s.slotManifest.slots[s.slotPickerSelected];
      if (meta.isEmpty) {
        addLine(s, 'That slot is empty.', C.ERROR_COLOR);
        return;
      }
      s.slotPickerMode = null;
      deps.startContinue(slot);
    }
  } else if (key === 'r' || key === 'R') {
    s.renamingSlot = true;
    s.renameBuffer = s.slotManifest.slots[s.slotPickerSelected].name;
  } else if (key === 'Escape') {
    s.state = s.player ? 'exploring' : 'menu';
    s.slotPickerMode = null;
  }
}
