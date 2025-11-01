# BattleCity Game Rules Tracker

Use this document to record gameplay rules, mechanics, and feature behaviors as they are implemented. Keeping it current prevents regressions and makes it easier to onboard new contributors.

## Core Gameplay
- Players control a tank mapped to the 48px tile grid; movement is clamped to the map bounds.
- Tank collisions use the shared `{x, y, w, h}` rectangle helpers to stay consistent with bullet and building logic.
- Death resets the player to the defined spawn location with default stats.
- Collision resolution keeps a rolling “last safe” position, nudges outward in 6px steps, scans nearby tiles, and finally snaps to city spawn if required so players can’t be trapped by buildings or terrain pushes. (client/src/play.js:18)

## Teams & Roles
- The authoritative server guarantees each city has exactly one mayor and at most three recruits; newcomers round-robin between city `0` and city `1` until both rosters reach that capacity. (server/src/PlayerFactory.js:11, server/src/PlayerFactory.js:195)
- When every slot is filled the join request is rejected with `cities_full`, allowing a future lobby flow to queue players without spawning them. (server/src/PlayerFactory.js:39)
- City spawn points and canonical city names are keyed in `shared/citySpawns.json`; both client and server snap players to those offsets so each team enters at the correct base. (client/src/utils/citySpawns.js:1, server/src/PlayerFactory.js:208)
- The `map.dat` asset is rotated 180° during load so command centers align with their classic plazas; this prevents rocks from appearing inside the base footprint. (client/src/mapBuilder.js:45)
- Mayors render a “Mayor of _City_” banner above their tank using the shared city display name to make leadership clear in-game. (client/src/draw/draw-changing.js:6)

## Economy
- Each city starts with `95,000,000` cash and resolves finance ticks every 7 seconds; the server clamps balances, tracks income/expenses, and rebroadcasts updates to clients. (server/src/CityManager.js:20)
- Houses generate `population × 10,000` cash per tick while fully staffed Research centers withdraw the `COST_ITEM` budget and Hospitals consume `COST_UPKEEP_HOSPITAL`. (server/src/Building.js:74)
- Factories only craft items when their city can afford `COST_ITEM` and the amount is deducted as production spending. (server/src/FactoryBuilding.js:28)
- Mayors see a live money box in the side panel with cash totals and up/down indicators driven by the latest finance update. (client/src/draw/draw-panel-interface.js:47)

## Combat
- Bullets originate from the active tank barrel position and inherit the firing tank's facing direction.
- Client handles bullet physics; server currently trusts reported positions and broadcasts them to peers.
- Mines detonate when an opposing-city tank overlaps their tile, dealing `DAMAGE_MINE` (19) and clearing the mine from the field while leaving allies unaffected. (client/src/collision/collision-helpers.js:54, client/src/play.js:11)
- Bombs dropped while armed (`B` toggles arming) explode after 5 seconds, wiping nearby items, demolishing buildings within two tiles, and inflicting lethal damage on tanks in the blast radius. (client/src/factories/ItemFactory.js:215, client/src/input/input-keyboard.js:128)

## Buildings & Items
- Building placement consumes the appropriate resources and links into the building factory's list (`next`/`previous` pointers must remain valid).
- Mayors can only place a building when their city's cash balance covers `COST_BUILDING`; insufficient funds now reject the placement server-side and refund any optimistic client adjustments. (server/src/BuildingFactory.js:87, client/src/factories/BuildingFactory.js:50)
- Factory buildings emit `new_icon` events when they start producing item drops.
- Dropped items always render using the appropriate sprites (turret heads, sleepers, bombs, walls, mines, etc.), with enemy mines hidden while armed to match legacy behaviour. (client/src/draw/draw-items.js:1)
- Houses maintain up to two attachment slots for nearby support buildings; the server keeps the attachment list authoritative and rebroadcasts population changes.
- Dropping a Mine icon spawns an armed mine item that remembers the owner's city, renders via the item tile layer, and is removed from the item list once triggered. (client/src/factories/ItemFactory.js:12, client/src/draw/draw-items.js:27)
- Bomb icons snap to the tile grid when placed; armed bombs start a 5-second detonation timer, while unarmed bombs remain inert until dropped while armed. (client/src/factories/ItemFactory.js:135, client/src/draw/draw-items.js:14)
- Cities become *orbable* once they either (a) reach a historical maximum of at least 21 constructed buildings, or (b) have ever operated a Bomb or Orb factory. (server/src/CityManager.js:129)
- An Orb dropped on an enemy command center now triggers a full city wipe when the target meets the orbable criteria: the command center is destroyed, every building is demolished, all hazards are cleared, and the affected players are sent back to the lobby. (server/src/orb/OrbManager.js:47, server/src/PlayerFactory.js:658)
- Factory output counts now come entirely from the server snapshot. Each `new_building` payload includes `itemsLeft`, and the client reconciles the expected drops through `syncFactoryItems`. (client/src/SocketListener.js:140, client/src/factories/BuildingFactory.js:538)
- Inventory stacks repeatable items (bombs, mines, turrets) and shows a count overlay; selecting a bomb arms the stack so drops inherit the armed state. (client/src/factories/IconFactory.js:20, client/src/draw/draw-panel-interface.js:37)
- Item pickups respect the classic per-city caps (e.g., Cloaks 4, Bombs 20, Turrets 10, Plasma 5, Orb 1); excess inventory is trimmed during restore and additional pickups are blocked once a cap is reached. (client/src/constants.js:90, client/src/factories/IconFactory.js:18)
- Factory drops now carry their producing city’s team flag; only members of that city can collect the items, preventing players from looting rival (or AI) production lines. (server/src/FactoryBuilding.js:41, client/src/SocketListener.js:131, client/src/factories/IconFactory.js:239)

## AI Opposition
- When the human roster slips below 16 players the server fabricates up to six AI fortress cities from the shared blueprint, wiring in bomb, orb, and turret factories so they’re immediately orbable and large enough to draw rogue tank patrols. (server/src/FakeCityManager.js, shared/fakeCities.json)
- These synthetic strongholds carry an `isFake` marker, so the lobby assignment flow skips them while they are active. (server/src/PlayerFactory.js)
- AI fortress templates now include a command center at the city spawn, so they can be orbed like player cities and feel like full bases. (shared/fakeCities.json:5, server/src/FakeCityManager.js:90)
- Default fortresses pre-seed minefields and autonomous turrets/plasma/sleeper emplacements, all team-locked so only the owning city can interact with them; the layout mirrors `defaultDefenses` and is streamed to clients along with hazard snapshots. (shared/fakeCities.json:17, server/src/FakeCityManager.js:110, server/src/hazards/HazardManager.js:74, client/src/SocketListener.js:129)

## Build Tree
- Housing is available immediately and permits launching the two starting research lines.
- Lazer Research (→ Lazer Factory) is unlocked from the start and, once completed, enables Cloak Research, MedKit Research, and their factories.
- Turret Research (→ Turret Factory) is also granted at the start and unlocks Plasma Turret Research and Mine Research.
- Cloak Research unlocks Cloak Factory plus Orb Research and Time Bomb Research, which then unlock their matching factories.
- MedKit Research unlocks MedKit Factory and allows the city to construct Hospitals.
- Plasma Turret Research unlocks Plasma Turret Factory as well as Sleeper Research and Wall Research; each research unlocks its paired factory.
- Mine Research unlocks Mine Factory and DFG Research (and then DFG Factory).
- Orb Research grants Orb Factory production and unlocks Flare Gun Research (and the Flare Gun Factory).

## Items
- **Cloak** – Press `C` to activate a 5-second cloak as long as you own the icon; enemies stop drawing your tank while allied players still see you. The server tracks the timer so taking damage or timeout automatically broadcasts a status update. (client/src/input/input-keyboard.js:150, client/src/factories/ItemFactory.js:208, server/src/PlayerFactory.js:318)
- **Laser** – Owning a Laser icon enables the default SHIFT shot; the input handler falls back to bullet type `0` (5 damage) whenever no bazooka is available. (client/src/input/input-keyboard.js:175, client/src/factories/BulletFactory.js:13)
- **Cougar Missile (Bazooka)** – When you hold still with Cougar Missiles in your inventory, SHIFT fires rocket shots (type `1`) that reuse the classic damage boost, now enforced on both client and server. (client/src/input/input-keyboard.js:175, client/src/factories/BulletFactory.js:13, server/src/BulletFactory.js:10)
- **MedKit** – Press `H` to consume one MedKit from your inventory and instantly restore your tank to full health; the server clamps the heal and rebroadcasts the new value. (client/src/input/input-keyboard.js:168, client/src/factories/ItemFactory.js:200, server/src/PlayerFactory.js:299)
- **Bomb** – Pressing `B` arms/disarms the selected stack, and dropping an armed bomb spawns a synced hazard that later clears items, buildings, and players inside the detonation radius. (client/src/input/input-keyboard.js:157, client/src/factories/ItemFactory.js:215, client/src/factories/ItemFactory.js:376)
- **Mine** – Mines snap to the tile grid, hide from enemies once deployed, and flag themselves for removal the moment an opposing tank trips the collision handler. (client/src/play.js:49, client/src/factories/ItemFactory.js:546, server/src/hazards/HazardManager.js:268)
- **DFG** – Deep Freeze Generators work like invisible mines: an enemy that rolls over one is frozen in place for 5 seconds while friends pass through harmlessly. Freeze state is driven server-side so everyone sees the status change. (client/src/play.js:105, client/src/factories/ItemFactory.js:242, server/src/hazards/HazardManager.js:303)
- **Flare Gun** – Holding `CTRL` fires three slow flare shots behind your tank (bullet type `3`) using the classic spread; both client and server honour the lower projectile speed and damage. (client/src/input/input-keyboard.js:95, client/src/factories/BulletFactory.js:13, server/src/BulletFactory.js:13)
- **Orb** – Dropping an Orb queues a server validation; on success the server wipes the target city, resets its economy, and broadcasts the destruction event. (client/src/factories/ItemFactory.js:431, server/src/orb/OrbManager.js:57)
- **Wall** – Wall icons place a 48×48 blocking tile that behaves like the legacy barricades, including collision and visibility rules. (client/src/draw/draw-items.js:92, client/src/collision/collision-helpers.js:23)
- **Turret** – Auto-turrets track targets every 200 ticks and fire standard bullets whenever a hostile tank strays within range. (client/src/factories/ItemFactory.js:33, client/src/factories/ItemFactory.js:105)
- **Sleeper Turret** – Sleeper turrets reuse the autonomous firing logic but stay hidden unless they have a target or belong to your city. (client/src/factories/ItemFactory.js:33, client/src/draw/draw-items.js:116)
- **Plasma Turret** – Plasma turrets share the automated targeting loop, providing the higher-tier factory defense once population is available. (client/src/factories/ItemFactory.js:33, client/src/draw/draw-items.js:20)

## Networking
- Socket.IO server runs on port 8021 and rebroadcasts player, bullet, and building updates it receives from clients.
- Client emits `player`, `bullet_shot`, and `new_building` events when local state changes; listeners reconcile remote entities under `game.otherPlayers`.
- Orb drops are authoritative: the client sends an `orb:drop` request, the server validates the target and broadcasts the `city:orbed` result (or an `orb:result` failure) so every peer stays in sync. (client/src/factories/ItemFactory.js:134, server/src/orb/OrbManager.js:47)

## Points & Scoring
- Each city tracks a running `score` tally and the number of successful orbs (`orbs`), both of which are surfaced in the mayor finance panel, lobby listings, and the contextual right-click inspector. (client/src/draw/draw-panel-interface.js:53, client/src/lobby/LobbyManager.js:215)
- Destroying an orbable enemy city awards points to the attacking city based on the victim's historical growth (max buildings) plus a 5-point bonus per prior orb they had launched; this value is also exposed as the city's `Bounty` in inspection panels. (server/src/CityManager.js:166, client/app.js:305)
- When a city is destroyed its economy resets to the starting balance, its orb bounty drops to zero, and every occupant must rejoin via the lobby overlay. (server/src/CityManager.js:200, client/src/lobby/LobbyManager.js:410)

## Houses ↔ Factories
- Every non-house building (including factories) must attach to a compatible house to accumulate staff population; without an attachment its population is reset to `0`. (server/src/Building.js:75, server/src/BuildingFactory.js:205)
- Attachment eligibility requires matching owner or matching city, and each house can host at most two attachments; the server picks the house with the fewest occupants. (server/src/BuildingFactory.js:224, server/src/BuildingFactory.js:237)
- When a factory attaches, its `cityId` is synced to the house and both sides receive `population:update` events so the client stays in sync. (server/src/BuildingFactory.js:248, client/src/factories/BuildingFactory.js:280)
- House population is always the sum of its attachment slots; demolishing a house clears every attached building's link and population, while demolishing the factory just frees the slot. (server/src/BuildingFactory.js:165, server/src/BuildingFactory.js:257, server/src/BuildingFactory.js:295)
- New houses retroactively claim eligible unattached buildings (again up to two), keeping older factories productive once housing exists. (server/src/BuildingFactory.js:299)
- Factories only begin item production once they reach full population (`POPULATION_MAX_NON_HOUSE` = 50), so sustaining a house link is required for output. (server/src/FactoryBuilding.js:15, server/src/constants.js:4)
- Houses cap their total population at `POPULATION_MAX_HOUSE` (100), while research centers and factories cap at 50; in practice one house can fully staff up to two such support buildings, so plan on **½ house per research center or factory**. Losing a house drops both attached buildings back to zero population until another house claims them. (server/src/Building.js:35, server/src/constants.js:3, server/src/BuildingFactory.js:295)
- Legacy behavior matches this ratio: each attached non-house building contributes its current population directly to the parent house (`pop = AttachedPop + AttachedPop2`). A single staffed research center therefore fills a house to 50 population, while two staffed centers (or a center plus a factory) take it to 100. (original/Battle-City/server/CBuilding.cpp:509, original/Battle-City/server/CBuilding.cpp:523)

> When adding new functionality, append the relevant rules here so they remain discoverable. Note the subsystem (play, draw, factory, etc.) and include any constraints or invariants that other developers should honor.
