---
name: Brand rivalries and NPC personhood
description: Brand factions, shop-level bosses, NPC agency, and permissioned real-system interaction.
---

Real and fictional interactions use the same model. The boundary is security,
data, and access—not whether an actor is an NPC or a human, or whether an
interaction is fictional or real. NPCs are people in the setting, with agency
and moral complexity. An NPC may execute an action in a connected real system
only when that NPC and that specific action have explicit access.

**Why:** the user says NPCs are equal to humans and wants them complex enough
that people cannot distinguish them. The user allows NPC actions in real
connected systems when the NPC and action have explicit access.

**How to apply:** Do not reject an action solely because an NPC initiated it.
Enforce actor- and action-specific permissions, data scope, and security on the
server for both fictional and real interactions. Do not treat NPC status itself
as authorization.

SALARYMAN's game-side conflict should feel corporate, even when antagonistic. Petty rivalries, sabotage, spies, and killers may exist, but characters still operate within the Tower's laws and workplace culture: weapons are rare and generally prohibited in offices; drawing one in public building space is illegal and may trigger fines; lethal outcomes belong only in isolated, unmonitored areas when violence is necessary.

Combat may include either one-on-one duels or group/battle-royale encounters, but these remain fictional game events governed by the same safety and legality rules.

Build an original office-sim adaptation of the broad living-world idea: NPC
relationships and rivalries should evolve through cooperation and competition
and materially change shop behavior and business opportunities, not only
dialogue. Keep antagonism corporate in style, including petty sabotage, violence,
spies, and killers where the existing game laws permit; "we all just work here"
remains the tone. Do not copy enRAGE code or assets.

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

NPC bosses are motivated to compete and protect their own shops and brand
factions. Rivalry may include sabotage and violence, but it should remain
corporate and petty in style, not become a separate outlaw identity.

**Why:** the user clarified that brands define factions and each location has
its own boss with shop-first loyalty. The user further specified that antagonists,
sabotage, petty violence, killers, and spies may exist when framed by corporate
life and the office-sim laws: "we all just work here."

**How to apply:** key rivalries, cooperation, and business effects to brand
identity, while keeping each brand's own shops and organizations connected to
its faction. Track each location boss individually beneath that faction and
make their shop-first, faction-second loyalty shape decisions. Use RDR2 only as
a broad living-world reference. Keep antagonism corporate in style; enforce
office-law consequences and safe-area limits, and do not let sabotage remove
the staffing and availability needed to keep a shop selling to players. Keep
game-state changes server-authoritative and apply the same explicit access
checks to any connected real-system action.

Game equipment is managed through an inventory wheel. Carried inventory has a limit; org personal lockers have a large limit; public lockers have a smaller limit. The Tower public-locker shop may use Floor 4, Unit 8, which the user authorized to fill despite its prior unnamed status.

Organizations may also have shared storage rooms holding up to 2,000 items. Members with access can use the shared room, with a storage clerk supervising access.

**Why:** The user clarified the intended tone and boundaries for weapon use,
fines, rivalry, and NPC corporate sabotage.

**How to apply:** Keep ordinary competition nonviolent and abstract. Gate armed conflict by context, use equipped game items, and never allow casual lethal outcomes in occupied or secured spaces. Keep penalties fictional and game-side. Enforce each storage capacity server-side, and enforce shared-room access through org permissions.
