# MysticQuest 1.0 Balance Notes

## Targets

- Regular fights should usually resolve in 2-5 player attacks with reasonable gear.
- Bosses should feel dangerous but not require grinding.
- Shops should matter because stock, price, and timing are meaningful.
- Consumables should help preparation without becoming mandatory for every fight.
- Weapon upgrades should feel rewarding by region.
- Alternate endings should not require tedious farming.

## Current Curve

| Region | Expected Level | Main Threats | Expected Gear | Notes |
| --- | --- | --- | --- | --- |
| Manor | 1-3 | Shadow Rat, Manor Ghost, Cellar Shade | Rusty Dagger into Iron Sword, Iron Shield or Leather Vest if bought | Early rewards are dense enough to teach search/take/use. Cellar Shade should be the first preparation check. |
| Wilds | 3-5 | Forest Wolf, Forest Spider, Mountain Troll | Steel Sword/Spear/Hrunting, Ranger's Hide or Chainmail | Wren shop plus found weapons give multiple viable routes. Troll should reward potions and fire/magic preparation. |
| Wastes | 5-7 | Sand Golem, Wraith, Ruins Guardian, mine route | Excalibur/Vorpal/Masamune/Keeper's Blade, Desert Wrap or Guardian Armor | Wastes has strong late gear and the Keeper route. Guardian rewards should feel like final-act preparation. |
| Darkness | 7-8 | Grave Wraith, Shadow Knight, Oblivion Guardian, Evil King | Anduril/Keyblade/Ragnarok, Shadow Plate, Iron Band or Berserker Tooth | Darkness has the highest spike. Final boss should be beatable by a prepared player without debug stats. |
| Hidden | Optional | Milo | Optional high-end weapons | Hidden should stay optional and funny, with strong rewards but no required grind. |

## Changes Made

| File | Change | Rationale |
| --- | --- | --- |
| `test/scenario/campaign-polish.test.ts` | Added prepared-player Evil King regression. | Guards against final boss tuning that makes the main Hero ending unreasonable. |

## Review Notes

- No enemy, item, weapon, armor, accessory, or shop numbers were changed in this pass.
- The current final-boss data supports a prepared level 8 story player with Ragnarok, Shadow Plate, three large potions, one panacea, and several core defensive/offensive skills.
- Earlier content polish improved hinting around preparation, hidden rewards, and late-game choices, so numeric tuning should remain conservative until manual playthrough notes prove a curve problem.
- Keep an eye on Mountain Troll and Ruins Guardian during browser/manual playthroughs; they are the most likely bosses to reveal potion-stock or gear-placement pressure.

## Verification

- `npm test`: 53 files passed, 421 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm audit --json`: 0 total vulnerabilities.
- Browser smoke covered the first-session combat/shop/journal/minimap/transition/boss-art surfaces with no app console warnings or errors.
