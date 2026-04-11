import weaponsJson from '../data/weapons.json';
import { getAsciiLines } from './asciiArt';
import * as C from './constants';
import { clearRegionTint, setRegionTint, updateRainbowTint } from './effects';
import type { GameStore, RGBA, WeaponDef } from './types';

const weaponData = weaponsJson as Record<string, WeaponDef>;

export function addLine(store: GameStore, text: string, color?: RGBA): void {
  store.typewriterQueue.push({ text, color: color || store.baseColor });
}

export function addLineInstant(store: GameStore, text: string, color?: RGBA): void {
  store.lines.push({ text, color: color || store.baseColor });
}

export function emitSound(store: GameStore, name: string): void {
  store.soundQueue.push(name);
}

export function clearTerminal(store: GameStore): void {
  store.lines = [];
  store.typewriterQueue = [];
  store.typewriterPos = 0;
}

export function displayAscii(store: GameStore, name: string, color?: RGBA): void {
  const lines = getAsciiLines(name);
  if (!lines) return;
  const c = color || C.ASCII_COLOR;
  for (const line of lines) {
    addLine(store, line, c);
  }
}

export function updateHeader(store: GameStore): void {
  if (!store.player) return;
  store.header.title = (store.gameMode === 'dungeon' && store.dungeon)
    ? `DUNGEON F${store.dungeon.floor}`
    : 'MYSTICQUEST v1.0';
  store.header.hp = store.player.hp;
  store.header.maxHp = store.player.maxHp;
  store.header.level = store.player.level;
  store.header.gold = store.player.gold;
  const wid = store.player.equippedWeapon;
  const wdef = wid ? (weaponData[wid] ?? store.dungeon?.floorWeapons[wid]) : null;
  store.header.weapon = wdef ? wdef.name : 'Fists';
}

export function hideHeader(store: GameStore): void {
  store.header = { title: '', hp: 0, maxHp: 0, level: 0, gold: 0, weapon: '' };
}

export function applyRegionTint(store: GameStore, region?: string): void {
  store.currentRegion = region || null;
  if (region === 'manor') setRegionTint(store.effects, 0, 0.15, 0, 0.05);
  else if (region === 'wilds') clearRegionTint(store.effects);
  else if (region === 'darkness') setRegionTint(store.effects, 0.2, 0, 0, 0.1);
  else if (region === 'wastes') setRegionTint(store.effects, 0.15, 0.1, 0, 0.05);
  else if (region === 'hidden') updateRainbowTint(store.effects);
  else clearRegionTint(store.effects);
}
