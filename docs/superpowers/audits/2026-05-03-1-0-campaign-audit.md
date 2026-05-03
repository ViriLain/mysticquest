# MysticQuest 1.0 Campaign Audit

## Rating Key

- Strong: memorable, useful, and region-specific.
- Serviceable: functional, but needs stronger flavor or purpose.
- Flat: generic, under-signaled, confusing, or unrewarding.

## Global Findings

| Area | Finding | Action |
| --- | --- | --- |
| Endings | Hero, Wanderer, and Enlightened have clear concepts; Usurper is reachable but needs stronger pre-choice dread. | Keep direct ending tests; polish stronghold/crown buildup and add one stable payoff line per ending. |
| Bosses | Bosses have stats and some ASCII support, but room prose and aftermath vary in quality. | Strengthen boss room descriptions and cleared descriptions for Cellar Shade, Mountain Troll, Ruins Guardian, Oblivion Guardian, Evil King, and Milo. |
| NPC hints | Existing ask topics are useful, but some specific 1.0 topics are missing. | Add targeted ask topics for cellar shade, rusty key, mountain troll, hidden path, ruins guardian, Wanderer exit, Evil King, Milo, kid, game, and diner. |
| Secrets | Hidden path, Wanderer exit, and Enlightened mushrooms exist but can feel incidental. | Add non-spoiler hints in Wren, Whiskers, Wastes ruins, and ending-adjacent descriptions. |
| Balance | Current data has a complete gear/enemy curve, but no documented release target. | Create balance notes and tune only after content polish. |
| Tone | Manor/Wilds/Hidden use kid-game casual voice; Darkness/Wastes are more polished. This can work, but rough grammar in early regions sometimes reads accidental. | Keep the kid-game charm, but clean grammar and make intentional fourth-wall flavor clearer. |

## Manor

| Room | Rating | Current Role | Issue | Planned Action |
| --- | --- | --- | --- | --- |
| manor_entry | Serviceable | Opening fight, first pickup, first weapon. | Good onboarding content, but cleared text has typos and a jokey smear line that weakens tone. | Completed: opening/cleared prose cleaned while preserving first-room clarity and reward scan. |
| manor_entrance_hall | Serviceable | Early navigation and first lighting effect. | Atmospheric, but only functions as a pass-through. | Completed: fork-room language now points toward the hall, wings, and cellar pressure. |
| manor_west_entertaining | Strong | Combat/search reward with piano/portraits. | Good visual identity; lacks aftermath after rat is gone. | Completed: added `description_cleared` that makes the piano/portraits less hostile. |
| manor_east_entertaining | Serviceable | Ghost fight and search reward. | Dining-table setup is clear but generic. | Completed: strengthened abandoned-dinner setup and added ghost-cleared aftermath. |
| manor_main_hall | Strong | Merchant hub and manor center. | Dusty carries this room; room prose is a little rough. | Completed: prose polished and Dusty ask topics added for `cellar_shade`, `rusty_key`, and `manor`. |
| manor_west_wing | Flat | Combat corridor. | No search/reward and no distinct purpose beyond a rat. | Completed: stronger corridor prose and cleared description added. |
| manor_east_wing | Strong | Ghost, shield, tonic, mirror flavor. | Strong image; typo cleanup needed. | Completed: grammar polished and ghost-cleared mirror aftermath added. |
| manor_north_wing | Serviceable | Bedroom hallway and route downward. | Useful route, but prose does not hint why it matters. | Completed: cellar foreshadowing added through keyholes and descending cold. |
| manor_library | Serviceable | Lore/search and route to dome. | Good spatial concept, but search reward is minor and lore symbols are underused. | Completed: symbols now imply broken instructions and point toward the dome. |
| manor_library_dome | Strong | Ancient Map search and early mystery. | Cleared text works but could make the map feel more important. | Completed: map aftermath now hints hidden routes without spoiling Wanderer. |
| manor_wine_cellar | Strong | Cellar Shade boss and first gate. | Good buildup, but cleared text overuses exclamation and loses mood. | Completed: boss buildup/aftermath polished with calmer victory tone. |
| manor_dungeon | Serviceable | Post-boss reward room. | Strong setup but no payoff after Cellar Shade beyond loot. | Completed: dungeon prose now ties scratch marks and shadow origin together. |
| manor_yard | Serviceable | Transition to Wilds/Wastes. | Functional crossroads, but does not sell leaving the starter region. | Completed: act-transition language now opens the wider broken world. |

## Wilds

| Room | Rating | Current Role | Issue | Planned Action |
| --- | --- | --- | --- | --- |
| wilds_forest_entrance | Serviceable | Region arrival and first Wilds enemy. | Nice arrival, but "leaves and stuff" reads less intentional than charming. | Completed: arrival prose polished while preserving bright contrast from Manor. |
| wilds_northern_forest | Strong | Combat, steel sword, old-tree identity. | Strong scene; could use cleared aftermath. | Completed: cleared description added and mushrooms kept as Hidden foreshadowing. |
| wilds_central_forest | Serviceable | Hub, chainmail, wolf. | Useful hub, but typo and weak region purpose. | Completed: description polished and cleared text added to make hub routes readable. |
| wilds_clearing | Strong | Wren, shop, spear, hidden path. | Core region room; hidden path clue is mostly in Wren dialogue, not room presentation. | Completed: stone circle/mushroom clue added to room and Wren dialogue. |
| wilds_southern_forest | Strong | Spider threat and Hrunting. | Good tonal shift; could reward clearing. | Completed: darker prose and cleared text showing the watching eyes retreat. |
| wilds_stream | Serviceable | Recovery, search weapon, calmer space. | Pleasant but under-signals Gungnir as a secret reward. | Completed: stream prose now includes a glint beneath the current. |
| wilds_mountains | Serviceable | Climb, route to Darkness/Wastes, Tyrfing search. | Good vista but grammar issues; Troll buildup could be stronger before peak. | Completed: climb language polished and peak pressure sharpened. |
| wilds_mountain_peak | Serviceable | Mountain Troll boss. | Climax exists, but text is too jokey after victory for 1.0 tone. | Completed: boss buildup and aftermath rewritten for stronger progression. |

## Wastes

| Room | Rating | Current Role | Issue | Planned Action |
| --- | --- | --- | --- | --- |
| wastes_path | Serviceable | Region arrival. | Good mood, but as first Wastes room it could more clearly mark a new act. | Completed: arrival prose now contrasts the wastes with the green world behind. |
| wastes_village | Strong | Hermit, shop, lore, enemy, supplies. | Strong role but crowded: NPC, enemy, item, search reward. | Completed: village prose now frames Hermit calm against the wraith and dry well. |
| wastes_desert | Strong | Sand Golem and Excalibur search. | Strong image; Excalibur is hidden with little setup. | Completed: buried gleam hint added for hidden Excalibur. |
| wastes_wastelands | Serviceable | Wraith fight, Vorpal Sword, approach to ruins. | Good "dead land" tone but needs stronger pull toward ruins. | Completed: ruins now read as destination and warning. |
| wastes_ruins | Strong | Ruins Guardian, Ancient Map, Wanderer exit. | Campaign-critical; currently says "end of a journey" but not enough about secret escape. | Completed: prose now hints the map/floor relationship and lower hidden direction. |
| wastes_abandoned_mine | Strong | Mine route to Keeper. | Strong prose and good transition into deeper lore. | Completed: mine prose tightened and crawler-cleared description added. |
| wastes_collapsed_temple | Strong | Crown-origin foreshadowing and sentinel. | Strong lore; can better point to sanctum below. | Completed: stairs below and post-sentinel crown warning reinforced. |
| wastes_buried_sanctum | Strong | Last Keeper and Keeper's Ward. | Strong lore room; needs clearer player-facing reward wording because ward is a flag, not inventory. | Completed: sanctum prose and Keeper blessing now clarify ward and crown consequence. |

## Darkness

| Room | Rating | Current Role | Issue | Planned Action |
| --- | --- | --- | --- | --- |
| darkness_abyss | Strong | Region arrival and nightmare tone. | Strong mood; could more directly connect to digital corruption. | Completed: corrupted-pixel detail added to the abyss arrival. |
| darkness_shadowlands | Strong | Navigation/combat. | Strong image; no cleared aftermath. | Completed: broken-frame detail and wraith-cleared aftermath added. |
| darkness_graveyard | Strong | Combat, Dainsleif, potion search. | Strong scene and weapon placement. | Keep mostly intact; add payoff if ending/balance changes need it. |
| darkness_evil_fort | Strong | Shadow Knight and shield. | Strong architecture but "Evil Fort" name is plain compared to prose. | Consider room-name/prose polish only if tests and content references stay stable. |
| darkness_shadow_gate | Serviceable | Shadow Knight, Anduril, Berserker Tooth. | Strong rewards, but danger/reward relationship is under-signaled. | Completed: gate now frames hidden rewards as dangerous to notice. |
| darkness_oblivion_gate | Strong | Oblivion Guardian and Dark Crown. | Excellent digital reveal; needs stronger crown pickup aftermath. | Completed: guardian-cleared description now isolates the crown as the remaining solid object. |
| darkness_evil_dimension | Serviceable | Pre-throne resource room. | Good pressure, but no enemy/NPC means it can read as a loot closet before final boss. | Completed: resource room now reads as a last chance before the King. |
| darkness_stronghold | Strong | Evil King and Usurper choice. | Strong premise; crown choice prompt needs more emotional weight. | Completed: stronghold prose now reacts to carrying the crown and reinforces host-cycle dread. |

## Hidden

| Room | Rating | Current Role | Issue | Planned Action |
| --- | --- | --- | --- | --- |
| hidden_shroomy_forest | Strong | Whiskers, first mushrooms, secret-realm arrival. | Fun tone works, but can better hint that mushrooms matter. | Add Whiskers/diner ask topics and keep mushroom collection readable. |
| hidden_diner | Serviceable | Enlightened ending and remaining mushrooms. | Great concept, but Carl is mentioned without being interactive and ending trigger is easy to miss. | Add clearer room prose that using mushrooms here is plausible; maybe hint through Whiskers. |
| hidden_imagination_box | Strong | Secret weapon and kid-game reveal flavor. | Strong concept; no action needed unless set-piece pass wants more meta flavor. | Keep mostly intact; clean "Its" typo if touching file. |
| hidden_hobbit_hole | Serviceable | Milo bonus boss. | Milo is introduced in prose but not through an NPC; bonus-boss status could be clearer. | Add buildup/aftermath and clarify that Milo is optional chaos. |

## Set Pieces

| Moment | Rating | Issue | Planned Action |
| --- | --- | --- | --- |
| Title/new game opening | Serviceable | Not audited visually in this pass yet. | Browser-smoke the opening and only change if it feels flat after region polish. |
| Manor boss and transition to Wilds | Serviceable | Cellar Shade has buildup but aftermath is rough. | Polish `manor_wine_cellar`, `manor_dungeon`, and `manor_yard` as one progression beat. |
| Wren and Ancient Map reveal | Strong | Wren grants map at level 3, but map also appears elsewhere, making the reveal less unique. | Keep both acquisition paths unless balance audit says otherwise; strengthen Wren's explanation of what the map means. |
| Darkness corruption reveal | Strong | Oblivion Gate is the clearest digital reveal. | Preserve and reinforce with smaller static/code hints earlier in Darkness. |
| Last Keeper scene | Strong | Strong exposition; ward reward is mechanically invisible. | Clarify ward effect in dialogue and audit whether combat messaging should mention it. |
| Evil King confrontation | Serviceable | Final room is strong but the choice/boss fork can feel mechanical. | Polish stronghold prose and ending text; keep triggers unchanged. |
| Wanderer exit | Serviceable | Concept is strong; virtual exit needed direct coverage and a route fix. | Covered by Task 1; add Wastes ruins/map hint after content polish. |
| Enlightened diner reveal | Serviceable | Strong ending concept, but diner interaction is under-signaled. | Add Whiskers/diner hints and a clearer diner description. |

## Deferred Post-1.0

| Idea | Reason Deferred |
| --- | --- |
| New regions | 1.0 scope is full-story polish, not content expansion. |
| New endings | Four endings already cover the campaign fantasy. |
| Large Dungeon Mode expansion | Dungeon Mode is bonus content for this release push. |
| Runtime schema tooling | Content validation is already strong enough unless new JSON shapes are introduced. |
| New NPC system for Carl/Milo | Hidden region can be clarified through existing room prose and Whiskers dialogue. |
