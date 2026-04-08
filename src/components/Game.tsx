import { useEffect, useRef, useCallback, useState } from 'react';
import { createInitialStore, gameReducer } from '../engine/gameReducer';
import { updateEffects } from '../engine/effects';
import { captureVisualSnapshot, didVisualSnapshotChange, shouldRunReducerTick } from '../engine/frame-loop';
import { rgbaToCSS, MENU_COLOR, MENU_SELECTED_COLOR, MENU_DISABLED_COLOR, MENU_OPTIONS } from '../engine/constants';
import { anySlotHasData } from '../engine/save';
import {
  initAudio, startAmbient, setRegionAmbient, sfxTypewriter, sfxSubmit, sfxPickup, sfxEquip,
  sfxError, sfxPlayerHit, sfxEnemyHit, sfxCritical, sfxDeath, sfxVictory,
  sfxLevelUp, sfxSave, sfxMenuMove, sfxMenuSelect, sfxBossAppear,
  sfxFleeSuccess, sfxFleeFail, sfxAchievement,
} from '../engine/audio';
import type { GameStore, RGBA } from '../engine/types';
import { loadSettings, fontSizePx, remapColor, typewriterDelay, fontSizeLabel, colorModeLabel, textSpeedLabel } from '../engine/settings';
import Minimap from './Minimap';
import '../styles/crt.css';
import '../styles/terminal.css';

const SFX_MAP: Record<string, () => void> = {
  pickup: sfxPickup,
  equip: sfxEquip,
  error: sfxError,
  playerHit: sfxPlayerHit,
  enemyHit: sfxEnemyHit,
  critical: sfxCritical,
  death: sfxDeath,
  victory: sfxVictory,
  levelUp: sfxLevelUp,
  save: sfxSave,
  menuMove: sfxMenuMove,
  menuSelect: sfxMenuSelect,
  bossAppear: sfxBossAppear,
  fleeSuccess: sfxFleeSuccess,
  fleeFail: sfxFleeFail,
  submit: sfxSubmit,
  achievement: sfxAchievement,
};

export default function Game() {
  // Use a ref for the mutable game store, and a counter to trigger re-renders
  const storeRef = useRef<GameStore>(createInitialStore());
  const [, setRenderTick] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const cursorVisibleRef = useRef(true);
  const twCharIndex = useRef(0);
  const twTimerRef = useRef(0);
  const lineEffectsRef = useRef<Array<{ offsetX: number; skip: boolean }>>([]);
  const prevRegionRef = useRef<string | null>(null);

  const forceRender = useCallback(() => setRenderTick(t => t + 1), []);

  // Game loop
  useEffect(() => {
    let curTimer = 0;
    let curVisible = true;

    const loop = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = time;

      const store = storeRef.current;
      const frameSettings = loadSettings();
      const beforeVisual = captureVisualSnapshot(store);
      let shouldRender = false;

      if (store.effects.active.length > 0) {
        updateEffects(store.effects, dt);
      }

      // Typewriter advancement
      if (store.typewriterQueue.length > 0) {
        twTimerRef.current += dt;
        let advanced = false;
        const twDelay = typewriterDelay(frameSettings.textSpeed);
        const effectiveDelay = twDelay || 0.001; // instant mode: flush all at once
        while (twTimerRef.current >= effectiveDelay && store.typewriterQueue.length > 0) {
          twTimerRef.current -= effectiveDelay;
          twCharIndex.current++;
          advanced = true;
          const current = store.typewriterQueue[0];
          if (twCharIndex.current >= current.text.length) {
            store.lines.push(current);
            store.typewriterQueue.shift();
            twCharIndex.current = 0;
          }
        }
        // Typewriter click (throttled — only on some chars to avoid spam)
        if (advanced) {
          shouldRender = true;
          if (Math.random() < 0.3 && frameSettings.typewriterSound && frameSettings.sfxEnabled) sfxTypewriter();
        }
      }

      // Cursor blink
      curTimer += dt;
      if (curTimer >= 0.5) {
        curVisible = !curVisible;
        cursorVisibleRef.current = curVisible;
        curTimer = 0;
        shouldRender = true;
      }

      let updated = store;
      if (shouldRunReducerTick(store)) {
        updated = gameReducer(store, { type: 'TICK', dt });
        storeRef.current = updated;
      }

      // Pre-compute per-line glitch/jitter offsets (avoids Math.random in render)
      const fx = updated.effects;
      if (fx.glitch > 0 || fx.jitter > 0) {
        shouldRender = true;
        lineEffectsRef.current = updated.lines.map(() => {
          let offsetX = 0;
          let skip = false;
          if (fx.glitch > 0) {
            if (Math.random() < fx.glitch * 0.3) { skip = true; }
            else if (Math.random() < fx.glitch * 0.15) {
              offsetX = (Math.random() - 0.5) * fx.glitch * 40;
            }
          }
          if (fx.jitter > 0) {
            offsetX += (Math.random() - 0.5) * fx.jitter * 6;
          }
          return { offsetX, skip };
        });
      } else if (lineEffectsRef.current.length > 0) {
        lineEffectsRef.current = [];
      }

      // Drain sound queue (respecting SFX setting)
      if (updated.soundQueue.length > 0) {
        const sfxOn = frameSettings.sfxEnabled;
        for (const name of updated.soundQueue) {
          if (sfxOn) {
            const fn = SFX_MAP[name];
            if (fn) fn();
          }
        }
        updated.soundQueue = [];
      }

      // Update region ambient music
      const targetRegion = updated.currentRegion || (updated.state === 'menu' || updated.state === 'boot' ? 'menu' : null);
      if (targetRegion !== prevRegionRef.current) {
        prevRegionRef.current = targetRegion;
        setRegionAmbient(frameSettings.ambientEnabled ? targetRegion : null);
      }

      if (didVisualSnapshotChange(beforeVisual, captureVisualSnapshot(updated))) {
        shouldRender = true;
      }

      if (shouldRender) {
        forceRender();
      }
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [forceRender]);

  const store = storeRef.current;
  const userScrolledUp = useRef(false);

  // Track whether the user has scrolled up manually
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      userScrolledUp.current = !nearBottom;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-scroll every render if user hasn't scrolled up
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    if (!userScrolledUp.current) {
      el.scrollTop = el.scrollHeight;
    }
  });

  // Keep input focused + init audio on first interaction
  const audioInitRef = useRef(false);
  const focusInput = useCallback(() => {
    inputRef.current?.focus();
    if (!audioInitRef.current) {
      audioInitRef.current = true;
      initAudio();
      startAmbient();
    }
  }, []);

  useEffect(() => {
    focusInput();
    window.addEventListener('focus', focusInput);
    return () => window.removeEventListener('focus', focusInput);
  }, [focusInput]);

  // Quit side effects: dev-only server shutdown, then best-effort window close.
  //
  // Order matters. `window.close()` is synchronous — if the browser honors it
  // (often the case in Chrome when the tab has a script context), the
  // document tears down immediately and any pending `fetch()` gets cancelled.
  // `navigator.sendBeacon()` is designed for exactly this "fire during
  // unload" case: the browser queues the POST before the document dies, so
  // it reaches the dev server even if the tab closes on the next tick.
  // The dev shutdown is a no-op in production (the endpoint doesn't exist).
  useEffect(() => {
    if (store.state !== 'quit') return;
    if (import.meta.env.DEV) {
      try { navigator.sendBeacon('/__shutdown'); } catch { /* ignore */ }
    }
    try { window.close(); } catch { /* ignore */ }
  }, [store.state]);

  // Key handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = storeRef.current;
      storeRef.current = gameReducer(s, { type: 'KEY_PRESSED', key: 'Tab' });
      forceRender();
      return;
    }

    const s = storeRef.current;
    const isSpecialKey = ['ArrowUp', 'ArrowDown', 'Enter', 'Backspace', 'Escape'].includes(e.key);
    const isNonTextState = s.state === 'boot' || s.state === 'menu' || s.state === 'ending' || s.state === 'slot_picker' || s.state === 'minimap' || s.state === 'settings' || s.state === 'quit';

    if (isSpecialKey || isNonTextState) {
      e.preventDefault();
      storeRef.current = gameReducer(s, { type: 'KEY_PRESSED', key: e.key });
      forceRender();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      storeRef.current = gameReducer(s, { type: 'TEXT_INPUT', text: e.key });
      forceRender();
    }
  }, [forceRender]);

  // Settings-aware rendering
  const settings = loadSettings();
  const fontSize = fontSizePx(settings.fontSize);
  const colorMode = settings.colorMode;
  const colorCSS = (c: RGBA) => rgbaToCSS(remapColor(c, colorMode));

  const headerColor = colorCSS(store.baseColor);
  const dimColor = colorCSS([
    store.baseColor[0] * 0.5,
    store.baseColor[1] * 0.5,
    store.baseColor[2] * 0.5,
    1,
  ]);

  const terminalStyle = {
    fontSize: `${fontSize}px`,
    lineHeight: '1.25',
  };

  const hasSave = store.state === 'menu' ? anySlotHasData() : true;

  return (
    <div className="crt-container" onClick={focusInput}>
      {/* Tint overlay */}
      {store.effects.tint.a > 0 && (
        <div
          className="crt-overlay"
          style={{
            backgroundColor: `rgba(${store.effects.tint.r * 255}, ${store.effects.tint.g * 255}, ${store.effects.tint.b * 255}, ${store.effects.tint.a})`,
          }}
        />
      )}
      {/* Flash overlay */}
      {store.effects.flash.a > 0 && (
        <div
          className="crt-overlay"
          style={{
            backgroundColor: `rgba(${store.effects.flash.r * 255}, ${store.effects.flash.g * 255}, ${store.effects.flash.b * 255}, ${store.effects.flash.a})`,
          }}
        />
      )}

      {/* Minimap overlay */}
      {store.state === 'minimap' && store.world && store.player && (
        <Minimap
          world={store.world}
          player={store.player}
          pan={store.minimapPan}
          onPanChange={(p) => { storeRef.current.minimapPan = p; }}
        />
      )}

      <div
        className="terminal"
        style={{ transform: `translate(${store.effects.shake.x}px, ${store.effects.shake.y}px)`, ...terminalStyle }}
      >
        <input
          ref={inputRef}
          className="terminal-input-hidden"
          onKeyDown={handleKeyDown}
          autoFocus
        />

        {/* Header */}
        {store.header.title && store.header.maxHp > 0 && (
          <>
            <div className="terminal-header" style={{ color: headerColor }}>
              {`${store.header.title}    HP:${store.header.hp}/${store.header.maxHp}  LVL:${store.header.level}  G:${store.header.gold}  ${store.header.weapon}`}
            </div>
            <div className="terminal-separator" style={{ backgroundColor: dimColor }} />
          </>
        )}

        {/* Content area */}
        <div className="terminal-content" ref={contentRef}>
          {store.lines.map((line, i) => {
            const fx = lineEffectsRef.current[i];
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
                {line.text || '\u00A0'}
              </div>
            );
          })}

          {/* Typewriter current line */}
          {store.typewriterQueue.length > 0 && (
            <div
              className="terminal-line"
              style={{ color: colorCSS(store.typewriterQueue[0].color) }}
            >
              {store.typewriterQueue[0].text.slice(0, twCharIndex.current) || '\u00A0'}
            </div>
          )}
        </div>

        {/* Input area (hidden during boot/menu/ending/slot_picker/minimap/settings/quit) */}
        {store.state !== 'boot' && store.state !== 'menu' && store.state !== 'ending' && store.state !== 'slot_picker' && store.state !== 'minimap' && store.state !== 'settings' && store.state !== 'quit' && (
          <>
            <div className="terminal-input-separator" style={{ backgroundColor: dimColor }} />
            <div className="terminal-input-area" style={{ color: headerColor }}>
              {'> ' + store.input + (cursorVisibleRef.current ? '_' : ' ')}
            </div>
          </>
        )}

        {/* Menu overlay */}
        {store.state === 'menu' && (
          <div className="menu-overlay">
            <div className="menu-title">
              <span style={{ color: colorCSS(MENU_COLOR) }}>MYSTICQUEST</span>
              <span style={{ color: 'rgba(128, 204, 128, 0.6)' }}>{' '}v1.0</span>
            </div>
            {MENU_OPTIONS.map((option, i) => {
              const isContinue = option === 'CONTINUE';
              const isSelected = i === store.menuSelected;
              let color: RGBA;
              if (isContinue && !hasSave) {
                color = MENU_DISABLED_COLOR;
              } else if (isSelected) {
                color = MENU_SELECTED_COLOR;
              } else {
                color = [0.5, 0.8, 0.5, 0.8];
              }

              return (
                <div
                  key={option}
                  className="menu-option"
                  style={{ color: colorCSS(color) }}
                >
                  {isSelected ? '> ' : '  '}{option}
                </div>
              );
            })}
          </div>
        )}

        {/* Slot Picker overlay */}
        {store.state === 'slot_picker' && store.slotManifest && (
          <div className="menu-overlay slot-picker-overlay">
            <div className="menu-title slot-picker-title">
              <span style={{ color: colorCSS(MENU_COLOR) }}>
                {store.slotPickerMode === 'save' ? 'SAVE GAME' : 'LOAD GAME'}
              </span>
            </div>
            <div className="slot-picker-panel">
            {store.slotManifest.slots.map((slot, i) => {
              const isSelected = i === store.slotPickerSelected;
              const color = isSelected ? MENU_SELECTED_COLOR : [0.5, 0.8, 0.5, 0.8] as RGBA;
              const prefix = isSelected ? '> ' : '  ';

              let info: string;
              if (slot.isEmpty) {
                info = '(empty)';
              } else {
                const date = new Date(slot.timestamp).toLocaleDateString();
                const time = new Date(slot.timestamp).toLocaleTimeString();
                info = `LVL ${slot.level} - ${slot.roomName} - ${date} ${time}`;
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
            <div className="slot-picker-help" style={{ color: colorCSS([0.5, 0.5, 0.5, 0.8] as RGBA) }}>
              {'  '}Enter: Select{'  '}R: Rename{'  '}Esc: Back
            </div>
            </div>
          </div>
        )}

        {/* Settings overlay */}
        {store.state === 'settings' && (() => {
          const s = loadSettings();
          const rows = [
            { label: 'Font Size', value: fontSizeLabel(s.fontSize) },
            { label: 'Color Mode', value: colorModeLabel(s.colorMode) },
            { label: 'Text Speed', value: textSpeedLabel(s.textSpeed) },
            { label: 'Master Volume', value: `${s.masterVolume}%` },
            { label: 'Sound Effects', value: s.sfxEnabled ? 'ON' : 'OFF' },
            { label: 'Ambient Music', value: s.ambientEnabled ? 'ON' : 'OFF' },
            { label: 'Typewriter Clicks', value: s.typewriterSound ? 'ON' : 'OFF' },
          ];
          return (
            <div className="menu-overlay">
              <div className="menu-title">
                <span style={{ color: colorCSS(MENU_COLOR) }}>SETTINGS</span>
              </div>
              {rows.map((row, i) => {
                const isSelected = i === store.settingsSelected;
                const c: RGBA = isSelected ? MENU_SELECTED_COLOR : [0.5, 0.8, 0.5, 0.8];
                const prefix = isSelected ? '> ' : '  ';
                return (
                  <div key={i} className="menu-option" style={{ color: colorCSS(c) }}>
                    {prefix}{row.label.padEnd(20)}{`< ${row.value} >`}
                  </div>
                );
              })}
              <div style={{ marginTop: '2em', color: colorCSS([0.5, 0.5, 0.5, 0.8] as RGBA) }}>
                {'  '}Left/Right: Change{'  '}Esc: Back
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
