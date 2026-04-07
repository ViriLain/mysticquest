import type { CombatMessage, EnemyDef, GameStore, ItemDef, RoomDef, WeaponDef } from '../types';
import * as C from '../constants';
import { playerAttack, playerDefend, playerFlee, playerUseItem, enemyDefeated } from '../combat';
import { awardGold } from '../economy';
import { showInventory, showSkills, showStats } from '../handlers/info';
import { ICON, iconLine } from '../icons';
import { findAllMatches, resolveOrDisambiguate } from '../matching';
import { addLine, emitSound } from '../output';
import { pushEffect } from '../effects';
import { markEnemyDead } from '../world';

export interface CombatDeps {
  itemData: Record<string, ItemDef>;
  weaponData: Record<string, WeaponDef>;
  enemyData: Record<string, EnemyDef>;
  refreshHeader: () => void;
  addJournal: (type: 'combat', text: string) => void;
  checkEndingsForBoss: (enemyId: string) => void;
  checkAchievement: (id: string) => void;
  startGameover: () => void;
  getRoom: (id: string) => RoomDef | undefined;
}

function processCombatMessages(store: GameStore, msgs: CombatMessage[]): void {
  for (const msg of msgs) {
    addLine(store, msg.text, msg.color);
    if (msg.text.includes('deals') && msg.text.includes('damage to you')) {
      pushEffect(store.effects, 'shake', 0.3, { intensity: 4 });
      pushEffect(store.effects, 'flash', 0.2, { r: 1, g: 0, b: 0 });
      emitSound(store, 'playerHit');
    }
    if (msg.text.includes('CRITICAL HIT!')) {
      pushEffect(store.effects, 'flash', 0.3, { r: 1, g: 1, b: 1 });
      emitSound(store, 'critical');
    }
    if (msg.text.includes('enemy lands a CRITICAL HIT')) {
      pushEffect(store.effects, 'shake', 0.4, { intensity: 6 });
    }
    if (msg.text.includes('LEVEL UP!')) {
      emitSound(store, 'levelUp');
    }
  }
}

export function handleCombatCommand(
  store: GameStore,
  verb: string,
  target: string,
  deps: CombatDeps,
): void {
  if (!store.combat || !store.player || !store.world) {
    store.state = 'exploring';
    return;
  }

  addLine(store, '');

  let msgs: CombatMessage[] = [];

  if (verb === 'attack') {
    msgs = playerAttack(store.combat, store.player, deps.weaponData, deps.itemData);
  } else if (verb === 'defend') {
    msgs = playerDefend(store.combat, store.player, deps.itemData);
  } else if (verb === 'flee') {
    msgs = playerFlee(store.combat, store.player, deps.itemData);
  } else if (verb === 'use') {
    if (!target) {
      addLine(store, 'Use what?', C.ERROR_COLOR);
      return;
    }
    const consumableIds = Object.keys(store.player.inventory).filter(id => deps.itemData[id]?.type === 'consumable');
    const matches = findAllMatches(target, consumableIds, deps.itemData);
    if (matches.length > 1) {
      resolveOrDisambiguate(store, matches, deps.itemData, 'item do you want to use');
      return;
    }
    if (matches.length === 0) {
      addLine(store, "You don't have that.", C.ERROR_COLOR);
      return;
    }
    msgs = playerUseItem(store.combat, store.player, matches[0], deps.itemData);
  } else if (verb === 'inventory') {
    showInventory(store);
    return;
  } else if (verb === 'stats') {
    showStats(store);
    return;
  } else if (verb === 'skills') {
    showSkills(store);
    return;
  } else {
    addLine(store, 'In combat: attack, defend, flee, use <item>', C.COMBAT_COLOR);
    return;
  }

  processCombatMessages(store, msgs);
  deps.refreshHeader();

  if (store.player.hp > 0 && store.player.hp < store.player.maxHp * 0.3) {
    pushEffect(store.effects, 'jitter', 1.0, { intensity: 0.2 });
  }

  if (store.combat.finished) {
    if (store.combat.playerWon) {
      const defeatedEnemyId = store.combatEnemyId!;
      const results = enemyDefeated(store.combat, store.player);
      processCombatMessages(store, results.messages);

      const wasBoss = store.combat.enemy.isBoss;
      markEnemyDead(store.world, store.player.currentRoom, defeatedEnemyId);
      deps.addJournal('combat', `Defeated ${store.combat.enemy.name}`);
      if (store.gameMode === 'dungeon' && store.dungeon) {
        store.dungeon.score.enemiesKilled++;
      }

      const goldReward = store.combat.enemy.gold ?? 0;
      if (goldReward > 0) {
        awardGold(store.player, goldReward);
        addLine(store, iconLine(ICON.loot, `You loot ${goldReward} gold.`), C.LOOT_COLOR);
      }

      const room = deps.getRoom(store.player.currentRoom);
      if (room) {
        if (results.loot.length > 0) {
          if (!room._ground_loot) room._ground_loot = [];
          for (const lootItemId of results.loot) {
            room._ground_loot.push(lootItemId);
            const item = deps.itemData[lootItemId];
            if (item) addLine(store, iconLine(ICON.loot, `The enemy drops a ${item.name}.`), C.LOOT_COLOR);
          }
        }
        if (results.weapon) {
          if (!room._ground_weapons) room._ground_weapons = [];
          room._ground_weapons.push(results.weapon);
          const weapon = deps.weaponData[results.weapon];
          if (weapon) addLine(store, iconLine(ICON.loot, `The enemy drops a ${weapon.name}!`), C.LOOT_COLOR);
        }
      }

      addLine(store, '');
      addLine(store, '=== COMBAT END ===', C.COMBAT_COLOR);
      emitSound(store, 'victory');
      store.combat = null;
      store.combatEnemyId = null;
      store.state = 'exploring';

      deps.checkEndingsForBoss(defeatedEnemyId);

      deps.checkAchievement('first_blood');
      if (wasBoss) {
        deps.checkAchievement('boss_slayer');
        if (defeatedEnemyId === 'evil_king') deps.checkAchievement('king_slayer');
      }
      if (results.leveled) {
        if (store.player.level >= 15) deps.checkAchievement('master');
        addLine(store, 'You gained a skill point! Type "skills" to learn new abilities.', C.CHOICE_COLOR);
      }
    } else if (store.combat.fled) {
      addLine(store, '');
      addLine(store, '=== FLED COMBAT ===', C.COMBAT_COLOR);
      emitSound(store, 'fleeSuccess');
      store.combat = null;
      store.combatEnemyId = null;
      store.state = 'exploring';
    } else {
      store.combat = null;
      store.combatEnemyId = null;
      deps.startGameover();
    }

    deps.refreshHeader();
  }
}
