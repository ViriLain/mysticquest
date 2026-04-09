import type { PlayerState, ItemDef } from './types';

export function createPlayer(startRoom = 'manor_entry'): PlayerState {
  return {
    hp: 30,
    maxHp: 30,
    attack: 5,
    defense: 2,
    level: 1,
    xp: 0,
    gold: 0,
    currentRoom: startRoom,
    inventory: {},
    weapons: [],
    equippedWeapon: null,
    equippedShield: null,
    keyItems: {},
    visitedRooms: {},
    searchedRooms: {},
    firedEvents: {},
    usedItemsInRoom: {}, // roomId -> { itemId -> true }
    defending: false,
    buffAttack: 0,
    buffRounds: 0,
    routeHistory: [],
    journalEntries: [],
    objectives: {},
    skillPoints: 0,
    skills: {},
  };
}

export function hasSkill(p: PlayerState, id: string): boolean {
  return p.skills[id] === true;
}

export function totalAttack(p: PlayerState): number {
  return p.attack + p.buffAttack;
}

export function totalDefense(p: PlayerState, itemData: Record<string, ItemDef>): number {
  let def = p.defense;
  if (p.equippedShield && itemData[p.equippedShield]) {
    const shield = itemData[p.equippedShield];
    if (shield.value) def += shield.value;
  }
  return def;
}

export function xpToNextLevel(p: PlayerState): number {
  return p.level * 25;
}

export function addXp(p: PlayerState, amount: number): boolean {
  if (p.skills['enlightened']) amount = Math.floor(amount * 1.5);
  p.xp += amount;
  let leveled = false;
  while (p.level < 15 && p.xp >= xpToNextLevel(p)) {
    p.xp -= xpToNextLevel(p);
    p.level++;
    p.maxHp += 8;
    p.hp += 8;
    p.attack += 2;
    p.defense += 1;
    leveled = true;
    p.skillPoints++;
  }
  return leveled;
}

export function addItem(p: PlayerState, itemId: string, itemData: Record<string, ItemDef>): void {
  const item = itemData[itemId];
  if (item && item.type === 'key') {
    p.keyItems[itemId] = true;
    return;
  }
  p.inventory[itemId] = (p.inventory[itemId] || 0) + 1;
}

export function removeItem(p: PlayerState, itemId: string): void {
  if (p.inventory[itemId]) {
    p.inventory[itemId]--;
    if (p.inventory[itemId] <= 0) {
      delete p.inventory[itemId];
    }
  }
}

export function hasItem(p: PlayerState, itemId: string): boolean {
  return (p.inventory[itemId] || 0) > 0;
}

export function hasKeyItem(p: PlayerState, itemId: string): boolean {
  return p.keyItems[itemId] === true;
}

export function addWeapon(p: PlayerState, weaponId: string): void {
  if (!p.weapons.includes(weaponId)) {
    p.weapons.push(weaponId);
  }
}

export function equipWeapon(p: PlayerState, weaponId: string): boolean {
  if (p.weapons.includes(weaponId)) {
    p.equippedWeapon = weaponId;
    return true;
  }
  return false;
}

export function visitRoom(p: PlayerState, roomId: string): void {
  p.visitedRooms[roomId] = true;
}

export function visitedCount(p: PlayerState): number {
  return Object.keys(p.visitedRooms).length;
}

export function heal(p: PlayerState, amount: number): void {
  p.hp = Math.min(p.hp + amount, p.maxHp);
}

export function takeDamage(p: PlayerState, amount: number): number {
  let actual = amount;
  if (p.defending) {
    actual = Math.max(1, Math.floor(amount / 2));
    p.defending = false;
  }
  p.hp -= actual;
  return actual;
}

export function isDead(p: PlayerState): boolean {
  return p.hp <= 0;
}
