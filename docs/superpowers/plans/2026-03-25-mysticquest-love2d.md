# MysticQuest Love2D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build MysticQuest as a Love2D terminal-aesthetic adventure game with light RPG combat, multiple endings, and a meta narrative about a corrupted school project.

**Architecture:** Data-driven game with all content in JSON files. Lua game logic organized as a state machine (menu → exploring → combat → dialogue → ending). Terminal rendering module handles all CRT aesthetics. Effects module manages visual feedback as a queue of layered effects.

**Tech Stack:** Love2D 11.5, Lua 5.1 (LuaJIT), GLSL for CRT shader, pure-Lua JSON library (dkjson or json.lua), busted for unit tests.

**Spec:** `docs/superpowers/specs/2026-03-25-mysticquest-love2d-redesign.md`

---

## File Structure

```
game/                         -- Love2D project root (this is the .love directory)
├── main.lua                  -- Entry point: love.load, love.update, love.draw, love.keypressed, love.textinput
├── conf.lua                  -- Love2D config: window 960x540, title, vsync
├── lib/
│   └── json.lua              -- Pure-Lua JSON parser (vendored, ~200 lines)
├── src/
│   ├── game.lua              -- State machine: menu, boot, exploring, combat, ending, gameover
│   ├── terminal.lua          -- Text buffer, typewriter rendering, scrolling, input line, cursor
│   ├── player.lua            -- HP, attack, defense, level, XP, inventory, equip, leveling
│   ├── combat.lua            -- Combat state, damage calc, enemy turns, flee/defend logic
│   ├── world.lua             -- Load regions from JSON, room lookup, navigation, enemy instances
│   ├── commands.lua          -- Parse input → verb + target, dispatch to handlers, all game commands
│   ├── effects.lua           -- Effect queue: shake, flash, tint, glitch, jitter. Layered, timed.
│   ├── events.lua            -- on_enter event registry: visual, dialogue, gate check, boss trigger
│   ├── endings.lua           -- Load endings.json, check triggers each turn, run ending sequences
│   ├── save.lua              -- Serialize/deserialize full game state to/from JSON file
│   └── audio.lua             -- Sound manager: ambient loops per region, SFX, optional music
├── data/
│   ├── regions/
│   │   ├── manor.json        -- ~12 rooms
│   │   ├── wilds.json        -- ~8 rooms
│   │   ├── darkness.json     -- ~8 rooms
│   │   ├── wastes.json       -- ~5 rooms
│   │   └── hidden.json       -- ~4 rooms
│   ├── weapons.json          -- ~20 weapons with attack bonus
│   ├── items.json            -- Consumables + key items
│   ├── enemies.json          -- All enemies with stats, loot, region
│   └── endings.json          -- 4 ending definitions with triggers
├── assets/
│   ├── fonts/
│   │   └── PerfectDOSVGA.ttf -- Retro monospace font
│   ├── shaders/
│   │   └── crt.glsl          -- CRT post-processing shader
│   ├── sounds/               -- SFX and ambient (added in audio task)
│   └── ascii/                -- ASCII art text files for key moments
├── tests/
│   ├── test_commands.lua     -- Command parser tests
│   ├── test_combat.lua       -- Damage formula, leveling, combat flow tests
│   ├── test_player.lua       -- Inventory, equip, level-up tests
│   ├── test_world.lua        -- Room loading, navigation tests
│   ├── test_save.lua         -- Serialize/deserialize round-trip tests
│   └── run_tests.lua         -- Simple test runner (no deps, assert-based)
└── saves/                    -- Created at runtime for save files
```

---

## Task 1: Project Setup & Love2D Skeleton

**Files:**
- Create: `game/conf.lua`
- Create: `game/main.lua`
- Create: `game/lib/json.lua`
- Create: `game/src/game.lua`

- [ ] **Step 1: Create `conf.lua`**

```lua
function love.conf(t)
    t.window.title = "MysticQuest"
    t.window.width = 960
    t.window.height = 540
    t.window.resizable = false
    t.window.vsync = 1
    t.version = "11.5"
    t.console = true -- debug console on Windows
end
```

- [ ] **Step 2: Vendor a JSON library**

Download or create `game/lib/json.lua`. Use dkjson (public domain, pure Lua, widely used with Love2D). This is a vendored dependency — copy the single file into `lib/`.

Verify: `lua -e "local json = require('lib.json'); print(json.encode({a=1}))"` should print `{"a":1}`.

- [ ] **Step 3: Create `src/game.lua` — state machine skeleton**

```lua
local Game = {}
Game.__index = Game

function Game.new()
    local self = setmetatable({}, Game)
    self.state = "boot" -- boot, menu, exploring, combat, dialogue, ending, gameover
    return self
end

function Game:update(dt)
    -- dispatch to state-specific update
end

function Game:draw()
    -- dispatch to state-specific draw
end

function Game:keypressed(key)
    -- dispatch to state-specific input
end

function Game:textinput(text)
    -- dispatch to state-specific text input
end

function Game:change_state(new_state)
    self.state = new_state
end

return Game
```

- [ ] **Step 4: Create `main.lua` — wire up Love2D callbacks**

```lua
local Game = require("src.game")

local game

function love.load()
    game = Game.new()
end

function love.update(dt)
    game:update(dt)
end

function love.draw()
    love.graphics.clear(0.05, 0.05, 0.05)
    game:draw()
end

function love.keypressed(key)
    if key == "escape" then
        love.event.quit()
    end
    game:keypressed(key)
end

function love.textinput(text)
    game:textinput(text)
end
```

- [ ] **Step 5: Run the game to verify**

Run: `love game/` from the project root.
Expected: A dark window titled "MysticQuest" that closes on Escape.

- [ ] **Step 6: Commit**

```bash
git add game/
git commit -m "feat: Love2D project skeleton with state machine"
```

---

## Task 2: Terminal Rendering Module

**Files:**
- Create: `game/src/terminal.lua`
- Modify: `game/src/game.lua`
- Modify: `game/main.lua`

**Font:** Download Perfect DOS VGA 437 (free, public domain) TTF and place in `game/assets/fonts/PerfectDOSVGA.ttf`. If unavailable, use Love2D's default font initially and swap later.

- [ ] **Step 1: Create `src/terminal.lua` — text buffer and basic rendering**

Terminal module manages:
- A text buffer (array of lines, each line is `{text, color}`)
- Max visible lines based on window height
- Scrolling when buffer exceeds visible area
- Input line with blinking cursor
- Header bar (game title, HP, level)

```lua
local Terminal = {}
Terminal.__index = Terminal

function Terminal.new(font)
    local self = setmetatable({}, Terminal)
    self.font = font
    self.char_w = font:getWidth("A")
    self.char_h = font:getHeight()
    self.cols = math.floor(920 / self.char_w)  -- usable width inside padding
    self.rows = math.floor(460 / self.char_h)  -- main area rows
    self.lines = {}         -- {text=str, color={r,g,b,a}}
    self.input = ""         -- current input string
    self.cursor_visible = true
    self.cursor_timer = 0
    self.typewriter_queue = {}  -- lines waiting to be typed out
    self.typewriter_pos = 0     -- current char position in current line
    self.typewriter_speed = 0.02 -- seconds per character
    self.typewriter_timer = 0
    self.base_color = {0.2, 1.0, 0.2, 1.0}  -- green phosphor default
    self.header = {title = "MYSTICQUEST v1.0", hp = 0, max_hp = 0, level = 0, weapon = ""}
    return self
end

function Terminal:add_line(text, color)
    -- If typewriter is idle, start typing this line
    -- Otherwise queue it
    local line = {text = text, color = color or self.base_color}
    table.insert(self.typewriter_queue, line)
end

function Terminal:add_line_instant(text, color)
    table.insert(self.lines, {text = text, color = color or self.base_color})
end

function Terminal:set_input(text)
    self.input = text
end

function Terminal:update(dt)
    -- Cursor blink
    self.cursor_timer = self.cursor_timer + dt
    if self.cursor_timer >= 0.5 then
        self.cursor_visible = not self.cursor_visible
        self.cursor_timer = 0
    end

    -- Typewriter effect
    if #self.typewriter_queue > 0 then
        self.typewriter_timer = self.typewriter_timer + dt
        if self.typewriter_timer >= self.typewriter_speed then
            self.typewriter_timer = 0
            self.typewriter_pos = self.typewriter_pos + 1
            local current = self.typewriter_queue[1]
            if self.typewriter_pos >= #current.text then
                -- Line complete, move to buffer
                table.insert(self.lines, current)
                table.remove(self.typewriter_queue, 1)
                self.typewriter_pos = 0
            end
        end
    end
end

function Terminal:is_typing()
    return #self.typewriter_queue > 0
end

function Terminal:skip_typewriter()
    -- Instantly complete all queued lines
    for _, line in ipairs(self.typewriter_queue) do
        table.insert(self.lines, line)
    end
    self.typewriter_queue = {}
    self.typewriter_pos = 0
end

function Terminal:draw()
    local pad = 20  -- padding from edges
    local y = pad

    -- Header bar
    love.graphics.setFont(self.font)
    love.graphics.setColor(self.base_color)
    local header_text = string.format("%s    HP:%d/%d  LVL:%d  %s",
        self.header.title, self.header.hp, self.header.max_hp,
        self.header.level, self.header.weapon)
    love.graphics.print(header_text, pad, y)
    y = y + self.char_h + 4

    -- Header separator
    love.graphics.setColor(self.base_color[1]*0.5, self.base_color[2]*0.5, self.base_color[3]*0.5, 1)
    love.graphics.line(pad, y, 960 - pad, y)
    y = y + 6

    -- Main text area
    local main_area_top = y
    local main_area_bottom = 540 - pad - self.char_h - 10  -- leave room for input
    local visible_rows = math.floor((main_area_bottom - main_area_top) / self.char_h)

    -- Draw completed lines (scrolled to bottom)
    local start_line = math.max(1, #self.lines - visible_rows + 1)
    local draw_y = main_area_top
    for i = start_line, #self.lines do
        local line = self.lines[i]
        love.graphics.setColor(line.color)
        love.graphics.print(line.text, pad, draw_y)
        draw_y = draw_y + self.char_h
    end

    -- Draw currently typing line (partial)
    if #self.typewriter_queue > 0 then
        local current = self.typewriter_queue[1]
        local partial = string.sub(current.text, 1, self.typewriter_pos)
        love.graphics.setColor(current.color)
        love.graphics.print(partial, pad, draw_y)
    end

    -- Input separator
    local input_y = 540 - pad - self.char_h
    love.graphics.setColor(self.base_color[1]*0.5, self.base_color[2]*0.5, self.base_color[3]*0.5, 1)
    love.graphics.line(pad, input_y - 6, 960 - pad, input_y - 6)

    -- Input line
    love.graphics.setColor(self.base_color)
    local cursor = self.cursor_visible and "_" or " "
    love.graphics.print("> " .. self.input .. cursor, pad, input_y)
end

function Terminal:clear()
    self.lines = {}
    self.typewriter_queue = {}
    self.typewriter_pos = 0
end

function Terminal:set_color(r, g, b, a)
    self.base_color = {r, g, b, a or 1}
end

return Terminal
```

- [ ] **Step 2: Wire terminal into game state machine**

Update `src/game.lua` to create a Terminal in `Game.new()` and call `terminal:update(dt)` and `terminal:draw()` from the exploring state. Add a test line on load:

```lua
-- In Game.new():
local font = love.graphics.newFont("assets/fonts/PerfectDOSVGA.ttf", 16)
-- fallback: local font = love.graphics.newFont(14)
self.terminal = Terminal.new(font)
self.terminal:add_line("Welcome to MysticQuest. Type 'help' for commands.")
```

- [ ] **Step 3: Wire text input to terminal**

In `Game:textinput(text)`, when in exploring state, append `text` to `terminal.input`. In `Game:keypressed(key)`, handle Backspace (remove last char) and Return (process command, clear input).

- [ ] **Step 4: Run and verify**

Run: `love game/`
Expected: Dark screen with green header bar, "Welcome to MysticQuest..." types out character by character, input line at bottom with blinking cursor, typing shows characters, Enter clears input.

- [ ] **Step 5: Commit**

```bash
git add game/
git commit -m "feat: terminal rendering with typewriter effect and input"
```

---

## Task 3: World System & Room Loading

**Files:**
- Create: `game/src/world.lua`
- Create: `game/data/regions/manor.json` (starter: 3 rooms)
- Create: `game/tests/test_world.lua`
- Create: `game/tests/run_tests.lua`

- [ ] **Step 1: Create test runner `tests/run_tests.lua`**

A minimal assert-based test runner that can run outside Love2D (plain Lua/LuaJIT):

```lua
-- Simple test runner. Run with: lua tests/run_tests.lua
-- Or: luajit tests/run_tests.lua
local passed = 0
local failed = 0
local errors = {}

function test(name, fn)
    local ok, err = pcall(fn)
    if ok then
        passed = passed + 1
        io.write(".")
    else
        failed = failed + 1
        table.insert(errors, {name = name, err = err})
        io.write("F")
    end
end

function eq(a, b, msg)
    if a ~= b then
        error(string.format("%s: expected %s, got %s", msg or "assertion", tostring(b), tostring(a)), 2)
    end
end

function truthy(a, msg)
    if not a then
        error(msg or "expected truthy value", 2)
    end
end

-- Run test files
local test_files = {
    "tests.test_world",
    "tests.test_commands",
    "tests.test_combat",
    "tests.test_player",
    "tests.test_save",
}

-- Adjust package path to find game modules
package.path = "game/?.lua;" .. package.path

for _, mod in ipairs(test_files) do
    local ok, err = pcall(require, mod)
    if not ok and not err:match("module .* not found") then
        print("\nError loading " .. mod .. ": " .. err)
    end
end

print(string.format("\n\n%d passed, %d failed", passed, failed))
for _, e in ipairs(errors) do
    print(string.format("FAIL: %s\n  %s", e.name, e.err))
end

os.exit(failed > 0 and 1 or 0)
```

- [ ] **Step 2: Create starter room data `data/regions/manor.json`**

```json
{
  "rooms": [
    {
      "id": "manor_entry",
      "name": "Entry",
      "region": "manor",
      "description": "You are inside the entry room of an old manor. It is reasonably large, with old chairs and a coat rack on the west wall. The walls are upholstered, and an ornate chandelier hangs from the ceiling. A window to the south is the room's only source of light.",
      "exits": {"north": "manor_entrance_hall", "south": "manor_yard"},
      "items": [],
      "enemies": [],
      "searchable": true,
      "dev_note": "// this room is so cool"
    },
    {
      "id": "manor_entrance_hall",
      "name": "Entrance Hall",
      "region": "manor",
      "description": "A faintly lit and fairly long passage. Two large glass doors stand in the center, with faint lightning visible through them. The floor is covered with a tacky bear rug. Unlit candles line the walls.",
      "exits": {"west": "manor_west_entertaining", "north": "manor_main_hall", "south": "manor_entry"},
      "items": [],
      "enemies": [],
      "searchable": false
    },
    {
      "id": "manor_yard",
      "name": "Yard",
      "region": "manor",
      "description": "The yard has not been trimmed in ages. Overgrown grass covers the paths and trees have grown wild. To the west you see a forest entrance. To the north, the manor door.",
      "exits": {"north": "manor_entry"},
      "items": [],
      "enemies": [],
      "searchable": false,
      "dev_note": "// TODO: add more exits here later"
    }
  ]
}
```

- [ ] **Step 3: Create `src/world.lua` — room loading and navigation**

```lua
local json = require("lib.json")

local World = {}
World.__index = World

function World.new()
    local self = setmetatable({}, World)
    self.rooms = {}       -- room_id -> room table
    self.regions = {}     -- region_name -> list of room_ids
    return self
end

function World:load_region_from_string(json_string)
    local data = json.decode(json_string)
    if not data or not data.rooms then return false end
    for _, room in ipairs(data.rooms) do
        self.rooms[room.id] = room
        if not self.regions[room.region] then
            self.regions[room.region] = {}
        end
        table.insert(self.regions[room.region], room.id)
    end
    return true
end

function World:load_regions(directory)
    -- Love2D filesystem: enumerate and load all .json files in directory
    local files = love.filesystem.getDirectoryItems(directory)
    for _, file in ipairs(files) do
        if file:match("%.json$") then
            local content = love.filesystem.read(directory .. "/" .. file)
            if content then
                self:load_region_from_string(content)
            end
        end
    end
end

function World:get_room(room_id)
    return self.rooms[room_id]
end

function World:get_exits(room_id)
    local room = self.rooms[room_id]
    if not room then return {} end
    return room.exits or {}
end

function World:get_adjacent_room(room_id, direction)
    local exits = self:get_exits(room_id)
    return exits[direction]
end

function World:room_count()
    local count = 0
    for _ in pairs(self.rooms) do count = count + 1 end
    return count
end

function World:non_hidden_room_count()
    local count = 0
    for _, room in pairs(self.rooms) do
        if room.region ~= "hidden" then count = count + 1 end
    end
    return count
end

return World
```

- [ ] **Step 4: Write world tests `tests/test_world.lua`**

```lua
-- Tests for world.lua (runs outside Love2D)
-- Requires test runner globals: test, eq, truthy

-- We need to mock love.filesystem for testing outside Love2D
-- For now, test load_region_from_string directly

package.path = "game/?.lua;" .. package.path
local World = require("src.world")

local test_json = [[
{
  "rooms": [
    {
      "id": "test_room_a",
      "name": "Room A",
      "region": "test",
      "description": "A test room.",
      "exits": {"north": "test_room_b"},
      "items": [],
      "enemies": [],
      "searchable": true
    },
    {
      "id": "test_room_b",
      "name": "Room B",
      "region": "test",
      "description": "Another test room.",
      "exits": {"south": "test_room_a"},
      "items": ["potion"],
      "enemies": ["rat"],
      "searchable": false
    }
  ]
}
]]

test("World loads rooms from JSON string", function()
    local world = World.new()
    local ok = world:load_region_from_string(test_json)
    truthy(ok, "load should succeed")
    eq(world:room_count(), 2, "room count")
end)

test("World:get_room returns correct room", function()
    local world = World.new()
    world:load_region_from_string(test_json)
    local room = world:get_room("test_room_a")
    truthy(room, "room should exist")
    eq(room.name, "Room A", "room name")
    eq(room.region, "test", "room region")
end)

test("World:get_room returns nil for missing room", function()
    local world = World.new()
    world:load_region_from_string(test_json)
    eq(world:get_room("nonexistent"), nil, "missing room")
end)

test("World:get_adjacent_room returns connected room", function()
    local world = World.new()
    world:load_region_from_string(test_json)
    eq(world:get_adjacent_room("test_room_a", "north"), "test_room_b", "north exit")
end)

test("World:get_adjacent_room returns nil for invalid direction", function()
    local world = World.new()
    world:load_region_from_string(test_json)
    eq(world:get_adjacent_room("test_room_a", "west"), nil, "no west exit")
end)

test("World tracks regions", function()
    local world = World.new()
    world:load_region_from_string(test_json)
    truthy(world.regions["test"], "region should exist")
    eq(#world.regions["test"], 2, "region room count")
end)
```

- [ ] **Step 5: Run tests**

Run: `cd game && lua tests/run_tests.lua`
Expected: All world tests pass. Other test files not found yet (that's fine).

- [ ] **Step 6: Wire world into game — display room on load**

In `Game.new()`, create `self.world = World.new()` and load regions. Set `self.current_room = "manor_entry"`. When entering exploring state, display the current room's name and description in the terminal.

- [ ] **Step 7: Run game and verify**

Run: `love game/`
Expected: Boot into exploring state. Terminal shows "Entry" room name and description with typewriter effect.

- [ ] **Step 8: Commit**

```bash
git add game/
git commit -m "feat: world system with JSON room loading and navigation"
```

---

## Task 4: Command Parser & Movement

**Files:**
- Create: `game/src/commands.lua`
- Create: `game/tests/test_commands.lua`
- Modify: `game/src/game.lua`

- [ ] **Step 1: Create `src/commands.lua`**

```lua
local Commands = {}
Commands.__index = Commands

-- Direction shortcuts
local DIR_SHORTCUTS = {
    n = "north", s = "south", e = "east", w = "west", u = "up", d = "down",
    north = "north", south = "south", east = "east", west = "west", up = "up", down = "down"
}

-- Verb aliases
local VERB_ALIASES = {
    move = "go", get = "take", ["pick up"] = "take",
    fight = "attack", hit = "attack",
    block = "defend",
    run = "flee",
    l = "look", i = "inventory",
    ["?"] = "help", q = "quit",
    equip = "use", examine = "search", status = "stats"
}

function Commands.parse(input)
    local trimmed = input:match("^%s*(.-)%s*$"):lower()
    if trimmed == "" then return nil, nil end

    -- Check direction shortcuts first
    if DIR_SHORTCUTS[trimmed] then
        return "go", DIR_SHORTCUTS[trimmed]
    end

    -- Split into verb and target
    local verb, target = trimmed:match("^(%S+)%s*(.*)")
    if not verb then return nil, nil end

    -- Handle "pick up" as two-word verb
    if verb == "pick" and target:match("^up%s") then
        verb = "pick up"
        target = target:match("^up%s+(.*)")
    elseif verb == "pick" and target == "up" then
        return "take", ""
    end

    -- Resolve aliases
    verb = VERB_ALIASES[verb] or verb

    -- Resolve direction in "go <dir>"
    if verb == "go" and DIR_SHORTCUTS[target] then
        target = DIR_SHORTCUTS[target]
    end

    return verb, target or ""
end

return Commands
```

- [ ] **Step 2: Write command parser tests `tests/test_commands.lua`**

```lua
package.path = "game/?.lua;" .. package.path
local Commands = require("src.commands")

test("parse direction shortcut 'n'", function()
    local verb, target = Commands.parse("n")
    eq(verb, "go", "verb")
    eq(target, "north", "target")
end)

test("parse 'go north'", function()
    local verb, target = Commands.parse("go north")
    eq(verb, "go", "verb")
    eq(target, "north", "target")
end)

test("parse 'take iron sword'", function()
    local verb, target = Commands.parse("take iron sword")
    eq(verb, "take", "verb")
    eq(target, "iron sword", "target")
end)

test("parse alias 'get potion'", function()
    local verb, target = Commands.parse("get potion")
    eq(verb, "take", "verb")
    eq(target, "potion", "target")
end)

test("parse alias 'fight rat'", function()
    local verb, target = Commands.parse("fight rat")
    eq(verb, "attack", "verb")
    eq(target, "rat", "target")
end)

test("parse 'i' as inventory", function()
    local verb, target = Commands.parse("i")
    eq(verb, "inventory", "verb")
end)

test("parse empty input", function()
    local verb, target = Commands.parse("")
    eq(verb, nil, "verb should be nil")
end)

test("parse is case insensitive", function()
    local verb, target = Commands.parse("GO North")
    eq(verb, "go", "verb")
    eq(target, "north", "target")
end)

test("parse 'pick up sword'", function()
    local verb, target = Commands.parse("pick up sword")
    eq(verb, "take", "verb")
    eq(target, "sword", "target")
end)
```

- [ ] **Step 3: Run tests**

Run: `cd game && lua tests/run_tests.lua`
Expected: All command parser tests pass.

- [ ] **Step 4: Wire commands into game — movement working**

In `Game`, when player presses Enter with input:
1. Parse with `Commands.parse(input)`
2. For `go` verb: check `world:get_adjacent_room(current_room, target)`. If valid, move player, display new room. If not, display "You can't go that way."
3. For `look`: redisplay current room.
4. For `help`: display command list.
5. For `quit`: `love.event.quit()`.
6. Unknown verb: "I don't understand that."

- [ ] **Step 5: Run and verify movement**

Run: `love game/`
Expected: Can type `n` to go north from Entry to Entrance Hall. `s` goes back. `look` redisplays room. `w` in Entry says "You can't go that way." `help` shows commands.

- [ ] **Step 6: Commit**

```bash
git add game/
git commit -m "feat: command parser with movement and basic commands"
```

---

## Task 5: Player System

**Files:**
- Create: `game/src/player.lua`
- Create: `game/tests/test_player.lua`
- Create: `game/data/weapons.json` (starter weapons)
- Create: `game/data/items.json` (starter items)

- [ ] **Step 1: Create `src/player.lua`**

```lua
local Player = {}
Player.__index = Player

function Player.new(start_room)
    local self = setmetatable({}, Player)
    self.hp = 30
    self.max_hp = 30
    self.attack = 5
    self.defense = 2
    self.level = 1
    self.xp = 0
    self.current_room = start_room
    self.inventory = {}       -- item_id -> count
    self.weapons = {}         -- list of weapon_id
    self.equipped_weapon = nil -- weapon_id or nil
    self.equipped_shield = nil -- item_id or nil
    self.key_items = {}       -- set of item_id -> true
    self.visited_rooms = {}   -- set of room_id -> true
    self.searched_rooms = {}  -- set of room_id -> true
    self.fired_events = {}    -- set of event_key -> true
    self.defending = false    -- true if defend was chosen this round
    self.buff_attack = 0      -- temporary attack buff
    self.buff_rounds = 0      -- rounds remaining on buff
    return self
end

function Player:total_attack()
    return self.attack + self.buff_attack
    -- weapon bonus added during combat from weapon data
end

function Player:total_defense()
    return self.defense
    -- shield bonus added from item data
end

function Player:xp_to_next_level()
    return self.level * 25
end

function Player:add_xp(amount)
    self.xp = self.xp + amount
    local leveled = false
    while self.xp >= self:xp_to_next_level() and self.level < 15 do
        self.xp = self.xp - self:xp_to_next_level()
        self.level = self.level + 1
        self.max_hp = self.max_hp + 8
        self.hp = self.hp + 8  -- heal on level up
        self.attack = self.attack + 2
        self.defense = self.defense + 1
        leveled = true
    end
    return leveled
end

function Player:add_item(item_id, item_data)
    if item_data.type == "key" then
        self.key_items[item_id] = true
    else
        self.inventory[item_id] = (self.inventory[item_id] or 0) + 1
    end
end

function Player:remove_item(item_id)
    if self.inventory[item_id] then
        self.inventory[item_id] = self.inventory[item_id] - 1
        if self.inventory[item_id] <= 0 then
            self.inventory[item_id] = nil
        end
        return true
    end
    return false
end

function Player:has_item(item_id)
    return self.inventory[item_id] and self.inventory[item_id] > 0
end

function Player:has_key_item(item_id)
    return self.key_items[item_id] == true
end

function Player:add_weapon(weapon_id)
    table.insert(self.weapons, weapon_id)
end

function Player:equip_weapon(weapon_id)
    for _, w in ipairs(self.weapons) do
        if w == weapon_id then
            self.equipped_weapon = weapon_id
            return true
        end
    end
    return false
end

function Player:visit_room(room_id)
    self.visited_rooms[room_id] = true
end

function Player:has_visited(room_id)
    return self.visited_rooms[room_id] == true
end

function Player:visited_count()
    local count = 0
    for _ in pairs(self.visited_rooms) do count = count + 1 end
    return count
end

function Player:heal(amount)
    self.hp = math.min(self.hp + amount, self.max_hp)
end

function Player:take_damage(amount)
    if self.defending then
        amount = math.max(1, math.floor(amount / 2))
        self.defending = false
    end
    self.hp = self.hp - amount
    return amount  -- return actual damage taken
end

function Player:is_dead()
    return self.hp <= 0
end

return Player
```

- [ ] **Step 2: Write player tests `tests/test_player.lua`**

```lua
package.path = "game/?.lua;" .. package.path
local Player = require("src.player")

test("Player starts with correct stats", function()
    local p = Player.new("test_room")
    eq(p.hp, 30, "hp")
    eq(p.attack, 5, "attack")
    eq(p.defense, 2, "defense")
    eq(p.level, 1, "level")
    eq(p.xp, 0, "xp")
end)

test("Player:xp_to_next_level scales with level", function()
    local p = Player.new("test_room")
    eq(p:xp_to_next_level(), 25, "level 1")
    p.level = 5
    eq(p:xp_to_next_level(), 125, "level 5")
end)

test("Player:add_xp triggers level up", function()
    local p = Player.new("test_room")
    local leveled = p:add_xp(25)
    truthy(leveled, "should level up")
    eq(p.level, 2, "level after xp")
    eq(p.max_hp, 38, "max_hp after level up")
    eq(p.attack, 7, "attack after level up")
    eq(p.defense, 3, "defense after level up")
end)

test("Player:add_xp handles multiple level ups", function()
    local p = Player.new("test_room")
    p:add_xp(100) -- 25 for L2, 50 for L3, leftover 25
    eq(p.level, 3, "level after big xp gain")
end)

test("Player:add_xp caps at level 15", function()
    local p = Player.new("test_room")
    p.level = 14
    p.xp = 0
    p:add_xp(99999)
    eq(p.level, 15, "should cap at 15")
end)

test("Player:take_damage with defend halves damage", function()
    local p = Player.new("test_room")
    p.defending = true
    local actual = p:take_damage(10)
    eq(actual, 5, "half damage")
    eq(p.hp, 25, "hp after defended hit")
    eq(p.defending, false, "defending cleared")
end)

test("Player:take_damage defend min 1", function()
    local p = Player.new("test_room")
    p.defending = true
    local actual = p:take_damage(1)
    eq(actual, 1, "min 1 damage")
end)

test("Player inventory add and remove", function()
    local p = Player.new("test_room")
    p:add_item("potion", {type = "consumable"})
    truthy(p:has_item("potion"), "should have potion")
    p:remove_item("potion")
    eq(p:has_item("potion"), false, "should not have potion")
end)

test("Player key items tracked separately", function()
    local p = Player.new("test_room")
    p:add_item("dark_crown", {type = "key"})
    truthy(p:has_key_item("dark_crown"), "should have key item")
    eq(p:has_item("dark_crown"), false, "not in regular inventory")
end)

test("Player:heal caps at max_hp", function()
    local p = Player.new("test_room")
    p.hp = 10
    p:heal(999)
    eq(p.hp, 30, "capped at max_hp")
end)

test("Player:visited_count tracks rooms", function()
    local p = Player.new("test_room")
    p:visit_room("room_a")
    p:visit_room("room_b")
    p:visit_room("room_a") -- duplicate
    eq(p:visited_count(), 2, "unique rooms only")
end)
```

- [ ] **Step 3: Create starter `data/weapons.json`**

```json
{
  "rusty_dagger": {
    "name": "Rusty Dagger",
    "attack_bonus": 2,
    "region": "manor",
    "description": "A dull blade with spots of rust. Better than nothing."
  },
  "iron_sword": {
    "name": "Iron Sword",
    "attack_bonus": 5,
    "region": "manor",
    "description": "A solid iron sword. Reliable."
  },
  "steel_sword": {
    "name": "Steel Sword",
    "attack_bonus": 8,
    "region": "wilds",
    "description": "A well-forged steel blade."
  }
}
```

- [ ] **Step 4: Create starter `data/items.json`**

```json
{
  "small_potion": {
    "name": "Small Potion",
    "type": "consumable",
    "effect": "heal",
    "value": 10,
    "description": "A small vial of red liquid. Restores 10 HP."
  },
  "potion": {
    "name": "Potion",
    "type": "consumable",
    "effect": "heal",
    "value": 25,
    "description": "A vial of red liquid. Restores 25 HP."
  },
  "rusty_key": {
    "name": "Rusty Key",
    "type": "key",
    "description": "An old iron key. It might open something in the manor."
  }
}
```

- [ ] **Step 5: Run tests**

Run: `cd game && lua tests/run_tests.lua`
Expected: All player tests pass.

- [ ] **Step 6: Wire player into game — inventory and stats commands**

In `Game`, create player on new game. Wire `inventory`, `stats`, `take`, `use`/`equip`, `search` commands. Update terminal header bar with player stats each frame.

- [ ] **Step 7: Run and verify**

Run: `love game/`
Expected: `stats` shows player HP/ATK/DEF/LVL/XP. `inventory` shows empty. Header bar updates with stats. `search` in Entry shows dev note and any items.

- [ ] **Step 8: Commit**

```bash
git add game/
git commit -m "feat: player system with stats, inventory, leveling, items, weapons"
```

---

## Task 6: Combat System

**Files:**
- Create: `game/src/combat.lua`
- Create: `game/data/enemies.json` (starter enemies)
- Create: `game/tests/test_combat.lua`
- Modify: `game/src/game.lua`

- [ ] **Step 1: Create starter `data/enemies.json`**

```json
{
  "shadow_rat": {
    "name": "Shadow Rat",
    "hp": 10,
    "attack": 3,
    "defense": 1,
    "xp": 8,
    "loot": ["small_potion"],
    "region": "manor",
    "description": "A rat wreathed in unnatural shadow."
  },
  "cellar_shade": {
    "name": "Cellar Shade",
    "hp": 35,
    "attack": 7,
    "defense": 3,
    "xp": 30,
    "loot": [],
    "loot_weapon": "iron_sword",
    "region": "manor",
    "description": "A dark, shifting mass that clings to the cellar walls.",
    "is_boss": true
  }
}
```

- [ ] **Step 2: Create `src/combat.lua`**

```lua
local Combat = {}
Combat.__index = Combat

function Combat.new(player, enemy_instance, weapon_data, item_data)
    local self = setmetatable({}, Combat)
    self.player = player
    self.enemy = enemy_instance  -- {id, name, hp, max_hp, attack, defense, xp, loot, is_boss, rounds=0}
    self.weapon_data = weapon_data  -- weapons.json lookup
    self.item_data = item_data      -- items.json lookup
    self.round = 0
    self.finished = false
    self.result = nil  -- "win", "lose", "fled"
    self.messages = {}
    return self
end

function Combat:calc_damage(atk, def)
    local roll = math.random(-2, 2)
    local damage = math.max(1, atk - def + roll)
    local crit = math.random() < 0.10
    if crit then damage = damage * 2 end
    return damage, crit
end

function Combat:get_player_attack()
    local base = self.player:total_attack()
    if self.player.equipped_weapon and self.weapon_data[self.player.equipped_weapon] then
        base = base + self.weapon_data[self.player.equipped_weapon].attack_bonus
    end
    return base
end

function Combat:get_player_defense()
    local base = self.player:total_defense()
    -- Shield bonus would be added here
    return base
end

function Combat:player_attack()
    self.round = self.round + 1
    local atk = self:get_player_attack()
    local damage, crit = self:calc_damage(atk, self.enemy.defense)
    self.enemy.hp = self.enemy.hp - damage

    local msg = string.format("You hit the %s for %d damage!", self.enemy.name, damage)
    if crit then msg = msg .. " CRITICAL HIT!" end
    table.insert(self.messages, msg)

    if self.enemy.hp <= 0 then
        self:enemy_defeated()
        return
    end

    self:enemy_turn()
end

function Combat:player_defend()
    self.round = self.round + 1
    self.player.defending = true
    table.insert(self.messages, "You brace yourself.")
    self:enemy_turn()
end

function Combat:player_flee()
    self.round = self.round + 1
    if math.random() < 0.70 then
        table.insert(self.messages, "You flee from combat!")
        self.finished = true
        self.result = "fled"
    else
        table.insert(self.messages, "You failed to escape!")
        self:enemy_turn()
    end
end

function Combat:player_use_item(item_id)
    self.round = self.round + 1
    local item = self.item_data[item_id]
    if not item then
        table.insert(self.messages, "You don't have that.")
        return
    end
    if item.effect == "heal" then
        self.player:heal(item.value)
        self.player:remove_item(item_id)
        table.insert(self.messages, string.format("You use %s. Restored %d HP.", item.name, item.value))
    end
    self:enemy_turn()
end

function Combat:enemy_turn()
    local atk = self.enemy.attack
    -- Boss special every 3 rounds
    local special = self.enemy.is_boss and (self.round % 3 == 0)
    if special then
        atk = math.floor(atk * 1.5)
    end

    local damage, crit = self:calc_damage(atk, self:get_player_defense())
    local actual = self.player:take_damage(damage)

    local msg = string.format("The %s hits you for %d damage!", self.enemy.name, actual)
    if crit then msg = msg .. " CRITICAL!" end
    if special then msg = "The " .. self.enemy.name .. " unleashes a powerful attack! " .. msg end
    table.insert(self.messages, msg)

    if self.player:is_dead() then
        self.finished = true
        self.result = "lose"
        table.insert(self.messages, "You have been defeated!")
    end
end

function Combat:enemy_defeated()
    self.finished = true
    self.result = "win"
    table.insert(self.messages, string.format("You defeated the %s!", self.enemy.name))

    local leveled = self.player:add_xp(self.enemy.xp)
    table.insert(self.messages, string.format("Gained %d XP.", self.enemy.xp))
    if leveled then
        table.insert(self.messages, string.format("LEVEL UP! You are now level %d!", self.player.level))
    end
end

function Combat:get_messages()
    local msgs = self.messages
    self.messages = {}
    return msgs
end

return Combat
```

- [ ] **Step 3: Write combat tests `tests/test_combat.lua`**

```lua
package.path = "game/?.lua;" .. package.path
local Player = require("src.player")
local Combat = require("src.combat")

local weapon_data = {
    rusty_dagger = {name = "Rusty Dagger", attack_bonus = 2}
}

local item_data = {
    small_potion = {name = "Small Potion", type = "consumable", effect = "heal", value = 10}
}

local function make_enemy()
    return {id = "test_rat", name = "Rat", hp = 10, max_hp = 10, attack = 3, defense = 1, xp = 8, loot = {"small_potion"}, is_boss = false}
end

test("Combat:calc_damage minimum 1", function()
    local p = Player.new("test")
    local c = Combat.new(p, make_enemy(), weapon_data, item_data)
    -- Force scenario: atk=1, def=100 -> should be 1 minimum
    for i = 1, 20 do
        local d, _ = c:calc_damage(1, 100)
        truthy(d >= 1, "damage should be at least 1")
    end
end)

test("Combat player attack reduces enemy HP", function()
    local p = Player.new("test")
    p.equipped_weapon = "rusty_dagger"
    local enemy = make_enemy()
    local c = Combat.new(p, enemy, weapon_data, item_data)
    local before = enemy.hp
    c:player_attack()
    truthy(enemy.hp < before, "enemy should take damage")
end)

test("Combat defend halves next damage", function()
    local p = Player.new("test")
    local enemy = make_enemy()
    local c = Combat.new(p, enemy, weapon_data, item_data)
    c:player_defend()
    -- Player should have defending=false after enemy turn (consumed by take_damage)
    eq(p.defending, false, "defending consumed after enemy turn")
end)

test("Combat enemy defeated grants XP", function()
    local p = Player.new("test")
    p.attack = 100 -- one-shot the enemy
    local enemy = make_enemy()
    local c = Combat.new(p, enemy, weapon_data, item_data)
    c:player_attack()
    truthy(c.finished, "combat should be finished")
    eq(c.result, "win", "should win")
    truthy(p.xp > 0, "should have gained xp")
end)

test("Combat flee has 70% chance", function()
    local p = Player.new("test")
    local enemy = make_enemy()
    local fled_count = 0
    for i = 1, 100 do
        local e = {id = "rat", name = "Rat", hp = 10, max_hp = 10, attack = 3, defense = 1, xp = 8, loot = {}, is_boss = false}
        local pp = Player.new("test")
        pp.hp = 999 -- survive any hit
        local c = Combat.new(pp, e, weapon_data, item_data)
        c:player_flee()
        if c.result == "fled" then fled_count = fled_count + 1 end
    end
    -- With 100 trials, 70% chance should give us roughly 50-90 successes
    truthy(fled_count > 40, "flee should succeed often, got " .. fled_count)
    truthy(fled_count < 95, "flee should sometimes fail, got " .. fled_count)
end)
```

- [ ] **Step 4: Run tests**

Run: `cd game && lua tests/run_tests.lua`
Expected: All combat tests pass.

- [ ] **Step 5: Wire combat into game state machine**

When player types `attack <enemy>` in a room with enemies:
1. Create enemy instance from `enemies.json` data
2. Switch game state to `combat`
3. In combat state, accept: attack, defend, flee, use <item>
4. Display combat messages in terminal
5. On win: remove enemy from room, drop loot
6. On lose: switch to gameover state
7. On fled: return to exploring state

- [ ] **Step 6: Add a shadow_rat to manor_entry room data**

Update `data/regions/manor.json` to include `"enemies": ["shadow_rat"]` in the Entry room for testing.

- [ ] **Step 7: Run and verify combat**

Run: `love game/`
Expected: Entering the Entry room shows "A Shadow Rat lurks here." Typing `attack shadow rat` enters combat. Can attack, defend, flee. Defeating it drops a Small Potion and grants XP.

- [ ] **Step 8: Commit**

```bash
git add game/
git commit -m "feat: combat system with attack, defend, flee, items, bosses"
```

---

## Task 7: Effects System

**Files:**
- Create: `game/src/effects.lua`
- Modify: `game/src/terminal.lua`
- Modify: `game/src/game.lua`

- [ ] **Step 1: Create `src/effects.lua`**

Effect queue where effects are pushed with a duration and type. Multiple effects can layer. Each effect modifies rendering parameters.

```lua
local Effects = {}
Effects.__index = Effects

function Effects.new()
    local self = setmetatable({}, Effects)
    self.active = {}  -- list of {type, duration, elapsed, params}
    self.shake = {x = 0, y = 0}
    self.flash = {r = 0, g = 0, b = 0, a = 0}
    self.tint = {r = 0, g = 0, b = 0, a = 0}
    self.glitch = 0        -- 0-1 intensity
    self.jitter = 0        -- 0-1 intensity for text jitter
    return self
end

function Effects:push(effect_type, duration, params)
    table.insert(self.active, {
        type = effect_type,
        duration = duration,
        elapsed = 0,
        params = params or {}
    })
end

function Effects:update(dt)
    -- Reset per-frame values
    self.shake.x = 0
    self.shake.y = 0
    self.flash.a = 0
    self.glitch = 0
    self.jitter = 0

    -- Update active effects
    local i = 1
    while i <= #self.active do
        local e = self.active[i]
        e.elapsed = e.elapsed + dt

        if e.elapsed >= e.duration then
            table.remove(self.active, i)
        else
            local progress = e.elapsed / e.duration

            if e.type == "shake" then
                local intensity = (e.params.intensity or 5) * (1 - progress)
                self.shake.x = (math.random() - 0.5) * intensity * 2
                self.shake.y = (math.random() - 0.5) * intensity * 2

            elseif e.type == "flash" then
                local fade = 1 - progress
                self.flash.r = (e.params.r or 1) * fade
                self.flash.g = (e.params.g or 0) * fade
                self.flash.b = (e.params.b or 0) * fade
                self.flash.a = fade * 0.3

            elseif e.type == "glitch" then
                self.glitch = (e.params.intensity or 0.5) * (1 - progress)

            elseif e.type == "jitter" then
                self.jitter = e.params.intensity or 0.3
            end

            i = i + 1
        end
    end
end

-- Persistent region tint (not in the queue, set directly)
function Effects:set_region_tint(r, g, b, a)
    self.tint = {r = r, g = g, b = b, a = a or 0.1}
end

function Effects:clear_region_tint()
    self.tint = {r = 0, g = 0, b = 0, a = 0}
end

return Effects
```

- [ ] **Step 2: Integrate effects into terminal rendering**

Modify `terminal.lua` to accept an effects reference. In `Terminal:draw()`:
- Apply `effects.shake` as offset to all drawing
- Draw `effects.flash` as a colored overlay rectangle
- Apply `effects.jitter` as random per-line x offset
- Apply `effects.glitch` as occasional skipped/duplicated lines

- [ ] **Step 3: Wire effects into game events**

- On player taking damage: `effects:push("shake", 0.3, {intensity = 4})` + `effects:push("flash", 0.2, {r=1, g=0, b=0})`
- On critical hit: `effects:push("flash", 0.3, {r=1, g=1, b=1})`
- On low HP (<30%): `effects:push("jitter", 1.0, {intensity = 0.2})`
- On entering new room: `effects:push("flash", 0.1, {r=0.2, g=1, b=0.2})`

- [ ] **Step 4: Add region tint on room change**

When player moves to a new room, set region tint based on `room.region`:
- manor: `set_region_tint(0, 0.15, 0, 0.05)` (slight green)
- wilds: clear tint (bright default)
- darkness: `set_region_tint(0.2, 0, 0, 0.1)` (red tint)
- wastes: `set_region_tint(0.15, 0.1, 0, 0.05)` (amber)
- hidden: cycle rainbow (handle in update)

- [ ] **Step 5: Run and verify effects**

Run: `love game/`
Expected: Taking damage in combat shakes the screen and flashes red. Entering rooms has a subtle flash. Low HP causes text jitter.

- [ ] **Step 6: Commit**

```bash
git add game/
git commit -m "feat: effects system with shake, flash, glitch, tint, jitter"
```

---

## Task 8: Events System

**Files:**
- Create: `game/src/events.lua`
- Modify: `game/src/game.lua`

- [ ] **Step 1: Create `src/events.lua`**

```lua
local Events = {}
Events.__index = Events

function Events.new(effects)
    local self = setmetatable({}, Events)
    self.effects = effects
    self.dialogues = {}  -- key -> text string (loaded from data or hardcoded)
    return self
end

function Events:fire(event_string, player, world, terminal)
    -- Parse event string
    local event_type, param = event_string:match("^(%w+):?(.*)")

    if event_type == "flicker_lights" then
        self.effects:push("flash", 0.5, {r=0.2, g=1, b=0.2})
        self.effects:push("glitch", 0.3, {intensity=0.3})
        return true

    elseif event_type == "screen_glitch" then
        self.effects:push("glitch", 1.0, {intensity=0.7})
        return true

    elseif event_type == "fade_to_black" then
        self.effects:push("flash", 1.5, {r=0, g=0, b=0})
        return true

    elseif event_type == "dialogue" then
        local text = self.dialogues[param]
        if text then
            terminal:add_line(text, {0.8, 0.8, 0.2, 1})
        end
        return true

    elseif event_type == "require" then
        -- Gate check: return false if player lacks item
        if not player:has_key_item(param) and not player:has_item(param) then
            return false, "You need something to get through here..."
        end
        return true

    elseif event_type == "boss" then
        -- Return the enemy ID to trigger combat
        return true, "boss:" .. param
    end

    return true
end

return Events
```

- [ ] **Step 2: Wire events into room entry in game.lua**

When player moves to a new room:
1. Check if room has `on_enter` event
2. Check if event has already fired (`player.fired_events`)
3. If not fired, call `events:fire(event_string, ...)`
4. For gate checks: if returns false, cancel the move
5. For boss triggers: enter combat immediately
6. Mark event as fired in `player.fired_events`

- [ ] **Step 3: Test with manor rooms**

Add `"on_enter": "flicker_lights"` to one manor room. Add `"on_enter": "require:rusty_key"` to another. Verify the flicker plays on first entry only, and the gate blocks without the key.

- [ ] **Step 4: Run and verify**

Run: `love game/`
Expected: Entering a room with `flicker_lights` triggers a visual flash. Gate-checked room blocks entry without the key item. Events only fire once.

- [ ] **Step 5: Commit**

```bash
git add game/
git commit -m "feat: event system with visual, dialogue, gate, boss triggers"
```

---

## Task 9: Save/Load System

**Files:**
- Create: `game/src/save.lua`
- Create: `game/tests/test_save.lua`
- Modify: `game/src/game.lua`

- [ ] **Step 1: Create `src/save.lua`**

```lua
local json = require("lib.json")

local Save = {}

function Save.serialize(player, world)
    local data = {
        version = 1,
        player = {
            hp = player.hp,
            max_hp = player.max_hp,
            attack = player.attack,
            defense = player.defense,
            level = player.level,
            xp = player.xp,
            current_room = player.current_room,
            inventory = player.inventory,
            weapons = player.weapons,
            equipped_weapon = player.equipped_weapon,
            equipped_shield = player.equipped_shield,
            key_items = player.key_items,
            visited_rooms = player.visited_rooms,
            searched_rooms = player.searched_rooms,
            fired_events = player.fired_events,
            buff_attack = player.buff_attack,
            buff_rounds = player.buff_rounds,
        },
        world_state = {
            dead_enemies = {}  -- room_id -> {enemy_id -> true}
        }
    }

    -- Collect dead enemy state from world
    for room_id, room in pairs(world.rooms) do
        if room._dead_enemies then
            data.world_state.dead_enemies[room_id] = room._dead_enemies
        end
    end

    return json.encode(data)
end

function Save.deserialize(json_string, player, world)
    local data = json.decode(json_string)
    if not data or data.version ~= 1 then return false end

    -- Restore player
    local p = data.player
    player.hp = p.hp
    player.max_hp = p.max_hp
    player.attack = p.attack
    player.defense = p.defense
    player.level = p.level
    player.xp = p.xp
    player.current_room = p.current_room
    player.inventory = p.inventory or {}
    player.weapons = p.weapons or {}
    player.equipped_weapon = p.equipped_weapon
    player.equipped_shield = p.equipped_shield
    player.key_items = p.key_items or {}
    player.visited_rooms = p.visited_rooms or {}
    player.searched_rooms = p.searched_rooms or {}
    player.fired_events = p.fired_events or {}
    player.buff_attack = p.buff_attack or 0
    player.buff_rounds = p.buff_rounds or 0

    -- Restore world state
    if data.world_state and data.world_state.dead_enemies then
        for room_id, enemies in pairs(data.world_state.dead_enemies) do
            if world.rooms[room_id] then
                world.rooms[room_id]._dead_enemies = enemies
            end
        end
    end

    return true
end

function Save.save_to_file(player, world, filename)
    local data = Save.serialize(player, world)
    local success = love.filesystem.write(filename or "save.json", data)
    return success
end

function Save.load_from_file(player, world, filename)
    local content = love.filesystem.read(filename or "save.json")
    if not content then return false end
    return Save.deserialize(content, player, world)
end

function Save.save_exists(filename)
    return love.filesystem.getInfo(filename or "save.json") ~= nil
end

return Save
```

- [ ] **Step 2: Write save/load tests `tests/test_save.lua`**

```lua
package.path = "game/?.lua;" .. package.path
local Player = require("src.player")
local World = require("src.world")
local Save = require("src.save")

test("Save round-trip preserves player state", function()
    local p1 = Player.new("room_a")
    p1.hp = 20
    p1.level = 3
    p1.xp = 15
    p1.attack = 11
    p1.defense = 5
    p1:add_item("potion", {type = "consumable"})
    p1:add_item("dark_crown", {type = "key"})
    p1:visit_room("room_a")
    p1:visit_room("room_b")

    local world = World.new()
    local json_str = Save.serialize(p1, world)

    local p2 = Player.new("start")
    local w2 = World.new()
    local ok = Save.deserialize(json_str, p2, w2)

    truthy(ok, "deserialize should succeed")
    eq(p2.hp, 20, "hp")
    eq(p2.level, 3, "level")
    eq(p2.xp, 15, "xp")
    eq(p2.current_room, "room_a", "current_room")
    truthy(p2:has_item("potion"), "has potion")
    truthy(p2:has_key_item("dark_crown"), "has key item")
    truthy(p2:has_visited("room_b"), "visited room_b")
end)
```

- [ ] **Step 3: Run tests**

Run: `cd game && lua tests/run_tests.lua`
Expected: Save round-trip test passes.

- [ ] **Step 4: Wire save/load commands in game**

`save` command: call `Save.save_to_file(player, world)`, display "Game saved."
`load` command: call `Save.load_from_file(player, world)`, redisplay current room, display "Game loaded."

- [ ] **Step 5: Run and verify**

Run: `love game/`
Expected: `save` writes file, `load` restores state. Player can quit and reload.

- [ ] **Step 6: Commit**

```bash
git add game/
git commit -m "feat: save/load system with full state serialization"
```

---

## Task 10: CRT Shader

**Files:**
- Create: `game/assets/shaders/crt.glsl`
- Modify: `game/main.lua`

- [ ] **Step 1: Create `assets/shaders/crt.glsl`**

GLSL fragment shader for CRT post-processing. Applied to the full-screen canvas.

```glsl
// CRT shader for Love2D
// Applies scanlines, curvature, vignette, and subtle bloom

extern vec2 resolution;
extern float time;
extern float scanline_intensity;  // 0.0-1.0
extern float curvature;           // 0.0-1.0
extern float vignette_intensity;  // 0.0-1.0

vec2 curve(vec2 uv) {
    uv = uv * 2.0 - 1.0;
    vec2 offset = abs(uv.yx) / vec2(curvature * 6.0 + 6.0);
    uv = uv + uv * offset * offset;
    uv = uv * 0.5 + 0.5;
    return uv;
}

vec4 effect(vec4 color, Image tex, vec2 texture_coords, vec2 screen_coords) {
    vec2 uv = curve(texture_coords);

    // Out of bounds = black
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        return vec4(0.0, 0.0, 0.0, 1.0);
    }

    vec4 col = Texel(tex, uv);

    // Scanlines
    float scanline = sin(uv.y * resolution.y * 3.14159) * 0.5 + 0.5;
    col.rgb *= 1.0 - scanline_intensity * (1.0 - scanline);

    // Vignette
    vec2 vig = uv * (1.0 - uv.yx);
    float v = vig.x * vig.y * 15.0;
    v = pow(v, vignette_intensity * 0.5 + 0.25);
    col.rgb *= v;

    // Subtle phosphor glow (bloom approximation)
    col.rgb *= 1.1;

    // Slight color fringing
    float r = Texel(tex, uv + vec2(0.001, 0.0)).r;
    float b = Texel(tex, uv - vec2(0.001, 0.0)).b;
    col.r = mix(col.r, r, 0.3);
    col.b = mix(col.b, b, 0.3);

    return col * color;
}
```

- [ ] **Step 2: Apply shader in main.lua**

Create a canvas at 960x540. Draw all game content to the canvas. Then draw the canvas to screen with the CRT shader applied.

```lua
-- In love.load():
canvas = love.graphics.newCanvas(960, 540)
crt_shader = love.graphics.newShader("assets/shaders/crt.glsl")
crt_shader:send("resolution", {960, 540})
crt_shader:send("scanline_intensity", 0.15)
crt_shader:send("curvature", 0.3)
crt_shader:send("vignette_intensity", 0.4)

-- In love.draw():
love.graphics.setCanvas(canvas)
love.graphics.clear(0.05, 0.05, 0.05)
game:draw()
love.graphics.setCanvas()

love.graphics.setShader(crt_shader)
crt_shader:send("time", love.timer.getTime())
love.graphics.draw(canvas, 0, 0)
love.graphics.setShader()
```

- [ ] **Step 3: Run and verify**

Run: `love game/`
Expected: Game renders with scanlines, slight screen curvature, edge vignette, and subtle phosphor glow. Green text should look atmospheric.

- [ ] **Step 4: Commit**

```bash
git add game/
git commit -m "feat: CRT post-processing shader with scanlines, curvature, vignette"
```

---

## Task 11: Audio System

**Files:**
- Create: `game/src/audio.lua`
- Create: placeholder sound files in `game/assets/sounds/`
- Modify: `game/src/game.lua`

- [ ] **Step 1: Create `src/audio.lua`**

```lua
local Audio = {}
Audio.__index = Audio

function Audio.new()
    local self = setmetatable({}, Audio)
    self.sounds = {}      -- name -> Source
    self.ambient = nil     -- currently playing ambient loop
    self.ambient_name = ""
    self.music = nil       -- currently playing music
    self.enabled = true
    return self
end

function Audio:load_sound(name, path, type)
    -- type: "static" for short SFX, "stream" for ambient/music
    local source_type = type or "static"
    local ok, source = pcall(love.audio.newSource, path, source_type)
    if ok then
        self.sounds[name] = source
    end
end

function Audio:load_all()
    -- UI sounds
    self:load_sound("keyclick", "assets/sounds/keyclick.wav", "static")
    self:load_sound("blip", "assets/sounds/blip.wav", "static")
    self:load_sound("pickup", "assets/sounds/pickup.wav", "static")
    self:load_sound("hit", "assets/sounds/hit.wav", "static")
    self:load_sound("crit", "assets/sounds/crit.wav", "static")
    self:load_sound("death", "assets/sounds/death.wav", "static")
    self:load_sound("levelup", "assets/sounds/levelup.wav", "static")
    self:load_sound("warning", "assets/sounds/warning.wav", "static")

    -- Ambient loops
    self:load_sound("ambient_manor", "assets/sounds/ambient_manor.ogg", "stream")
    self:load_sound("ambient_wilds", "assets/sounds/ambient_wilds.ogg", "stream")
    self:load_sound("ambient_darkness", "assets/sounds/ambient_darkness.ogg", "stream")
    self:load_sound("ambient_wastes", "assets/sounds/ambient_wastes.ogg", "stream")
    self:load_sound("ambient_hidden", "assets/sounds/ambient_hidden.ogg", "stream")
end

function Audio:play(name)
    if not self.enabled then return end
    local sound = self.sounds[name]
    if sound then
        sound:stop()
        sound:play()
    end
end

function Audio:play_ambient(region)
    local name = "ambient_" .. region
    if name == self.ambient_name then return end

    if self.ambient then
        self.ambient:stop()
    end

    self.ambient_name = name
    local sound = self.sounds[name]
    if sound then
        sound:setLooping(true)
        sound:setVolume(0.3)
        sound:play()
        self.ambient = sound
    end
end

function Audio:stop_ambient()
    if self.ambient then
        self.ambient:stop()
        self.ambient = nil
        self.ambient_name = ""
    end
end

return Audio
```

- [ ] **Step 2: Create placeholder sound files**

For initial development, create silent/minimal placeholder files so the game doesn't error. These will be replaced with real sounds later.

Use Love2D's `love.audio` gracefully — if a file is missing, the `pcall` in `load_sound` handles it silently.

- [ ] **Step 3: Wire audio into game events**

- Room change: `audio:play_ambient(room.region)`
- Keypress in terminal: `audio:play("keyclick")`
- Item pickup: `audio:play("pickup")`
- Combat hit: `audio:play("hit")`
- Critical hit: `audio:play("crit")`
- Level up: `audio:play("levelup")`

- [ ] **Step 4: Run and verify**

Run: `love game/`
Expected: Game runs without audio errors. If placeholder sounds exist, they play at appropriate times. Missing sounds are handled gracefully.

- [ ] **Step 5: Commit**

```bash
git add game/
git commit -m "feat: audio system with ambient loops and SFX"
```

---

## Task 12: Game Content — All Regions

**Files:**
- Modify: `game/data/regions/manor.json` (expand to ~12 rooms)
- Create: `game/data/regions/wilds.json` (~8 rooms)
- Create: `game/data/regions/darkness.json` (~8 rooms)
- Create: `game/data/regions/wastes.json` (~5 rooms)
- Create: `game/data/regions/hidden.json` (~4 rooms)
- Modify: `game/data/weapons.json` (all ~20 weapons)
- Modify: `game/data/items.json` (all consumables + key items)
- Modify: `game/data/enemies.json` (all enemies)
- Create: `game/data/endings.json`

This is a content creation task. The room descriptions should be curated from the original `StoryBoard.txt`, improved per the spec's curation principles, with developer notes added per region.

- [ ] **Step 1: Expand manor.json to ~12 rooms**

Curate from original rooms 0-16. Include: Entry, Entrance Hall, West Entertaining, East Entertaining, Main Hall, West Wing, East Wing, West Study, East Study, North Wing, Library Floor, Library Balcony, Library Dome, Wine Cellar, Dungeon, Yard. Cut redundant ones, improve thin descriptions.

Add developer notes to each room. Add enemies (shadow_rat in a few rooms, cellar_shade in Wine Cellar as mini-boss). Add items (rusty_key, rusty_dagger, small_potions). Add `on_enter` events where appropriate.

- [ ] **Step 2: Create wilds.json (~8 rooms)**

Curate from original rooms 17-27. Include: Forest Entrance, Northern Forest, Central Forest, Western Forest, Clearing, Southern Forest, Stream, Mountains. Improve descriptions to match warm/natural tone.

Add developer notes with kid personality. Add enemies (forest_wolf, mountain_troll boss). Add weapons (steel_sword, spear, mjolnir as boss drop). Add the secret exit from Clearing to Hidden region.

- [ ] **Step 3: Create darkness.json (~8 rooms)**

Curate from original rooms 28-41. Include: Dark Abyss, Shadowlands, Graveyard, Evil Fort, Shadow Gate, Evil Dimension, Evil Stronghold, Oblivion Gate, Alternate Dimension. The corruption writes these — descriptions should feel alien and precise, contrasting with the kid's voice.

Add uneasy developer notes. Add enemies (grave_wraith, oblivion_guardian, evil_king). Add weapons (anduril, ragnarok). Add dark_crown key item in Oblivion Gate area.

- [ ] **Step 4: Create wastes.json (~5 rooms)**

Curate from original rooms 42-51. Include: Path, Empty Village, Western Desert, Desert, Wastelands, Ruins. Aspirational kid tone.

Add developer notes. Add enemies (sand_golem). Add weapons (excalibur as golem drop, masamune hidden in ruins). Add ancient_map key item.

- [ ] **Step 5: Create hidden.json (~4 rooms)**

Curate from original rooms 52-56. Include: Shroomy Forest, Joe's Shroomy Diner, The Imagination Box, Hobbit Hiding Hole. Preserve the humor and personality.

Add warm developer notes. Add Milo as joke boss in Hobbit Hole. Add FALCON PUNCH and Badger on a Stick weapons. Add the four mushroom key items in Diner and Forest.

- [ ] **Step 6: Complete weapons.json with all ~20 weapons**

Add all weapons per the spec's stat table. Each with name, attack_bonus, region, description.

- [ ] **Step 7: Complete items.json with all consumables and key items**

Add all items per the spec: Small Potion, Potion, Large Potion, Strength Tonic, Iron Shield, Steel Shield, plus all key items (dark_crown, ancient_map, rusty_key, 4 mushrooms).

- [ ] **Step 8: Complete enemies.json with all enemies**

Add all enemies per the spec's stat table. Include boss flags, loot, and descriptions.

- [ ] **Step 9: Create endings.json**

Add all 4 endings per the spec's schema: the_hero, the_usurper, the_wanderer, the_enlightened.

- [ ] **Step 10: Run and playtest**

Run: `love game/`
Playtest: Navigate through all 5 regions. Verify room connections make sense, enemies appear, items can be picked up, weapons equipped, combat works across all regions.

- [ ] **Step 11: Commit**

```bash
git add game/
git commit -m "feat: complete game content — all regions, enemies, weapons, items, endings"
```

---

## Task 13: Endings System

**Files:**
- Create: `game/src/endings.lua`
- Modify: `game/src/game.lua`

- [ ] **Step 1: Create `src/endings.lua`**

```lua
local json = require("lib.json")

local Endings = {}
Endings.__index = Endings

function Endings.new()
    local self = setmetatable({}, Endings)
    self.endings = {}  -- loaded from endings.json
    self.triggered = nil  -- the ending that was triggered
    return self
end

function Endings:load(path)
    local content = love.filesystem.read(path)
    if content then
        self.endings = json.decode(content) or {}
    end
end

function Endings:check(player, world, context)
    -- context = {boss_just_defeated = enemy_id, choice_made = string, item_just_used = item_id}
    for id, ending in pairs(self.endings) do
        if self:check_trigger(ending, player, world, context) then
            self.triggered = ending
            self.triggered.id = id
            return ending
        end
    end
    return nil
end

function Endings:check_trigger(ending, player, world, context)
    local t = ending.trigger_type

    if t == "boss_defeated" then
        return context.boss_just_defeated == ending.trigger_value

    elseif t == "choice" then
        return player.current_room == ending.trigger_room
            and player:has_key_item(ending.trigger_item)
            and context.choice_made == ending.choice_options[ending.choice_trigger + 1]

    elseif t == "exploration" then
        if player.current_room ~= ending.trigger_room then return false end
        if not player:has_key_item(ending.trigger_item) then return false end
        local pct = (player:visited_count() / world:non_hidden_room_count()) * 100
        return pct >= ending.rooms_percent

    elseif t == "multi_item_use" then
        if player.current_room ~= ending.trigger_room then return false end
        for _, item_id in ipairs(ending.trigger_items) do
            if not player:has_key_item(item_id) then return false end
        end
        -- All mushrooms collected and in the right room
        return context.item_just_used and
            self:is_trigger_item(ending, context.item_just_used)
    end

    return false
end

function Endings:is_trigger_item(ending, item_id)
    for _, id in ipairs(ending.trigger_items) do
        if id == item_id then return true end
    end
    return false
end

return Endings
```

- [ ] **Step 2: Wire ending checks into game**

After combat victory: check for `boss_defeated` endings.
After using an item: check for `choice` and `multi_item_use` endings.
After entering a room: check for `exploration` endings.

When an ending triggers, switch to `ending` game state.

- [ ] **Step 3: Implement ending state rendering**

In the `ending` state:
1. Clear terminal
2. Apply the ending's terminal effect (gold_glow, red_corruption, warm_amber, psychedelic)
3. Type out the ending text line by line
4. Show the meta boot sequence variation:
   - Hero: `FILE INTEGRITY: RESTORED`
   - Usurper: `LAST MODIFIED:` changes to current date
   - Wanderer: `EXIT_GAME.BAT` sequence
   - Enlightened: full psychedelic mode
5. Display "Press any key to return to menu."

- [ ] **Step 4: Implement the choice prompt for Usurper ending**

When entering the Evil Stronghold with the dark_crown, display a special choice prompt with highlighted options. Player types their choice. Parse and check endings.

- [ ] **Step 5: Run and verify**

Test each ending trigger manually (may need to temporarily adjust player stats or inventory for testing). Verify each ending displays correctly with its unique terminal effect.

- [ ] **Step 6: Commit**

```bash
git add game/
git commit -m "feat: endings system with 4 endings and meta boot sequences"
```

---

## Task 14: Boot Sequence & Menu

**Files:**
- Modify: `game/src/game.lua`
- Modify: `game/src/terminal.lua`

- [ ] **Step 1: Implement boot state**

When game starts, enter `boot` state. Type out the boot sequence line by line with delays:

```
LOADING PROJECT...
MYSTICQUEST.EXE
LAST MODIFIED: 05/14/2009
WARNING: FILE INTEGRITY CHECK FAILED
LOADING ANYWAY...
```

Each line appears with a typewriter effect and a short pause between lines. After completion, transition to `menu` state.

- [ ] **Step 2: Implement menu state**

Display menu options in terminal style:
```
> NEW GAME
  CONTINUE
  QUIT
```

Arrow keys or `w`/`s` to navigate, Enter to select. "CONTINUE" grayed out if no save file exists. Selected option highlighted in bright green.

- [ ] **Step 3: Implement game over state**

On player death:
1. Screen flicker + corruption effect
2. Display "YOU HAVE FALLEN" in red
3. Options: "LOAD SAVE" or "QUIT TO MENU"

- [ ] **Step 4: Wire menu → game transitions**

- New Game: create fresh Player, load world, enter exploring state at manor_entry
- Continue: load save, enter exploring state at saved room
- Quit: `love.event.quit()`

- [ ] **Step 5: Run and verify**

Run: `love game/`
Expected: Game boots with the meta loading sequence, shows menu, New Game starts in the manor, game over shows on death with options, Continue works after saving.

- [ ] **Step 6: Commit**

```bash
git add game/
git commit -m "feat: boot sequence, menu, and game over screens"
```

---

## Task 15: Polish — ASCII Art & Developer Notes Rendering

**Files:**
- Create: `game/assets/ascii/` art files
- Modify: `game/src/terminal.lua` (dev note rendering style)

- [ ] **Step 1: Add dev note rendering style**

In `terminal.lua`, when displaying a developer note, render it in a distinct style:
- Color: dim yellow/amber `{0.6, 0.5, 0.2, 0.8}`
- Prefix with `//` if not already present
- Slight different font weight or italicize (or just use the color distinction)

- [ ] **Step 2: Create ASCII art for key moments**

Create small (10-15 line) ASCII art text files:
- `game/assets/ascii/title.txt` — game title for boot screen
- `game/assets/ascii/boss_evil_king.txt` — Evil King encounter
- `game/assets/ascii/boss_troll.txt` — Mountain Troll
- `game/assets/ascii/weapon_excalibur.txt` — finding Excalibur
- `game/assets/ascii/ending_hero.txt` — Hero ending
- `game/assets/ascii/death.txt` — game over skull

- [ ] **Step 3: Display ASCII art at triggers**

Load ASCII art files and display them in terminal at appropriate moments:
- Boss encounter `on_enter` events display boss ASCII art
- Finding legendary weapons shows weapon art
- Boot screen shows title art
- Game over shows skull
- Endings show their respective art

- [ ] **Step 4: Run and verify**

Run: `love game/`
Expected: ASCII art appears at key moments. Dev notes render in distinct style when rooms are searched.

- [ ] **Step 5: Commit**

```bash
git add game/
git commit -m "feat: ASCII art for key moments and dev note styling"
```

---

## Task 16: Integration Testing & Balance Pass

- [ ] **Step 1: Full playthrough — Manor path**

Play from start through the Manor. Verify:
- All rooms accessible and connected correctly
- Enemies spawn and can be fought
- Items and weapons can be found, picked up, equipped
- Dev notes appear when searching
- Events fire correctly (flicker, gates)
- Save/load works mid-manor

- [ ] **Step 2: Full playthrough — Wilds path**

Continue from Manor through Wilds. Verify:
- Progression feels natural (enemies harder but manageable)
- Mountain Troll boss is challenging but beatable at ~level 4-5
- Weapons found in Wilds are meaningful upgrades

- [ ] **Step 3: Full playthrough — Darkness path**

Continue through Darkness. Verify:
- Soft gating works (enemies are tough if underleveled)
- Terminal effects shift appropriately (red tint, glitches)
- Evil King is beatable at ~level 8-10 with good weapon
- Hero ending triggers on defeating Evil King

- [ ] **Step 4: Test Usurper ending**

Get dark_crown from Oblivion Gate, bring to Stronghold, choose "use dark crown". Verify ending triggers correctly.

- [ ] **Step 5: Test Wanderer ending**

Visit 80%+ of rooms, find ancient_map in Ruins, verify hidden exit appears.

- [ ] **Step 6: Test Enlightened ending**

Reach Hidden region, collect all 4 mushrooms, use them in the Diner. Verify psychedelic ending.

- [ ] **Step 7: Balance adjustments**

Based on playthroughs, adjust:
- Enemy HP/ATK/DEF if too easy or too hard
- Weapon attack bonuses if progression doesn't feel right
- Potion availability if healing is too scarce or abundant
- XP curve if leveling is too fast or slow

- [ ] **Step 8: Commit any balance changes**

```bash
git add game/data/
git commit -m "fix: balance pass on enemies, weapons, and XP curve"
```

---

## Summary

| Task | What it builds | Depends on |
|------|---------------|------------|
| 1 | Project skeleton, state machine | — |
| 2 | Terminal rendering, typewriter, input | 1 |
| 3 | World system, room loading | 1, 2 |
| 4 | Command parser, movement | 2, 3 |
| 5 | Player stats, inventory, items | 4 |
| 6 | Combat system | 5 |
| 7 | Visual effects (shake, flash, tint) | 2 |
| 8 | Room events (gates, dialogue, boss) | 3, 7 |
| 9 | Save/load | 5 |
| 10 | CRT shader | 2 |
| 11 | Audio | 1 |
| 12 | All game content (rooms, enemies, etc.) | 3, 5, 6 |
| 13 | Endings system | 5, 12 |
| 14 | Boot sequence, menu, game over | 2, 9 |
| 15 | ASCII art, dev note styling | 2, 12 |
| 16 | Integration testing, balance | All |

**Parallelizable tasks:** 7+10+11 can be developed in parallel after Task 2. Task 12 (content) can start alongside Tasks 7-11.
