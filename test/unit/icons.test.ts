import { describe, expect, it } from 'vitest';
import { ICON, iconLine } from '../../src/engine/icons';

describe('ICON glyph constants', () => {
  it('exposes all expected categories', () => {
    expect(ICON.item).toBe('[*]');
    expect(ICON.weapon).toBe('[+]');
    expect(ICON.enemy).toBe('[!]');
    expect(ICON.npc).toBe('[@]');
    expect(ICON.exit).toBe('>');
    expect(ICON.key).toBe('[#]');
    expect(ICON.shield).toBe('[=]');
    expect(ICON.loot).toBe('[$]');
  });
});

describe('iconLine', () => {
  it('prefixes the icon with a space', () => {
    expect(iconLine(ICON.item, 'Potion')).toBe('[*] Potion');
    expect(iconLine(ICON.enemy, 'A Shadow Rat lurks here.')).toBe('[!] A Shadow Rat lurks here.');
    expect(iconLine(ICON.exit, 'Exits: north, south')).toBe('> Exits: north, south');
  });

  it('handles empty text', () => {
    expect(iconLine(ICON.item, '')).toBe('[*] ');
  });
});
