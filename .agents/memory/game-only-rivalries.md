---
name: Game-only rivalries
description: Scope for corporate competition, coworker conflict, and faction mechanics.
---

Rivalry and competitive actions belong only to SALARYMAN's fictional game
simulation, including its live MMO economy. NPC corporations compete through
corporate greed and in-game sabotage, but can also cooperate strategically.
These actions must never call or affect real shop, payment, or external business
APIs.

**Why:** The user wants NPC corporations to compete through sabotage and greed
inside the live MMO while keeping fictional competition separate from real
business operations.

**How to apply:** Keep rivalry and sabotage outcomes inside the game economy.
Live MMO effects must be game-server-authoritative, but must not mutate a real
organization, shop, payment, or external business system.

SALARYMAN's game-side conflict should support corporate competition and espionage, not an outlaw culture. Weapons are rare and generally prohibited in offices; civilians discourage conflict. Drawing weapons in public building spaces is possible but illegal and may trigger fines. Nonlethal fistfights or melee with improvised objects do not carry fines. Lethal outcomes belong only in isolated, unmonitored areas when violence is necessary.

Combat may include either one-on-one duels or group/battle-royale encounters, but these remain fictional game events governed by the same safety and legality rules.

NPC corporate rivalries should use the added RDR2 Nemesis Rage mod as their
foundation: maintain relationships that can evolve through cooperation,
competition, and fictional business sabotage. The system should materially
change NPC shop behavior and business opportunities, not only dialogue.

Faction identity follows the brand. Each distinct brand is its own faction;
shops, locations, and organizations operating under that brand belong to that
faction rather than becoming separate factions by default. Different brands keep
separate relationships and histories.

Each shop location has its own boss within its brand faction: a brand with three
locations has three bosses. Track each boss as an individual NPC with personal
history and relationships, while preserving the shared brand-level faction.

Each boss is loyal first to their own shop, then to the parent brand faction.
Other brands are opposing factions; intra-brand bosses may cooperate while
competing brands remain rivals.

**Why:** the user clarified that brands define factions and each location has its
own boss, whose loyalty is ordered from local shop to brand.

**How to apply:** key rivalries, cooperation, and business effects to brand
identity, while keeping each brand's own shops and organizations connected to
its faction. Track each location boss individually beneath that faction and
make their shop-first, faction-second loyalty shape decisions. Keep all effects
fictional and server-authoritative.

Game equipment is managed through an inventory wheel. Carried inventory has a limit; org personal lockers have a large limit; public lockers have a smaller limit. The Tower public-locker shop may use Floor 4, Unit 8, which the user authorized to fill despite its prior unnamed status.

Organizations may also have shared storage rooms holding up to 2,000 items. Members with access can use the shared room, with a storage clerk supervising access.

**Why:** The user clarified the intended tone and boundaries for weapon use,
fines, rivalry, and NPC corporate sabotage.

**How to apply:** Keep ordinary competition nonviolent and abstract. Gate armed conflict by context, use equipped game items, and never allow casual lethal outcomes in occupied or secured spaces. Keep penalties fictional and game-side. Enforce each storage capacity server-side, and enforce shared-room access through org permissions.
