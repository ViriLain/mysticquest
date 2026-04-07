export const ICON = {
  item: '[*]',
  weapon: '[+]',
  enemy: '[!]',
  npc: '[@]',
  exit: '>',
  key: '[#]',
  shield: '[=]',
  loot: '[$]',
} as const;

export type IconKey = keyof typeof ICON;

export function iconLine(icon: string, text: string): string {
  return `${icon} ${text}`;
}
