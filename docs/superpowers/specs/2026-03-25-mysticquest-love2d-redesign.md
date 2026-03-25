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
- Exits support all 6 directions: north, south, east, west, up, down
- Optional `on_enter` field for scripted events (see Events section below)
- `searchable`: whether the room has hidden items to find (runtime search state tracked in save data, not here)
- `enemies` is a list of enemy IDs referencing `enemies.json`
- Adding a new region = drop in a new JSON file

### Room Events (`on_enter`)

Events are simple string keys that map to hardcoded Lua functions in an event registry. No scripting DSL — keep it simple.

Supported events:
- **Visual effects:** `"flicker_lights"`, `"screen_glitch"`, `"fade_to_black"` — trigger a terminal effect on entry
- **Dialogue:** `"dialogue:some_key"` — display a narrative text block from a dialogue table (first visit only)
- **Gate check:** `"require:item_id"` — if the player lacks the item, display a message and block entry (push them back)
- **Boss trigger:** `"boss:enemy_id"` — force a combat encounter on entry (first visit only)

Events fire on first entry only by default. The set of fired events is tracked in save data. This is intentionally limited — if we need more complex scripting later, we can expand the registry without changing the data format.

---

## Game Systems

### Commands

The player interacts via typed commands. The parser splits input into verb + target.

| Command | Aliases | Args | Behavior |
|---------|---------|------|----------|
| `go <dir>` | `move <dir>` | north/south/east/west/up/down | Move to adjacent room if exit exists |
| `n`, `s`, `e`, `w` | — | — | Direction shortcuts (also `u`, `d` for up/down) |
| `look` | `l` | — | Redisplay current room description, list visible items/enemies |
| `search` | `examine` | — | Search room for hidden items (once per room) |
| `take <item>` | `get`, `pick up` | item name | Pick up a visible item or weapon from the room |
| `drop <item>` | — | item name | Drop an item in the current room (not key items) |
| `use <item>` | `equip` | item name | Equip a weapon or use a consumable |
| `attack <target>` | `fight`, `hit` | enemy name | Initiate or continue combat with an enemy |
| `defend` | `block` | — | During combat: take half damage this round |
| `flee` | `run` | — | During combat: attempt to escape (70% success, fail = take a hit) |
| `inventory` | `i` | — | List carried items, weapons, and equipped weapon |
| `stats` | `status` | — | Show HP, level, XP, attack, defense |
| `help` | `?` | — | Show command list |
| `save` | — | — | Save game to file |
| `load` | — | — | Load saved game |
| `quit` | `q` | — | Exit the game |

Unrecognized commands get: "I don't understand that. Type 'help' for commands."

Parser is case-insensitive. Multi-word item/enemy names matched by longest prefix (e.g., "take iron sword" matches "Iron Sword").

### Combat (Light RPG)

**Player starting stats:**
- HP: 30, Attack: 5, Defense: 2, Level: 1, XP: 0

**Leveling:**
- XP to next level: `level * 25` (so 25, 50, 75, 100...)
- Per level: +8 HP, +2 Attack, +1 Defense
- Max level: 15 (soft cap — enemies in Darkness are tuned for ~level 8-10)

**Damage formula:**
- `damage = max(1, attacker_attack - defender_defense + random(-2, 2))`
- Minimum 1 damage always (no zero-damage stalemates)
- Critical hit: 10% chance, deals 2x damage
- Applies identically to player and enemies
- Weapon adds to player attack. Armor/shield items add to player defense.

**Combat flow:**
- Each round: choose attack, defend (half damage taken next enemy hit), use item, or flee
- Flee: 70% success chance. On failure, enemy gets a free hit.
- Enemy attacks after player action (unless player fled successfully or killed the enemy)
- Boss fights: same system but bosses may have a special attack every 3 rounds (extra damage + screen effect)

**Enemy data format (`enemies.json`):**

```json
{
  "shadow_rat": {
    "name": "Shadow Rat",
    "hp": 10, "attack": 3, "defense": 1,
    "xp": 8,
    "loot": ["small_potion"],
    "region": "manor",
    "description": "A rat wreathed in unnatural shadow."
  }
}
```

**Representative enemy stat blocks:**

| Enemy | Region | HP | Atk | Def | XP | Loot |
|-------|--------|----|-----|-----|----|------|
| Shadow Rat | Manor | 10 | 3 | 1 | 8 | Small Potion |
| Cellar Shade (mini-boss) | Manor | 35 | 7 | 3 | 30 | Iron Sword |
| Forest Wolf | Wilds | 20 | 6 | 2 | 15 | — |
| Mountain Troll (boss) | Wilds | 60 | 12 | 5 | 50 | Mjolnir |
| Grave Wraith | Darkness | 40 | 14 | 6 | 35 | Dark Essence |
| The Evil King (final boss) | Darkness | 150 | 22 | 10 | — | — |
| Sand Golem | Wastes | 50 | 10 | 8 | 40 | Excalibur |
| Milo (joke boss) | Hidden | 25 | 5 | 1 | 100 | FALCON PUNCH |

Enemies are assigned to rooms by ID reference in the room JSON. Each enemy instance in a room is independent (track alive/dead state per room in save data).

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

**Weapon stat blocks (~20 weapons, representative):**

| Weapon | Region | Attack Bonus | Notes |
|--------|--------|-------------|-------|
| Rusty Dagger | Manor | +2 | Starting-tier |
| Iron Sword | Manor | +5 | Cellar Shade drop |
| Steel Sword | Wilds | +8 | Found in clearing |
| Spear | Wilds | +10 | Found in mountains |
| Mjolnir | Wilds | +15 | Mountain Troll boss drop |
| Excalibur | Wastes | +20 | Sand Golem drop |
| Masamune | Wastes | +25 | Hidden in Ruins |
| Anduril | Darkness | +30 | Found in Shadowlands |
| Ragnarok | Darkness | +35 | Found before final boss |
| Badger on a Stick | Hidden | +30 | Joke weapon, strong |
| FALCON PUNCH | Hidden | +40 | Milo drop, best weapon in the game |

Attack bonus range: +2 to +40, scaled so that a player at level 8 with a Darkness-tier weapon can comfortably fight the Evil King. A player with Hidden-tier joke weapons can stomp everything.

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
- **Trigger:** Player has key item `dark_crown` (found in room `darkness_oblivion_gate` after defeating the Oblivion Gate guardian) AND enters the Evil Stronghold. A choice prompt appears: "The crown pulses with dark energy. [attack] or [use dark crown]?"
- Choosing "use dark crown" triggers this ending. You take the Evil King's place.
- Terminal shifts to red permanently, text becomes corrupted

### Ending 3: "The Wanderer"
- **Trigger:** Player has visited 80%+ of all non-Hidden rooms (counted as unique room IDs entered, tracked in save data) AND has key item `ancient_map` (found by searching the Ruins room). A hidden exit appears in the Ruins: "You notice a passage behind the rubble, marked on your ancient map..."
- Peaceful resolution — you leave the world behind, having seen everything
- Terminal fades to warm amber, peaceful tone plays

### Secret Ending: "The Enlightened"
- **Trigger:** Player is in Joe's Shroomy Diner and uses the items `red_mushroom`, `grey_mushroom`, `green_mushroom`, and `orange_mushroom` (all found in the Shroomy Forest and Diner rooms). Using the last one triggers the ending.
- Terminal goes full psychedelic — rainbow text, screen wobbles, game "breaks" in funny ways
- Fourth-wall breaking dialogue, credits roll sideways, joke stats screen

### Ending Data Format (`endings.json`)

```json
{
  "the_hero": {
    "trigger_type": "boss_defeated",
    "trigger_value": "evil_king",
    "title": "The Hero",
    "terminal_effect": "gold_glow",
    "text": ["...ending text lines..."]
  },
  "the_usurper": {
    "trigger_type": "choice",
    "trigger_room": "darkness_stronghold",
    "trigger_item": "dark_crown",
    "title": "The Usurper",
    "terminal_effect": "red_corruption",
    "text": ["...ending text lines..."]
  }
}
```

### Soft Gating for Endings

- Ending 2 requires finding a non-obvious item in an optional area — exploration-gated
- Ending 3 requires visiting 80%+ rooms (non-Hidden) + finding the ancient map — naturally locks behind curiosity
- Secret ending requires reaching the Hidden region (behind the Darkness, the hardest area) + collecting 4 mushroom items
- None locked behind hard doors — all gated by exploration and item discovery

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
- **Save system:** Serialize to a JSON file containing: player stats (HP, attack, defense, level, XP), inventory (items + weapons + equipped weapon), current room ID, set of visited room IDs, set of searched room IDs, set of fired `on_enter` events, per-room enemy alive/dead state, and any collected key items. Loaded on "load" command or from menu.
- **Modular effects:** `effects.lua` is a queue — anything can push an effect (shake, flash, tint) and they layer and expire independently.

### Menu & Game Over

**Title screen:** CRT boot sequence animation, then:
- New Game
- Continue (grayed out if no save exists)
- Quit

**Game over (HP reaches 0):** Screen flickers, text corrupts, "YOU HAVE FALLEN" displays. Options: Load last save, or Quit to menu. No permadeath — the save system is the player's safety net.

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
