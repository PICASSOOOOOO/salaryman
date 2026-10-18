---
name: NPC economic agents
description: NPCs are full participants in SALARYMAN's economy, with needs, consumption, income, and wealth progression.
---

NPCs are part of the economy, not background decoration. They need food and other ordinary necessities, consume resources, receive income for productive work, and grow or lose personal wealth over time.

**Why:** The user explicitly wants NPC life to participate in the same persistent business/world system as the player.

**How to apply:** When adding an NPC domain, include its needs, spending, income source, wealth state, and visible progression. Avoid player-only economy logic that makes NPCs passive props.

## Public maintenance workforce

Keep the maintenance NPC group small and believable. Give workers routes, breaks,
and realistic work conditions; most should be slow and average rather than
consistently efficient. Limit specialist NPCs to one or two, each with a defined
automation responsibility that can also work through the shared browser/game
bridge for free features.

**Why:** the user wants NPC labor to make public-work payouts sustainable without
making the crew feel like perfect, unlimited automation.

**How to apply:** model individual capability and work cadence when assigning,
animating, and paying public maintenance jobs. Keep specialist automations
distinct, and do not create separate game-only assistant backends.

Public maintenance payouts are issued by receptionist Mila from the game reward
pool. Private organization work is paid by that organization's receptionist only
after verified completion. These payer roles do not create separate assistant
backends.

**Why:** the user assigned the public and private maintenance payment roles.

**How to apply:** record the named receptionist as the payment agent, but settle
money from the authoritative public pool or the owning organization's funds.

## NPCs as purposeful automation characters

NPCs should extend existing API automations rather than use separate game-only
assistant backends. Fraction each automation into narrow NPC roles: no NPC should
have broad, all-purpose authority. Each should be a useful, recognizable character
with one real job, a destination or route, and a concrete responsibility, and may
innovate only within that job's domain. Prefer a small cast with meaningful roles
over many generic background NPCs. NPC-operated businesses may grow into
specialized sellers and develop improved versions of their products; do not imply
that this progression is active until it has a real simulation.

**Why:** the user wants NPCs to be useful characters with purpose and ongoing
activity, not decorative population. They also require API automations to be
fractioned into narrow roles so each NPC can only do its job and innovate within
that scope.

**How to apply:** reuse the corresponding API automation as the source of truth
for each NPC's bounded work; keep identity, job, goal, and route connected.
Structure business stock with stable product families and version metadata so
future NPC growth can build on it, while clearly distinguishing data readiness
from live behavior. Keep each NPC's tools and decisions limited to its own job
and improvement domain.

## Fish pets and unique companions

Fish live in tanks, not as followers; tanks are furniture/decor that can be moved
around within a room. Fish are chosen and purchased individually, using real-world
species with prices that reflect the species.
Dogs and cats may follow their owner. Each character can have at most one unique
NPC companion or assistant, with no duplicates; companions may follow and unlock
task automations as the game progresses.

**Why:** The user explicitly distinguished tank-based fish from following animal
companions and defined the one-unique-companion-per-character progression rule.

**How to apply:** Keep fish placement and care attached to their room's aquarium
state. Enforce companion uniqueness per character, and expose automation only as
the companion's progression unlocks it.

All living beings in the SALARYMAN ecosystem—including players, NPCs, and pets—
share survival-health concerns: disease, illness, fatigue, stress, poison,
nursing/care, and possible death or lethal harm.

**Why:** The user explicitly wants a sandbox survival office sim RPG MMO where
health consequences apply to all living beings, not only the player.

**How to apply:** See [Ecosystem condition, survival, and maintenance](asset-decay-scope.md)
for differentiated human, replicant, and pet needs, and for how health fits into
the wider world-condition system.