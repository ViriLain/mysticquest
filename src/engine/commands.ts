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
};

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

  if (verb === 'go' && DIR_SHORTCUTS[target]) {
    target = DIR_SHORTCUTS[target];
  }

  return [verb, target || ''];
}
