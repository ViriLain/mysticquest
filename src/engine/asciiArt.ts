// Import all ASCII art files as raw strings
import title from '../assets/ascii/title.txt?raw';
import death from '../assets/ascii/death.txt?raw';
import bossCellarShade from '../assets/ascii/boss_cellar_shade.txt?raw';
import bossEvilKing from '../assets/ascii/boss_evil_king.txt?raw';
import bossMilo from '../assets/ascii/boss_milo.txt?raw';
import bossMountainTroll from '../assets/ascii/boss_mountain_troll.txt?raw';
import bossOblivionGuardian from '../assets/ascii/boss_oblivion_guardian.txt?raw';
import bossRuinsGuardian from '../assets/ascii/boss_ruins_guardian.txt?raw';
import regionManor from '../assets/ascii/region_manor.txt?raw';
import regionWilds from '../assets/ascii/region_wilds.txt?raw';
import regionDarkness from '../assets/ascii/region_darkness.txt?raw';
import regionWastes from '../assets/ascii/region_wastes.txt?raw';
import regionHidden from '../assets/ascii/region_hidden.txt?raw';
import weaponHrunting from '../assets/ascii/weapon_hrunting.txt?raw';
import weaponTyrfing from '../assets/ascii/weapon_tyrfing.txt?raw';
import weaponExcalibur from '../assets/ascii/weapon_excalibur.txt?raw';
import weaponKeyblade from '../assets/ascii/weapon_keyblade.txt?raw';
import weaponAnduril from '../assets/ascii/weapon_anduril.txt?raw';
import weaponRagnarok from '../assets/ascii/weapon_ragnarok.txt?raw';

const ASCII_MAP: Record<string, string> = {
  title,
  death,
  boss_cellar_shade: bossCellarShade,
  boss_evil_king: bossEvilKing,
  boss_milo: bossMilo,
  boss_mountain_troll: bossMountainTroll,
  boss_oblivion_guardian: bossOblivionGuardian,
  boss_ruins_guardian: bossRuinsGuardian,
  region_manor: regionManor,
  region_wilds: regionWilds,
  region_darkness: regionDarkness,
  region_wastes: regionWastes,
  region_hidden: regionHidden,
  weapon_hrunting: weaponHrunting,
  weapon_tyrfing: weaponTyrfing,
  weapon_excalibur: weaponExcalibur,
  weapon_keyblade: weaponKeyblade,
  weapon_anduril: weaponAnduril,
  weapon_ragnarok: weaponRagnarok,
};

export function getAsciiLines(name: string): string[] | null {
  const content = ASCII_MAP[name];
  if (!content) return null;
  const lines = content.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

export function getRegionArtName(region: string | null): string | null {
  if (!region) return null;
  const key = `region_${region}`;
  return key in ASCII_MAP ? key : null;
}

export function getWeaponArtName(weaponId: string): string | null {
  const key = `weapon_${weaponId}`;
  return key in ASCII_MAP ? key : null;
}
