import { forwardRef, memo } from 'react';
import { CHOICE_COLOR, HELP_COLOR, MENU_SELECTED_COLOR } from '../engine/constants';
import type { GameStore, RGBA } from '../engine/types';

const NBSP = ' ';

export interface TerminalLinesProps {
  store: GameStore;
  /** Per-line glitch/jitter offsets, computed once per frame in the parent. */
  lineEffects: Array<{ offsetX: number; skip: boolean }>;
  /** Current typewriter character index (so the in-progress line renders the
   *  partial text). */
  twCharIndex: number;
  colorCSS: (c: RGBA) => string;
}

/**
 * Renders the scrolling terminal log: committed lines, the in-progress
 * typewriter line, and any state-specific overlays that flow with the log
 * (dialogue choices, shop buy/sell menu).
 *
 * `role="log"` + `aria-live="polite"` lets screen readers announce new lines
 * without interrupting the user. The container ref is forwarded so the parent
 * can read scroll position for auto-scroll behavior.
 */
const TerminalLines = forwardRef<HTMLDivElement, TerminalLinesProps>(
  function TerminalLines({ store, lineEffects, twCharIndex, colorCSS }, ref) {
    return (
      <div
        className="terminal-content"
        ref={ref}
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions"
      >
        {store.lines.map((line, i) => {
          const fx = lineEffects[i];
          if (fx?.skip) {
            return <div key={i} className="terminal-line" style={{ height: '1.25em' }} />;
          }
          return (
            <div
              key={i}
              className="terminal-line"
              style={{
                color: colorCSS(line.color),
                transform: fx?.offsetX ? `translateX(${fx.offsetX}px)` : undefined,
              }}
            >
              {line.text || NBSP}
            </div>
          );
        })}

        {/* Typewriter current line */}
        {store.typewriterQueue.length > 0 && (
          <div
            className="terminal-line"
            style={{ color: colorCSS(store.typewriterQueue[0].color) }}
          >
            {store.typewriterQueue[0].text.slice(0, twCharIndex) || NBSP}
          </div>
        )}

        {/* Dialogue selectable options */}
        {store.state === 'dialogue' && store.dialogueOptions.length > 0 && (
          <div>
            <div className="terminal-line">{NBSP}</div>
            {store.dialogueOptions.map((option, i) => (
              <div
                key={i}
                className="terminal-line"
                style={{ color: colorCSS(i === store.dialogueSelected ? MENU_SELECTED_COLOR : CHOICE_COLOR) }}
              >
                {i === store.dialogueSelected ? '> ' : '  '}{option}
              </div>
            ))}
          </div>
        )}

        {/* Shop buy/sell selectable menu */}
        {store.state === 'shop' && store.shopMenuMode && store.shopMenuItems.length > 0 && (
          <div>
            <div className="terminal-line" style={{ color: colorCSS(CHOICE_COLOR) }}>
              {store.shopMenuMode === 'buy' ? '-- SELECT ITEM TO BUY --' : '-- SELECT ITEM TO SELL --'}
            </div>
            {store.shopMenuItems.map((item, i) => (
              <div
                key={i}
                className="terminal-line"
                style={{ color: colorCSS(i === store.shopMenuSelected ? MENU_SELECTED_COLOR : HELP_COLOR) }}
              >
                {i === store.shopMenuSelected ? '> ' : '  '}{item.label}
              </div>
            ))}
            <div className="terminal-line" style={{ color: colorCSS(HELP_COLOR) }}>
              {'  '}Enter: Select{'  '}Esc: Back
            </div>
          </div>
        )}
      </div>
    );
  },
);

export default memo(TerminalLines);
