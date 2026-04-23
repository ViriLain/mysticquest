import type { GameStore, ItemDef, NpcDef, RoomDef, WeaponDef } from '../types';
import * as C from '../constants';
import { addLine, clearTerminal, emitSound } from '../output';
import { handleNpcDialogueInput } from '../handlers/talk';
import { addXp, heal as playerHeal } from '../player';
import { getLivingEnemies, getRoom } from '../world';

export interface DialogueDeps {
  itemData: Record<string, ItemDef>;
  weaponData: Record<string, WeaponDef>;
  npcData: Record<string, NpcDef>;
  refreshHeader: () => void;
  startCombat: (eid: string) => void;
  checkEndingsForChoice: (choice: string) => boolean;
  openSlotPicker: (mode: 'save') => void;
  loadDungeonFloor: (floor: number) => void;
  enterRoom: (roomId: string) => void;
  checkAchievement: (id: string) => void;
  openShop: (shopId: string) => void;
}

export function handleDialogueInput(store: GameStore, input: string, deps: DialogueDeps): void {
  if (!store.player || !store.world) return;

  if (store.gameMode === 'dungeon') {
    const room = getRoom(store.world, store.player.currentRoom);
    if (room?.specialType) {
      handleDungeonSpecialChoice(store, room, input, deps);
      return;
    }
  }

  if (store.gameMode === 'dungeon' && store.player.currentRoom.startsWith('dng_rest_')) {
    handleDungeonRestInput(store, input, deps);
    return;
  }

  if (store.npcDialogue) {
    handleNpcDialogueInput(store, input, deps.itemData, deps.weaponData, deps.npcData, deps.refreshHeader, deps.openShop);
    return;
  }

  const trimmed = input.trim().toLowerCase();
  let chosen: string | null = null;
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= store.dialogueOptions.length) {
    chosen = store.dialogueOptions[num - 1];
  } else {
    for (const option of store.dialogueOptions) {
      if (trimmed === option.toLowerCase()) {
        chosen = option;
        break;
      }
    }
  }

  if (!chosen) {
    addLine(store, `Choose an option: 1-${store.dialogueOptions.length}`, C.ERROR_COLOR);
    return;
  }

  const ended = deps.checkEndingsForChoice(chosen);
  if (!ended) {
    store.state = 'exploring';
    addLine(store, `You choose to ${chosen}.`, C.HELP_COLOR);
    if (chosen.toLowerCase() === 'attack') {
      const living = getLivingEnemies(store.world, store.player.currentRoom);
      if (living.length > 0) deps.startCombat(living[0]);
    }
  }
  store.dialogueEnding = null;
}

export function handleDungeonSpecialRoom(store: GameStore, room: RoomDef): void {
  if (!store.player || !store.dungeon) return;

  if (room.specialType === 'fountain' && !store.player.firedEvents[`used_fountain_${room.id}`]) {
    store.state = 'dialogue';
    store.dialogueOptions = ['Drink from the fountain', 'Leave it alone'];
    store.dialogueSelected = 0;
    addLine(store, '');
    addLine(store, 'The fountain beckons...', C.CHOICE_COLOR);
  } else if (room.specialType === 'altar' && !store.player.firedEvents[`used_altar_${room.id}`]) {
    store.state = 'dialogue';
    store.dialogueOptions = ['Embrace the darkness (+5 ATK, -3 DEF)', 'Resist (heal 10 HP)', 'Ignore'];
    store.dialogueSelected = 0;
    addLine(store, '');
    addLine(store, 'The altar pulses with dark energy...', C.CHOICE_COLOR);
  } else if (room.specialType === 'library' && !store.player.firedEvents[`used_library_${room.id}`]) {
    const perks = [
      { label: 'Tome of Strength (+2 ATK)' },
      { label: 'Tome of Resilience (+2 DEF)' },
      { label: 'Tome of Vitality (+10 max HP)' },
      { label: 'Tome of Healing (full HP)' },
      { label: 'Tome of Experience (+30 XP)' },
    ];
    const shuffled = perks.slice().sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, 2);

    store.state = 'dialogue';
    store.dialogueOptions = [chosen[0].label, chosen[1].label, 'Leave'];
    store.dialogueSelected = 0;
    addLine(store, '');
    addLine(store, 'Ancient tomes offer forbidden knowledge. Choose wisely...', C.CHOICE_COLOR);
  }
}

function handleDungeonSpecialChoice(store: GameStore, room: RoomDef, input: string, deps: DialogueDeps): void {
  if (!store.player || !store.dungeon) return;
  const choice = parseInt(input.trim(), 10);

  if (room.specialType === 'fountain') {
    store.player.firedEvents[`used_fountain_${room.id}`] = true;
    if (choice === 1) {
      if (Math.random() < 0.7) {
        const healAmt = Math.floor(store.player.maxHp * 0.3);
        const old = store.player.hp;
        playerHeal(store.player, healAmt);
        addLine(store, `The water restores you! +${store.player.hp - old} HP.`, C.ITEM_COLOR);
        emitSound(store, 'pickup');
      } else {
        const dmg = Math.floor(store.player.maxHp * 0.1);
        store.player.hp = Math.max(1, store.player.hp - dmg);
        addLine(store, `The water is poisoned! -${dmg} HP.`, C.ERROR_COLOR);
        emitSound(store, 'playerHit');
      }
    } else {
      addLine(store, 'You leave the fountain alone.', C.HELP_COLOR);
    }
    store.state = 'exploring';
    deps.refreshHeader();
  } else if (room.specialType === 'altar') {
    store.player.firedEvents[`used_altar_${room.id}`] = true;
    if (choice === 1) {
      store.player.buffAttack += 5;
      store.player.defense = Math.max(0, store.player.defense - 3);
      addLine(store, 'Dark power surges through you! +5 ATK, -3 DEF permanently.', C.COMBAT_COLOR);
      emitSound(store, 'equip');
    } else if (choice === 2) {
      playerHeal(store.player, 10);
      addLine(store, 'You resist the darkness and feel renewed. +10 HP.', C.ITEM_COLOR);
    } else {
      addLine(store, 'You step away from the altar.', C.HELP_COLOR);
    }
    store.state = 'exploring';
    deps.refreshHeader();
  } else if (room.specialType === 'library') {
    store.player.firedEvents[`used_library_${room.id}`] = true;
    const opt = store.dialogueOptions[choice - 1];
    if (opt && opt !== 'Leave') {
      if (!store.dungeon.dungeonPerks) store.dungeon.dungeonPerks = [];
      store.dungeon.dungeonPerks.push(opt);

      if (opt.includes('+2 ATK')) {
        store.player.attack += 2;
        addLine(store, 'You absorb the knowledge: +2 ATK!', C.CHOICE_COLOR);
      } else if (opt.includes('+2 DEF')) {
        store.player.defense += 2;
        addLine(store, 'You absorb the knowledge: +2 DEF!', C.CHOICE_COLOR);
      } else if (opt.includes('+10 max HP')) {
        store.player.maxHp += 10;
        store.player.hp += 10;
        addLine(store, 'You absorb the knowledge: +10 max HP!', C.CHOICE_COLOR);
      } else if (opt.includes('full HP')) {
        store.player.hp = store.player.maxHp;
        addLine(store, 'You absorb the knowledge: fully healed!', C.CHOICE_COLOR);
      } else if (opt.includes('+30 XP')) {
        addXp(store.player, 30);
        addLine(store, 'You absorb the knowledge: +30 XP!', C.CHOICE_COLOR);
      }
      emitSound(store, 'levelUp');
    } else {
      addLine(store, 'You leave the library undisturbed.', C.HELP_COLOR);
    }
    store.state = 'exploring';
    deps.refreshHeader();
  }
}

function handleDungeonRestInput(store: GameStore, input: string, deps: DialogueDeps): void {
  if (!store.player || !store.world || !store.dungeon) return;
  const trimmed = input.trim().toLowerCase();

  if (trimmed === '1' || trimmed === 'rest') {
    const healAmount = Math.floor(store.player.maxHp * 0.5);
    playerHeal(store.player, healAmount);
    deps.refreshHeader();
    addLine(store, `You rest and recover ${healAmount} HP.`, C.ITEM_COLOR);
    addLine(store, '');
    addLine(store, 'What would you like to do?', C.CHOICE_COLOR);
    store.dialogueOptions = ['Rest (heal 50% HP)', 'Save', 'Continue to next floor'];
    store.dialogueSelected = 0;
  } else if (trimmed === '2' || trimmed === 'save') {
    deps.openSlotPicker('save');
  } else if (trimmed === '3' || trimmed === 'continue' || trimmed === 'descend') {
    store.dungeon.floor++;
    store.dungeon.score.floorsCleared++;
    if (store.dungeon.floor >= 5) deps.checkAchievement('dungeon_crawler');
    if (store.dungeon.floor >= 20) deps.checkAchievement('dungeon_master');
    deps.loadDungeonFloor(store.dungeon.floor);
    clearTerminal(store);
    addLine(store, `--- Floor ${store.dungeon.floor} ---`, C.COMBAT_COLOR);
    addLine(store, '');
    store.state = 'exploring';
    deps.enterRoom(store.player.currentRoom);
    deps.refreshHeader();
  } else {
    addLine(store, 'Choose [1], [2], or [3].', C.ERROR_COLOR);
  }
}
