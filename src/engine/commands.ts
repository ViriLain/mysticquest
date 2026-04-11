const DIR_SHORTCUTS: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down',
  north: 'north', south: 'south', east: 'east', west: 'west', up: 'up', down: 'down',
};

const VERB_ALIASES: Record<string, string> = {
  move: 'go', get: 'take', 'pick up': 'take',
  fight: 'attack', hit: 'attack',
  chat: 'talk', speak: 'talk',
  block: 'defend',
  run: 'flee',
  l: 'look', i: 'inventory',
  '?': 'help', q: 'quit',
  equip: 'use', status: 'stats', repeat: 'again', g: 'again', inspect: 'examine',
  teleport: 'warp',
};

const KNOWN_VERBS = new Set([
  'go', 'look', 'take', 'use', 'drop', 'search', 'attack', 'defend', 'flee',
  'inventory', 'stats', 'save', 'load', 'help', 'quit', 'talk', 'journal',
  'map', 'score', 'again', 'examine', 'skills', 'learn', 'achievements', 'settings',
]);

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyMatchVerb(verb: string): string | null {
  if (verb.length < 3) return null; // too short for reliable fuzzy
  for (const known of KNOWN_VERBS) {
    if (levenshtein(verb, known) === 1) return known;
  }
  return null;
}

export function parseCommand(input: string): [string | null, string] {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return [null, ''];

  if (DIR_SHORTCUTS[trimmed]) {
    return ['go', DIR_SHORTCUTS[trimmed]];
  }

  const match = trimmed.match(/^(\S+)\s*(.*)/);
  if (!match) return [null, ''];

  let verb = match[1];
  let target = match[2];

  if (verb === 'pick' && target.startsWith('up ')) {
    verb = 'pick up';
    target = target.slice(3);
  } else if (verb === 'pick' && target === 'up') {
    return ['take', ''];
  }

  verb = VERB_ALIASES[verb] || verb;

  // Fuzzy match: if verb isn't recognized, try Levenshtein distance 1
  if (!KNOWN_VERBS.has(verb) && !DIR_SHORTCUTS[verb]) {
    const fuzzy = fuzzyMatchVerb(verb);
    if (fuzzy) verb = fuzzy;
  }

  if (verb === 'go' && DIR_SHORTCUTS[target]) {
    target = DIR_SHORTCUTS[target];
  }

  return [verb, target || ''];
}
