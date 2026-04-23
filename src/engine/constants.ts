import type { RGBA } from './types';

export const ROOM_NAME_COLOR: RGBA = [1.0, 1.0, 0.4, 1.0];
export const EXITS_COLOR: RGBA = [0.5, 0.8, 1.0, 1.0];
export const ERROR_COLOR: RGBA = [1.0, 0.4, 0.4, 1.0];
export const HELP_COLOR: RGBA = [0.7, 0.7, 0.7, 1.0];
export const ITEM_COLOR: RGBA = [0.4, 1.0, 0.4, 1.0];
export const MAGIC_COLOR: RGBA = [0.8, 0.45, 1.0, 1.0];
export const COMBAT_COLOR: RGBA = [1.0, 0.6, 0.2, 1.0];
export const LOOT_COLOR: RGBA = [1.0, 0.8, 0.2, 1.0];
export const STAT_COLOR: RGBA = [0.6, 0.8, 1.0, 1.0];
export const ENEMY_COLOR: RGBA = [1.0, 0.3, 0.3, 1.0];
export const MENU_COLOR: RGBA = [0.2, 1.0, 0.2, 1.0];
export const MENU_SELECTED_COLOR: RGBA = [0.4, 1.0, 0.4, 1.0];
export const MENU_DISABLED_COLOR: RGBA = [0.3, 0.3, 0.3, 1.0];
export const CHOICE_COLOR: RGBA = [1.0, 0.85, 0.2, 1.0];
export const DEV_NOTE_COLOR: RGBA = [0.6, 0.5, 0.2, 0.8];
export const ASCII_COLOR: RGBA = [1.0, 1.0, 1.0, 0.9];
export const BASE_COLOR: RGBA = [0.2, 1.0, 0.2, 1.0];
export const SEPARATOR_COLOR: RGBA = [0.3, 0.3, 0.3, 0.6];
export const INPUT_ECHO_COLOR: RGBA = [0.6, 0.6, 0.6, 1.0];
export const NPC_COLOR: RGBA = [0.6, 0.9, 1.0, 1.0];

export const SEPARATOR = '----------------------------------------';

export const MENU_OPTIONS = ['NEW GAME', 'CONTINUE', 'DUNGEON MODE', 'SETTINGS', 'QUIT'] as const;

export const BOOT_LINES = [
  'LOADING PROJECT...',
  'MYSTICQUEST.EXE',
  'LAST MODIFIED: 05/14/2009',
  'WARNING: FILE INTEGRITY CHECK FAILED',
  'LOADING ANYWAY...',
];

export const BOSS_ASCII: Record<string, string> = {
  cellar_shade: 'boss_cellar_shade',
  mountain_troll: 'boss_mountain_troll',
  oblivion_guardian: 'boss_oblivion_guardian',
  evil_king: 'boss_evil_king',
  ruins_guardian: 'boss_ruins_guardian',
  milo: 'boss_milo',
};

export function rgbaToCSS(color: RGBA): string {
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${color[3]})`;
}
