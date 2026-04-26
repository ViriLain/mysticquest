import * as C from '../constants';
import { findAllMatches, resolveOrDisambiguate } from '../matching';
import { addLine } from '../output';
import type { ItemDef, NpcDef, ReadyStore, WeaponDef } from '../types';
import { getRoom } from '../world';

type TopicData = Record<string, ItemDef | WeaponDef>;

const ABSTRACT_TOPIC_WORDS: Record<string, string[]> = {
  ancient_map: ['ancient map', 'map', 'old map', 'hidden path', 'hidden paths'],
  dark_crown: ['dark crown', 'crown', 'black crown', 'corruption'],
  keeper_ward: ['keeper ward', "keeper's ward", 'keepers ward', 'ward', 'protective ward'],
  mushrooms: ['mushroom', 'mushrooms', 'shroom', 'shrooms', 'red mushroom', 'grey mushroom', 'gray mushroom', 'green mushroom', 'orange mushroom'],
  magic_weapons: ['magic weapon', 'magic weapons', 'unique weapon', 'unique weapons', 'special weapon', 'special weapons'],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function splitAskTarget(target: string, npcCount: number): { npcTarget: string; topicTarget: string } {
  const normalized = target.trim();
  const aboutMatch = normalized.match(/^(.*?)\s+about\s+(.+)$/i);
  if (aboutMatch) {
    return {
      npcTarget: aboutMatch[1].trim(),
      topicTarget: aboutMatch[2].trim(),
    };
  }
  const aboutOnly = normalized.match(/^about\s+(.+)$/i);
  if (aboutOnly) {
    return { npcTarget: '', topicTarget: aboutOnly[1].trim() };
  }
  if (npcCount === 1) {
    return { npcTarget: '', topicTarget: normalized };
  }
  return { npcTarget: normalized, topicTarget: '' };
}

function topicCandidates(
  topicId: string,
  topicData: TopicData,
): string[] {
  const candidates = [topicId.replace(/_/g, ' '), ...(ABSTRACT_TOPIC_WORDS[topicId] || [])];
  const topic = topicData[topicId];
  if (topic) {
    candidates.push(topic.name);
    candidates.push(...(topic.match_words || []));
  }
  return candidates.map(normalize).filter(Boolean);
}

function matchesTopic(target: string, topicId: string, topicData: TopicData): boolean {
  const normalizedTarget = normalize(target);
  if (!normalizedTarget) return false;
  return topicCandidates(topicId, topicData).some(candidate =>
    normalizedTarget === candidate
    || (candidate.length >= 2 && normalizedTarget.includes(candidate))
    || (normalizedTarget.length >= 2 && candidate.includes(normalizedTarget)),
  );
}

function resolveTopic(
  target: string,
  npc: NpcDef,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
): string | null {
  const topics = npc.ask_topics || {};
  const topicData: TopicData = { ...itemData, ...weaponData };
  const topicIds = Object.keys(topics);

  const itemMatches = findAllMatches(target, Object.keys(itemData), itemData);
  const weaponMatches = findAllMatches(target, Object.keys(weaponData), weaponData);
  for (const id of [...itemMatches, ...weaponMatches]) {
    if (topics[id]) return id;
  }

  for (const topicId of topicIds) {
    if (matchesTopic(target, topicId, topicData)) return topicId;
  }

  return null;
}

function answerLines(answer: string | string[] | undefined): string[] {
  if (!answer) return [];
  return Array.isArray(answer) ? answer : [answer];
}

export function handleAsk(
  store: ReadyStore,
  target: string,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  npcData: Record<string, NpcDef>,
): void {
  const room = getRoom(store.world, store.player.currentRoom);
  if (!room?.npcs || room.npcs.length === 0) {
    addLine(store, "There's no one here to ask.", C.ERROR_COLOR);
    return;
  }

  const { npcTarget, topicTarget } = splitAskTarget(target, room.npcs.length);
  if (!topicTarget) {
    addLine(store, 'Ask whom about what?', C.CHOICE_COLOR);
    return;
  }

  let npcId: string | null = null;
  if (!npcTarget && room.npcs.length === 1) {
    npcId = room.npcs[0];
  } else if (!npcTarget) {
    addLine(store, `Ask whom about ${topicTarget}?`, C.CHOICE_COLOR);
    for (const id of room.npcs) {
      const npc = npcData[id];
      if (npc) addLine(store, `  ${npc.name}`, C.HELP_COLOR);
    }
    return;
  } else {
    const matches = findAllMatches(npcTarget, room.npcs, npcData);
    npcId = resolveOrDisambiguate(store, matches, npcData, 'person do you want to ask');
    if (!npcId) {
      if (matches.length === 0) addLine(store, "You don't see anyone like that here.", C.ERROR_COLOR);
      return;
    }
  }

  const npc = npcData[npcId];
  if (!npc) {
    addLine(store, "There's no one here to ask.", C.ERROR_COLOR);
    return;
  }

  const topicId = resolveTopic(topicTarget, npc, itemData, weaponData);
  const lines = answerLines(topicId ? npc.ask_topics?.[topicId] : npc.ask_fallback);
  if (lines.length === 0) {
    addLine(store, `${npc.name} does not seem to know about that.`, C.NPC_COLOR);
    return;
  }
  for (const line of lines) addLine(store, line, C.NPC_COLOR);
}
