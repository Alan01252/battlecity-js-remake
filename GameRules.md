# BattleCity Game Rules Tracker

Use this document to record gameplay rules, mechanics, and feature behaviors as they are implemented. Keeping it current prevents regressions and makes it easier to onboard new contributors.

## Core Gameplay
- Players control a tank mapped to the 48px tile grid; movement is clamped to the map bounds.
- Tank collisions use the shared `{x, y, w, h}` rectangle helpers to stay consistent with bullet and building logic.
- Death resets the player to the defined spawn location with default stats.

## Combat
- Bullets originate from the active tank barrel position and inherit the firing tank's facing direction.
- Client handles bullet physics; server currently trusts reported positions and broadcasts them to peers.
- Mines detonate when an opposing-city tank overlaps their tile, dealing `DAMAGE_MINE` (19) and clearing the mine from the field while leaving allies unaffected. (client/src/collision/collision-helpers.js:54, client/src/play.js:11)
- Bombs dropped while armed (`B` toggles arming) explode after 5 seconds, wiping nearby items, demolishing buildings within two tiles, and inflicting lethal damage on tanks in the blast radius. (client/src/factories/ItemFactory.js:215, client/src/input/input-keyboard.js:128)

## Buildings & Items
- Building placement consumes the appropriate resources and links into the building factory's list (`next`/`previous` pointers must remain valid).
- Factory buildings emit `new_icon` events when they start producing item drops.
- Houses maintain up to two attachment slots for nearby support buildings; the server keeps the attachment list authoritative and rebroadcasts population changes.
- Dropping a Mine icon spawns an armed mine item that remembers the owner's city, renders via the item tile layer, and is removed from the item list once triggered. (client/src/factories/ItemFactory.js:12, client/src/draw/draw-items.js:27)
- Bomb icons snap to the tile grid when placed; armed bombs start a 5-second detonation timer, while unarmed bombs remain inert until dropped while armed. (client/src/factories/ItemFactory.js:135, client/src/draw/draw-items.js:14)
- Factory output counts persist locally; on reload, stored `itemsLeft` values recreate the appropriate icons at each factory so players can pick up previously-produced stock. (client/src/factories/BuildingFactory.js:70, client/src/storage/persistence.js:71)

## Networking
- Socket.IO server runs on port 8021 and rebroadcasts player, bullet, and building updates it receives from clients.
- Client emits `player`, `bullet_shot`, and `new_building` events when local state changes; listeners reconcile remote entities under `game.otherPlayers`.

## Houses ↔ Factories
- Every non-house building (including factories) must attach to a compatible house to accumulate staff population; without an attachment its population is reset to `0`. (server/src/Building.js:75, server/src/BuildingFactory.js:205)
- Attachment eligibility requires matching owner or matching city, and each house can host at most two attachments; the server picks the house with the fewest occupants. (server/src/BuildingFactory.js:224, server/src/BuildingFactory.js:237)
- When a factory attaches, its `cityId` is synced to the house and both sides receive `population:update` events so the client stays in sync. (server/src/BuildingFactory.js:248, client/src/factories/BuildingFactory.js:280)
- House population is always the sum of its attachment slots; demolishing a house clears every attached building's link and population, while demolishing the factory just frees the slot. (server/src/BuildingFactory.js:165, server/src/BuildingFactory.js:257, server/src/BuildingFactory.js:295)
- New houses retroactively claim eligible unattached buildings (again up to two), keeping older factories productive once housing exists. (server/src/BuildingFactory.js:299)
- Factories only begin item production once they reach full population (`POPULATION_MAX_NON_HOUSE` = 80), so sustaining a house link is required for output. (server/src/FactoryBuilding.js:15, server/src/constants.js:4)
- Houses cap their total population at `POPULATION_MAX_HOUSE` (160), while research centers and factories cap at 80; in practice one house can fully staff up to two such support buildings, so plan on **½ house per research center or factory**. Losing a house drops both attached buildings back to zero population until another house claims them. (server/src/Building.js:35, server/src/constants.js:3, server/src/BuildingFactory.js:295)
- Legacy behavior matches this ratio: each attached non-house building contributes its current population directly to the parent house (`pop = AttachedPop + AttachedPop2`). A single staffed research center therefore fills a house to 80 population, while two staffed centers (or a center plus a factory) take it to 160. (original/Battle-City/server/CBuilding.cpp:509, original/Battle-City/server/CBuilding.cpp:523)

> When adding new functionality, append the relevant rules here so they remain discoverable. Note the subsystem (play, draw, factory, etc.) and include any constraints or invariants that other developers should honor.
