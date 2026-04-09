import * as C from '../constants';
import { findAllMatches, resolveOrDisambiguate } from '../matching';
import { notifyObjectiveEvent } from '../objectives';
import { addItem, addWeapon, hasItem, hasKeyItem, heal as playerHeal, removeItem } from '../player';
import { addLine } from '../output';
import type { DialogueCondition, GameStore, ItemDef, NpcDef, PlayerState, WeaponDef } from '../types';
import { getRoom } from '../world';

export function checkDialogueCondition(cond: DialogueCondition, player: PlayerState): boolean {
  switch (cond.type) {
    case 'has_key_item': return hasKeyItem(player, String(cond.value));
    case 'has_item': return hasItem(player, String(cond.value));
    case 'level_gte': return player.level >= Number(cond.value);
    case 'flag_set': return !!player.firedEvents[String(cond.value)];
    case 'flag_not_set': return !player.firedEvents[String(cond.value)];
    default: return true;
  }
}

export function handleTalk(
  store: GameStore,
  target: string,
  npcData: Record<string, NpcDef>,
  checkChatterbox: () => void,
): void {
  if (!store.player || !store.world) return;
  const room = getRoom(store.world, store.player.currentRoom);
  if (!room || !room.npcs || room.npcs.length === 0) {
    addLine(store, "There's no one to talk to here.", C.ERROR_COLOR);
    return;
  }

  let npcId: string | null = null;

  if (!target && room.npcs.length === 1) {
    npcId = room.npcs[0];
  } else if (!target && room.npcs.length > 1) {
    addLine(store, 'Who do you want to talk to?', C.CHOICE_COLOR);
    for (const id of room.npcs) {
      const npc = npcData[id];
      if (npc) addLine(store, `  ${npc.name}`, C.HELP_COLOR);
    }
    return;
  } else {
    const matches = findAllMatches(target, room.npcs, npcData);
    npcId = resolveOrDisambiguate(store, matches, npcData, 'person do you want to talk to');
    if (!npcId) {
      if (matches.length === 0) addLine(store, "You don't see anyone like that here.", C.ERROR_COLOR);
      return;
    }
  }

  const npc = npcData[npcId];
  if (!npc) {
    addLine(store, "There's no one to talk to here.", C.ERROR_COLOR);
    return;
  }

  store.npcDialogue = { npcId, currentNode: 'start' };
  store.player.firedEvents[`talked_${npcId}`] = true;
  notifyObjectiveEvent(store, { type: 'talked_to_npc', npc: npcId });
  displayDialogueNode(store, npcData);
  store.state = 'dialogue';

  checkChatterbox();
}

export function displayDialogueNode(store: GameStore, npcData: Record<string, NpcDef>): void {
  if (!store.npcDialogue || !store.player) return;
  const npc = npcData[store.npcDialogue.npcId];
  if (!npc) return;
  const node = npc.dialogue[store.npcDialogue.currentNode];
  if (!node) return;

  addLine(store, '');
  for (const line of node.text) {
    addLine(store, line, C.NPC_COLOR);
  }

  const visibleChoices = node.choices.filter(c =>
    !c.condition || checkDialogueCondition(c.condition, store.player!)
  );

  store.dialogueOptions = visibleChoices.map(c => c.label);
  addLine(store, '');
  visibleChoices.forEach((choice, i) => {
    addLine(store, `[${i + 1}] ${choice.label}`, C.CHOICE_COLOR);
  });
}

export function handleNpcDialogueInput(
  store: GameStore,
  input: string,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  npcData: Record<string, NpcDef>,
  refreshHeader: () => void,
  openShop: (shopId: string) => void,
): void {
  if (!store.npcDialogue || !store.player || !store.world) return;

  const npc = npcData[store.npcDialogue.npcId];
  if (!npc) return;
  const node = npc.dialogue[store.npcDialogue.currentNode];
  if (!node) return;

  const visibleChoices = node.choices.filter(c =>
    !c.condition || checkDialogueCondition(c.condition, store.player!)
  );

  const trimmed = input.trim();
  const num = parseInt(trimmed, 10);
  let choiceIdx = -1;

  if (!isNaN(num) && num >= 1 && num <= visibleChoices.length) {
    choiceIdx = num - 1;
  } else {
    for (let i = 0; i < visibleChoices.length; i++) {
      if (trimmed.toLowerCase() === visibleChoices[i].label.toLowerCase()) {
        choiceIdx = i;
        break;
      }
    }
  }

  if (choiceIdx < 0) {
    addLine(store, `Choose an option: 1-${visibleChoices.length}`, C.ERROR_COLOR);
    return;
  }

  const choice = visibleChoices[choiceIdx];

  if (choice.effect) {
    const eff = choice.effect;
    if (eff.give_item) {
      addItem(store.player, eff.give_item, itemData);
      const item = itemData[eff.give_item];
      if (item) addLine(store, `Received: ${item.name}`, C.ITEM_COLOR);
    }
    if (eff.give_weapon) {
      addWeapon(store.player, eff.give_weapon);
      const weapon = weaponData[eff.give_weapon];
      if (weapon) addLine(store, `Received: ${weapon.name}`, C.ITEM_COLOR);
    }
    if (eff.heal && eff.heal > 0) {
      playerHeal(store.player, eff.heal);
      addLine(store, `Healed ${eff.heal} HP.`, C.ITEM_COLOR);
      refreshHeader();
    }
    if (eff.set_flag) {
      store.player.firedEvents[eff.set_flag] = true;
    }
    if (eff.remove_item) {
      removeItem(store.player, eff.remove_item);
    }
    if (eff.open_shop) {
      openShop(eff.open_shop);
      return;
    }
  }

  if (choice.next === null) {
    addLine(store, '');
    addLine(store, `${npc.name} nods farewell.`, C.NPC_COLOR);
    store.npcDialogue = null;
    store.state = 'exploring';
  } else {
    store.npcDialogue.currentNode = choice.next;
    displayDialogueNode(store, npcData);
  }
}
