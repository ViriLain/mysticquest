// Not memoized: combat.playerEffects is mutated in place during combat (the
// array reference is stable even when contents change), so shallow prop
// equality would skip legitimate re-renders. The component is small and only
// renders during combat anyway.
import type { CombatState, RGBA, StatusEffectType } from '../engine/types';

export interface CombatStatusBarProps {
  combat: CombatState | null;
  enemyName: string | null;
  colorCSS: (c: RGBA) => string;
}

const EFFECT_COLOR: Record<StatusEffectType, RGBA> = {
  poison: [0.6, 1, 0.4, 1],   // green
  burn:   [1, 0.5, 0.2, 1],    // orange
  bleed:  [1, 0.3, 0.4, 1],    // red
  stun:   [1, 1, 0.4, 1],      // yellow
};

const EFFECT_LABEL: Record<StatusEffectType, string> = {
  poison: 'POISON',
  burn:   'BURN',
  bleed:  'BLEED',
  stun:   'STUN',
};

/**
 * Persistent HUD line during combat showing active status effects on player
 * and enemy. Returns null when not in combat or when both sides are clean.
 *
 * Status effects already announce their per-round damage in the scroll log;
 * this bar gives at-a-glance "who has what for how long" information that
 * doesn't get pushed off-screen by combat chatter.
 */
export default function CombatStatusBar({ combat, enemyName, colorCSS }: CombatStatusBarProps) {
  if (!combat) return null;
  const playerEffects = combat.playerEffects;
  const enemyEffects = combat.enemyEffects;
  if (playerEffects.length === 0 && enemyEffects.length === 0) return null;

  return (
    <div className="combat-status-bar">
      {playerEffects.length > 0 && (
        <span>
          You:{' '}
          {playerEffects.map((effect, i) => (
            <span key={`p${i}`} style={{ color: colorCSS(EFFECT_COLOR[effect.type]), marginRight: '0.5em' }}>
              [{EFFECT_LABEL[effect.type]} {effect.remaining}r]
            </span>
          ))}
        </span>
      )}
      {playerEffects.length > 0 && enemyEffects.length > 0 && (
        <span style={{ marginRight: '1em' }}>{' '}</span>
      )}
      {enemyEffects.length > 0 && (
        <span>
          {enemyName ?? 'Enemy'}:{' '}
          {enemyEffects.map((effect, i) => (
            <span key={`e${i}`} style={{ color: colorCSS(EFFECT_COLOR[effect.type]), marginRight: '0.5em' }}>
              [{EFFECT_LABEL[effect.type]} {effect.remaining}r]
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
