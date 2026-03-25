# MysticQuest — Love2D Terminal Adventure Redesign

## Overview

MysticQuest is a text-based adventure game being rebuilt as a Love2D game with a CRT terminal aesthetic. The player types commands into what appears to be an old CRT monitor, exploring a mysterious mansion and the dark world beyond it. The terminal itself reacts to the game world — glitching in evil areas, glowing warmly in safe ones, going psychedelic in hidden zones.

**Tech stack:** Love2D 11.5 (Lua)

**Core pillars:**
- Exploration is the point — a rich, curated world that rewards curiosity
- Light RPG progression — level up, find weapons, get stronger through exploration
- Multiple endings — at least 3 main + 1 secret, based on choices and exploration
- The terminal is alive — the CRT aesthetic reacts dynamically to the game world

**Tone:** Atmospheric dark fantasy on the main path. Weird humor and fourth-wall breaks hidden as easter eggs for curious players.

---

## World Design

### Regions

The original 57 rooms are curated to ~35-40 high-quality rooms across 5 regions. Each region has its own terminal "mood."

| Region | ~Rooms | Terminal Mood | Purpose |
|--------|--------|---------------|---------|
| **The Manor** | 12 | Dim green text, flickering, quiet ambient hum | Tutorial/introduction, establish atmosphere |
| **The Wilds** | 8 | Brighter text, nature sounds, calm palette | Open exploration, weapon finding, breathing room |
| **The Darkness** | 8 | Red-tinted text, screen shake, glitch effects, heavy distortion | Main quest climax, boss encounters |
| **The Wastes** | 5 | Amber/sepia text, heat shimmer effect, sparse sound | Optional side area, hidden loot, lore |
| **The Hidden** | 4 | Rainbow/psychedelic colors, silly sounds, fourth-wall breaks | Secret reward area, humor, easter eggs |

### Curation Principles

**Cut:** Redundant rooms (e.g., "Southern Mountains" that just says "more mountains"), placeholder descriptions ("Lake, Lake Lake, It is a Lake..."), duplicate connector rooms that don't add anything.

**Improve:** Thin descriptions get fleshed out with atmosphere matching the terminal mood. Room connections reviewed so the map flows logically with no dead-end frustration. Each room gets a purpose — loot, enemy, lore, or atmosphere. No empty filler.

### Regional Bosses

- **The Manor:** Something lurking in the dungeon or cellar (optional early boss)
- **The Wilds:** A creature at the mountain peak
- **The Darkness:** The Evil King in the Stronghold (main path climax)
- **The Wastes:** Ancient guardian in the Ruins
- **The Hidden:** Milo the Hobbit cult leader (joke boss)

### Room Data Format

Rooms are defined in JSON, one file per region. The system auto-loads all files in `data/regions/`.

```json
{
  "id": "manor_entry",
  "name": "Entry",
  "region": "manor",
  "description": "...",
  "exits": { "north": "manor_hall", "south": "yard" },
  "items": ["rusty_key"],
  "enemies": ["shadow_rat"],
  "on_enter": "flicker_lights",
  "searched": false
}
```

- String-based IDs (readable, no collisions when adding regions)
- Exits reference room IDs so regions can cross-connect freely
- Optional `on_enter` field for scripted events (screen effects, dialogue, locked doors)
- Adding a new region = drop in a new JSON file

---

## Game Systems

### Combat (Light RPG)

- Hero has: HP, attack, defense, level, XP
- Enemies have: HP, attack, defense, XP reward, loot table
- Each round: choose attack, defend (half damage taken), use item, or flee
- Damage formula: `attack - defense + small random range` (predictable but not static)
- Defeating enemies grants XP. Level up every N XP — boosts HP and attack
- Equipped weapon adds to attack stat. Armor items add to defense
- Boss fights: same system but bosses have more HP, hit harder, maybe a special move every few turns

Combat feedback:
- Screen shake on hit
- Flash on critical hit
- Text glitch when low HP

### Weapons

Cut from 56 to ~20 weapons with meaningful tiers, spread across regions for natural progression:

- **Manor:** Rusty Dagger (weak), Iron Sword (decent)
- **Wilds:** Steel Sword, Spear, Mjolnir (thorough exploration reward)
- **Wastes:** Excalibur, Masamune (reward for optional area)
- **Darkness:** Anduril, Ragnarok (needed for endgame)
- **Hidden:** Badger on a Stick, FALCON PUNCH (joke weapons that are actually strong)

Damage range roughly 5 to 100, scaled to enemy HP pools.

### Inventory

- Simple list of items and weapons
- Key items (quest-related) stored separately, can't be dropped
- Consumables: health potions, stat buffs (found in rooms or dropped by enemies)
- Equip one weapon at a time, swap anytime

### Progression & Soft Gating

- Start at level 1 in the manor with nothing
- Manor teaches basics (move, search, pick up, fight a weak enemy)
- Wilds open up exploration and choice
- Reaching the Darkness requires being strong enough (soft gate via enemy difficulty, not locked doors)
- Hidden area unlocked by finding a secret exit in the Clearing (already connects to Hobbit Hole)
- No hard locks — a skilled or curious player can reach anything

---

## Endings

### Ending 1: "The Hero"
- Defeat the Evil King in the Stronghold through combat
- Requires good gear and decent level
- Terminal displays triumphant message, text turns gold, CRT flicker calms to steady glow

### Ending 2: "The Usurper"
- Find a hidden dark crown/cursed artifact in the Alternate Dimension / Oblivion Gate area
- Bring it to the Evil King — option to "use dark crown" instead of attacking
- You take his place. Terminal shifts to red permanently, text becomes corrupted
- Rewards thorough exploration of the dark path

### Ending 3: "The Wanderer"
- Explore ~80%+ of all rooms and find a hidden exit in the Ruins
- Peaceful resolution — you leave the world behind, having seen everything
- Terminal fades to warm amber, peaceful tone plays
- Rewards completionists

### Secret Ending: "The Enlightened"
- Eat everything at Joe's Shroomy Diner
- Terminal goes full psychedelic — rainbow text, screen wobbles, game "breaks" in funny ways
- Fourth-wall breaking dialogue, credits roll sideways, joke stats screen
- Pure reward for finding and engaging with the hidden area

### Soft Gating for Endings

- Ending 2 requires finding a non-obvious item in an optional area — exploration-gated
- Ending 3 requires visiting most rooms — naturally locks behind curiosity and persistence
- Secret ending requires reaching the Hidden region, which itself is behind the hardest area
- None locked behind hard doors

### Choice Moments

Key decisions presented as special prompts that look different from normal commands (highlighted color or border). No invisible choices — the player always knows when something matters.

---

## Terminal Aesthetic

### Base Rendering

- Monospace retro font (IBM VGA, Perfect DOS VGA, or Commodore 64 style)
- Base color: green phosphor text on near-black, shifts per region
- CRT shader: scanlines, slight curvature, vignette, subtle screen glow/bloom
- Text renders character-by-character (typewriter effect) with soft keystroke sound
- Blinking cursor at input line
- Render to fixed low resolution canvas (960x540), scale up with CRT shader

### Screen Layout

```
+-------------------------------------------+
|  MYSTICQUEST v1.0    HP:45  LVL:3         |
+-------------------------------------------+
|                                           |
|  [Room description and game output        |
|   scrolls here, typewriter style]         |
|                                           |
|                                           |
+-------------------------------------------+
| > _                                       |
+-------------------------------------------+
```

- Top bar: game title, HP, level, equipped weapon — always visible
- Main area: scrolling text output
- Bottom: input line with blinking cursor
- CRT-styled border with rounded corners and glow

### Dynamic Effects

| Trigger | Effect |
|---------|--------|
| Enter new room | Brief screen flicker, new text types out |
| Take damage | Screen shake, brief red flash |
| Critical hit / kill | Text flashes bright, satisfying thud sound |
| Low HP | Text jitters, occasional random character corruption |
| Evil areas | Persistent scanline intensification, random glitch frames, red tint |
| Safe areas | Glow softens, warmer color, gentle ambient hum |
| Hidden areas | Rainbow color cycling, wobbly text, playful sounds |
| Boss encounter | Screen goes black, text slams in dramatically, music kicks in |
| Level up | Golden flash, stats print out like a boot sequence |

### Sound Design

- **Ambient:** Per-region drone/atmosphere (wind for wilds, hum for manor, static for darkness)
- **UI:** Keyboard clicks on input, soft blip on text output, chime on item pickup
- **Combat:** Impact sounds, enemy death, low HP warning beep
- **Music:** Minimal — simple theme for boss fights and endings only. Ambient does the heavy lifting.

### ASCII Art

Small ASCII art pieces (10-15 lines max) for key moments: boss encounters, finding major weapons, entering new regions, endings. Treats, not clutter.

---

## Technical Architecture

### Project Structure

```
mysticquest/
├── main.lua              -- Entry point, game loop
├── conf.lua              -- Love2D config (window size, title)
├── src/
│   ├── game.lua          -- Game state manager (menu, playing, ending)
│   ├── terminal.lua      -- CRT rendering, typewriter, input handling
│   ├── player.lua        -- Hero stats, inventory, leveling
│   ├── combat.lua        -- Combat loop and damage calc
│   ├── world.lua         -- Room loading, region management, navigation
│   ├── commands.lua      -- Command parser and dispatcher
│   ├── effects.lua       -- Screen shake, flash, glitch, color shifts
│   └── audio.lua         -- Sound/music manager
├── data/
│   ├── regions/
│   │   ├── manor.json
│   │   ├── wilds.json
│   │   ├── darkness.json
│   │   ├── wastes.json
│   │   └── hidden.json
│   ├── weapons.json
│   ├── enemies.json
│   └── endings.json
├── assets/
│   ├── fonts/
│   ├── sounds/
│   ├── shaders/
│   └── ascii/
└── saves/
```

### Key Design Decisions

- **Data-driven:** Rooms, weapons, enemies, endings all in JSON. Change the game without touching Lua.
- **Region auto-loading:** `world.lua` scans `data/regions/` and loads every JSON file it finds.
- **State machine:** Game has clear states (menu, exploring, combat, dialogue, ending) — each handles input and rendering differently.
- **Save system:** Serialize player state + visited rooms + world state to a JSON file.
- **Modular effects:** `effects.lua` is a queue — anything can push an effect (shake, flash, tint) and they layer and expire independently.

### Love2D Specifics

- Target Love2D 11.5 (latest stable)
- Render to canvas at fixed resolution (960x540), scale up with CRT shader
- `love.graphics.newFont()` with bitmap/TTF retro font
- CRT shader in GLSL as post-processing pass
- JSON parsing via small pure-Lua library (json.lua, ~200 lines, no external deps)

---

## Content Migration from Original

The original Python project's content is preserved where valuable:

- Room descriptions from `StoryBoard.txt` are the starting point — curated and improved, not rewritten from scratch
- Weapon names from `weapons.txt` are kept for the curated ~20 weapon list
- The world map topology is the foundation — connections adjusted for better flow
- The humor and personality of the original writing is preserved in the Hidden region
- The main path gets a more atmospheric tone while keeping the original spirit
