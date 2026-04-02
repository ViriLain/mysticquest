# MysticQuest

A retro text adventure RPG with a CRT terminal aesthetic, built with React + TypeScript. Explore a corrupted school project, fight enemies, collect loot, and uncover multiple endings.

## Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

### Production Build

```bash
npm run build
npm run preview
```

## Gameplay

MysticQuest is played entirely through text commands typed into a terminal. The game features a meta-narrative: you're exploring a kid's school project that has been corrupted by something.

### Commands

| Command | Description |
|---|---|
| `go <direction>` | Move north/south/east/west/up/down (or just `n/s/e/w/u/d`) |
| `look` | Redisplay the current room |
| `take <item>` | Pick up an item or weapon |
| `use <item>` | Use a consumable or equip gear (`use potion x3` for batch) |
| `drop <item>` | Drop an item on the ground |
| `examine <thing>` | Inspect an item, weapon, or enemy in detail |
| `search` | Search the room for hidden items |
| `attack <enemy>` | Start combat with an enemy |
| `talk <npc>` | Talk to an NPC in the room |
| `inventory` / `i` | Show your inventory |
| `stats` | Show your character stats |
| `skills` | View the skill tree |
| `learn <skill>` | Spend a skill point to learn a skill |
| `journal` | View your adventure journal |
| `map` | Open the minimap overlay |
| `achievements` | View your achievement progress |
| `save` / `load` | Save or load your game |
| `settings` | Open the settings menu |
| `again` / `g` | Repeat your last command |
| `help` / `?` | Show command reference |
| `Tab` | Autocomplete commands and names |
| `Up/Down` | Browse command history |

### Combat

Combat is turn-based. When you encounter an enemy, use these commands:

- **attack** - Deal damage based on your ATK vs enemy DEF
- **defend** - Halve the next incoming damage
- **flee** - 70% chance to escape (90% with Quick Feet skill)
- **use <item>** - Use a consumable mid-combat

Critical hits have a 10% chance (18% with Sharp Eyes) and deal 2x damage (3x with Assassin).

### Skill Tree

Earn 1 skill point per level-up (14 total). Three branches:

**Warrior** (offensive/tanky):
- Iron Will, Heavy Blows, Thick Skin, Berserker, Titan

**Rogue** (crits/evasion):
- Sharp Eyes, Quick Feet, Precision, Lucky, Assassin

**Mage** (healing/buffs):
- Herbalism, Arcane Shield, Buff Mastery, Meditation, Enlightened

Skills must be unlocked in order within each branch. Type `skills` to view the tree and `learn <name>` to unlock.

### Regions

- **Manor** - The starting area. A haunted old house with rats and ghosts.
- **Wilds** - Forests, mountains, and wildlife. Home to the Mountain Troll boss.
- **Wastes** - A desolate desert with ruins and a guardian boss.
- **Darkness** - A corrupted realm with wraiths, knights, and the Evil King.
- **Hidden** - A secret psychedelic area with Milo the cat.

### Endings

There are 4 unique endings based on your choices and exploration:

1. **The Hero** - Defeat the Evil King
2. **The Usurper** - Use the Dark Crown at the stronghold
3. **The Wanderer** - Explore 80% of rooms with the Ancient Map
4. **The Enlightened** - Use all 4 mushrooms in the Hidden Diner

### NPCs

Four NPCs offer dialogue, items, and lore:
- **Dusty Merchant** (Manor) - Sells potions, hints about the cellar
- **Forest Guide Wren** (Wilds) - Gives the Ancient Map at level 3+
- **Blind Hermit** (Wastes) - Full heal, cryptic lore about the ruins
- **Sir Whiskers III** (Hidden) - Absurd meta-commentary

## Dungeon Mode

A separate endless mode accessible from the main menu. Features:

- Procedurally generated floors (5-8 rooms each, seeded RNG)
- Scaling enemy difficulty per floor
- Mini-bosses every 5 floors, full bosses every 10
- Special rooms: Fountains, Cursed Altars, Libraries, Treasure Vaults
- Rest areas between floors (heal, save, continue)
- Score tracking (floors cleared, enemies killed)
- Retry with the same seed for consistent runs

Type `score` in dungeon mode to see your run stats.

## Features

- **CRT Terminal Aesthetic** - Scanlines, vignette, chromatic aberration, screen curvature, flicker
- **Visual Effects** - Screen shake, flash, glitch, jitter, per-region color tints
- **Sound Effects** - Procedurally generated 8-bit audio via Web Audio API (no audio files)
- **Region Ambient Music** - Each region has a distinct ambient drone that crossfades between areas
- **Typewriter Text** - Configurable speed (instant/fast/normal/slow)
- **Minimap** - Canvas overlay showing visited rooms, connections, and travel route
- **3 Save Slots** - With custom names, auto-save on room entry
- **Command History** - Up/Down arrows to recall previous commands
- **Tab Autocomplete** - Context-aware completion for commands, items, enemies, NPCs
- **13 Achievements** - Tracked globally across all saves
- **Settings** - Font size, color mode (normal/high contrast/colorblind), text speed, volume controls
- **Colorblind Mode** - Deuteranopia-friendly color remapping

## Tech Stack

- **Vite** + **React** + **TypeScript**
- CSS-based CRT post-processing effects
- Web Audio API for all sound (no audio files)
- localStorage for saves, settings, and achievements
- All game data in static JSON files
- No backend required

## Project Structure

```
src/
  engine/          # Pure game logic (no React dependencies)
    gameReducer.ts # Central state machine (~2000 lines)
    types.ts       # All TypeScript interfaces
    player.ts      # Player stats, inventory, leveling
    combat.ts      # Turn-based combat with skill integration
    world.ts       # Room graph, regions, dynamic exits
    effects.ts     # Visual effects (shake, flash, glitch, tint)
    events.ts      # Room entry event triggers
    endings.ts     # 4 ending trigger types
    save.ts        # Multi-slot localStorage save system
    commands.ts    # Command parser with aliases
    skills.ts      # Skill tree definitions
    achievements.ts # Achievement tracking
    audio.ts       # Web Audio API sound effects + ambient music
    minimap.ts     # BFS-based room layout computation
    dungeon.ts     # Procedural floor generator
    rng.ts         # Seeded PRNG (Mulberry32)
    settings.ts    # Persistent settings (font, color, speed, volume)
    asciiArt.ts    # ASCII art loader
  components/
    Game.tsx       # Main game component (render loop, input, UI)
    Minimap.tsx    # Canvas-based minimap overlay
  data/
    items.json     # Consumables, shields, key items
    weapons.json   # 20 weapons with match_words
    enemies.json   # 16 enemies including 6 bosses
    endings.json   # 4 ending definitions
    npcs.json      # 4 NPCs with dialogue trees
    regions/       # 5 region files with room definitions
  assets/ascii/    # ASCII art (title, death, boss art)
  styles/          # CRT, terminal, and effect CSS
```

## License

See [LICENSE](LICENSE) for details.
