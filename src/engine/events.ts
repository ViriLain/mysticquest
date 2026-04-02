import type { PlayerState, EffectsState } from './types';
import { pushEffect } from './effects';
import { hasKeyItem, hasItem } from './player';

export interface EventResult {
  success: boolean;
  message?: string;
}

export function fireEvent(
  eventString: string,
  player: PlayerState,
  effects: EffectsState,
): EventResult {
  const match = eventString.match(/^(\w+):?(.*)/);
  if (!match) return { success: true };

  const [, eventType, param] = match;

  if (eventType === 'flicker_lights') {
    pushEffect(effects, 'flash', 0.5, { r: 0.2, g: 1, b: 0.2 });
    pushEffect(effects, 'glitch', 0.3, { intensity: 0.3 });
    return { success: true };
  }
  if (eventType === 'screen_glitch') {
    pushEffect(effects, 'glitch', 1.0, { intensity: 0.7 });
    return { success: true };
  }
  if (eventType === 'fade_to_black') {
    pushEffect(effects, 'flash', 1.5, { r: 0, g: 0, b: 0 });
    return { success: true };
  }
  if (eventType === 'dialogue') {
    return { success: true };
  }
  if (eventType === 'require') {
    if (!hasKeyItem(player, param) && !hasItem(player, param)) {
      return { success: false, message: 'You need something to get through here...' };
    }
    return { success: true };
  }
  if (eventType === 'boss') {
    return { success: true, message: `boss:${param}` };
  }
  return { success: true };
}
