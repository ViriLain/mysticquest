import type { GameStateKind } from '../engine/types';

export interface TerminalInputProps {
  state: GameStateKind;
  input: string;
  cursorVisible: boolean;
  headerColor: string;
  dimColor: string;
}

const STATES_WITHOUT_INPUT: ReadonlySet<GameStateKind> = new Set([
  'boot', 'menu', 'ending', 'slot_picker', 'minimap',
  'settings', 'skill_tree', 'quit',
]);

/**
 * The "> input_" prompt at the bottom of the terminal. Hidden during
 * non-text-input states (boot/menu/ending/slot_picker/minimap/settings/
 * skill_tree/quit).
 */
export default function TerminalInput({
  state, input, cursorVisible, headerColor, dimColor,
}: TerminalInputProps) {
  if (STATES_WITHOUT_INPUT.has(state)) return null;

  return (
    <>
      <div className="terminal-input-separator" style={{ backgroundColor: dimColor }} />
      <div className="terminal-input-area" style={{ color: headerColor }}>
        {'> ' + input + (cursorVisible ? '_' : ' ')}
      </div>
    </>
  );
}
