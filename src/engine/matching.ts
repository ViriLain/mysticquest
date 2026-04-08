import * as C from './constants';
import { addLine } from './output';
import type { GameStore } from './types';

export interface Matchable {
  name: string;
  match_words?: string[];
}

export function findAllMatches(name: string, ids: string[], dataTable: Record<string, Matchable>): string[] {
  const lower = name.toLowerCase();

  for (const id of ids) {
    const info = dataTable[id];
    if (!info) continue;
    if (id.toLowerCase() === lower || info.name.toLowerCase() === lower) return [id];
  }

  const wordMatches: string[] = [];
  for (const id of ids) {
    const info = dataTable[id];
    if (!info?.match_words) continue;
    if (info.match_words.some(word => word.toLowerCase() === lower)) wordMatches.push(id);
  }
  if (wordMatches.length > 0) return wordMatches;

  const partial: string[] = [];
  for (const id of ids) {
    const info = dataTable[id];
    if (!info) continue;
    if (id.toLowerCase().includes(lower) || info.name.toLowerCase().includes(lower)) partial.push(id);
  }
  return partial;
}

/**
 * If the target looks plural, return its singular form for retry matching.
 * Callers use this as a fallback when the original target matches nothing and
 * as a "take/use all matching" signal when multiple matches come back.
 */
export function singularize(target: string): string | null {
  if (target.length > 2 && target.endsWith('s') && !target.endsWith('ss')) {
    return target.slice(0, -1);
  }
  return null;
}

export function resolveOrDisambiguate(
  store: GameStore,
  matches: string[],
  dataTable: Record<string, Matchable>,
  verb: string,
): string | null {
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    addLine(store, `Which ${verb}?`, C.CHOICE_COLOR);
    for (const id of matches) {
      const info = dataTable[id];
      if (info) addLine(store, `  ${info.name}`, C.HELP_COLOR);
    }
  }
  return null;
}
