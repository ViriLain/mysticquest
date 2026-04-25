import { MENU_COLOR, MENU_SELECTED_COLOR } from '../engine/constants';
import type { GameStore, RGBA } from '../engine/types';

export interface SlotPickerOverlayProps {
  store: GameStore;
  colorCSS: (c: RGBA) => string;
}

/**
 * Save/Load slot selector overlay. Shown while state === 'slot_picker'.
 * Each slot row surfaces level / gold / room / region / timestamp so players
 * can identify slots at a glance before committing.
 */
export default function SlotPickerOverlay({ store, colorCSS }: SlotPickerOverlayProps) {
  if (!store.slotManifest) return null;

  return (
    <div className="menu-overlay slot-picker-overlay">
      <div className="menu-title slot-picker-title">
        <span style={{ color: colorCSS(MENU_COLOR) }}>
          {store.slotPickerMode === 'save' ? 'SAVE GAME' : 'LOAD GAME'}
        </span>
      </div>
      <div className="slot-picker-panel">
        {store.slotManifest.slots.map((slot, i) => {
          const isSelected = i === store.slotPickerSelected;
          const color: RGBA = isSelected ? MENU_SELECTED_COLOR : [0.5, 0.8, 0.5, 0.8];
          const prefix = isSelected ? '> ' : '  ';

          let info: string;
          if (slot.isEmpty) {
            info = '(empty)';
          } else {
            const date = new Date(slot.timestamp).toLocaleDateString();
            const time = new Date(slot.timestamp).toLocaleTimeString();
            const where = slot.region ? `${slot.roomName} (${slot.region})` : slot.roomName;
            const gold = slot.gold !== undefined ? ` - ${slot.gold}g` : '';
            info = `LVL ${slot.level}${gold} - ${where} - ${date} ${time}`;
          }

          const displayName = store.renamingSlot && isSelected
            ? store.renameBuffer + '_'
            : slot.name;

          return (
            <div key={i} className={`menu-option slot-picker-option${isSelected ? ' is-selected' : ''}`} style={{ color: colorCSS(color) }}>
              <div>{prefix}{displayName}</div>
              <div className="slot-picker-meta">{'   '}{info}</div>
            </div>
          );
        })}
        <div className="slot-picker-help" style={{ color: colorCSS([0.5, 0.5, 0.5, 0.8]) }}>
          {'  '}Enter: Select{'  '}R: Rename{'  '}Esc: Back
        </div>
      </div>
    </div>
  );
}
