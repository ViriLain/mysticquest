// Import all ASCII art files as raw strings
import title from '../assets/ascii/title.txt?raw';
import death from '../assets/ascii/death.txt?raw';
import bossCellarShade from '../assets/ascii/boss_cellar_shade.txt?raw';
import bossEvilKing from '../assets/ascii/boss_evil_king.txt?raw';
import bossMilo from '../assets/ascii/boss_milo.txt?raw';
import bossMountainTroll from '../assets/ascii/boss_mountain_troll.txt?raw';
import bossOblivionGuardian from '../assets/ascii/boss_oblivion_guardian.txt?raw';
import bossRuinsGuardian from '../assets/ascii/boss_ruins_guardian.txt?raw';

const ASCII_MAP: Record<string, string> = {
  title,
  death,
  boss_cellar_shade: bossCellarShade,
  boss_evil_king: bossEvilKing,
  boss_milo: bossMilo,
  boss_mountain_troll: bossMountainTroll,
  boss_oblivion_guardian: bossOblivionGuardian,
  boss_ruins_guardian: bossRuinsGuardian,
};

export function getAsciiLines(name: string): string[] | null {
  const content = ASCII_MAP[name];
  if (!content) return null;
  const lines = content.split('\n');
  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}
