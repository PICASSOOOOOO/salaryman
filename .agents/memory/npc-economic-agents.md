---
name: NPC economic agents
description: NPCs are full participants in SALARYMAN's economy, with needs, consumption, income, and wealth progression.
---

NPCs are part of the economy, not background decoration. They need food and other ordinary necessities, consume resources, receive income for productive work, and grow or lose personal wealth over time.

**Why:** The user explicitly wants NPC life to participate in the same persistent business/world system as the player.

**How to apply:** When adding an NPC domain, include its needs, spending, income source, wealth state, and visible progression. Avoid player-only economy logic that makes NPCs passive props.

Build a broad Sims-like life simulation for residents, not just an economy or
business simulator. Personal life includes needs and wellbeing, faith and
beliefs, relationships and family (marriage, children, affairs, and pregnancy),
work, homes and living conditions, desires, money and debt, routines, and
emergent social events. Keep this breadth original to SALARYMAN's live city and
its dystopian corporate setting.

The life simulation also spans public and private services and real estate:
clinics, water fountains, restrooms, hostels, hotels, apartments, rent,
ownership, and citizenship. Restrooms restore stamina. These systems should
connect to residents' wellbeing, housing, finances, legal status, and everyday
choices.

**Why:** The user clarified they want the full breadth of The Sims-style life
simulation, including the previously named relationships and family systems.

**How to apply:** Treat residents as persistent people with interconnected
needs, relationships, work, finances, and living conditions. Make choices and
events affect ongoing routines and relationships rather than reducing life
systems to one-off decorative dialogue. Connect housing, services, rent,
ownership, and citizenship to the same persistent life simulation.

Education is a major progression meter. The current fictional school focuses on
business training; real schools can also increase education and award XP.
"School of hard knocks" experiences can award XP only when they teach a real
lesson about commerce, finance, or capitalism; that XP is not itself formal
education. Education provides a bonus to XP gain, and XP improves credit score
and stats. More education should provide stronger skill boosts and business
advantages.
Do not put cooldown timers on education; real education does not work that way.

**Why:** the user wants education to be substantial, school-led progression,
with the fictional school focused on business training, real-school contributions,
XP-linked credit and stats, and practical business lessons counting only when
they actually teach something. Higher education should improve skills and
business outcomes without artificial cooldowns.

**How to apply:** keep formal education separate from XP. Award practical XP for
meaningful commerce, finance, or capitalism learning, but do not let other
activities raise the education meter. Let higher education increase relevant
skill bonuses and business advantages, and let education boost XP gain. XP
should contribute to credit score and stats. Do not gate education progression
behind cooldown timers or assume specific formulas.

## Relationship-based profile information

Players can examine both other players and NPCs. The information shown is
limited by the relationship: strangers reveal less, and stronger relationships
can reveal more. Progression through these levels comes from extensive
participation between the examining player and the NPC or player being examined;
both sides' involvement matters.

- Level 1: name.
- Level 2: name and age.
- Level 3: name, age, and profession.
- Level 4: name, age, profession, and credit score.
- Level 5: name, age, profession, credit score, and net worth.

Criminal or unemployed NPCs should still present as employed. Advanced criminals
may use a front company, including having a business office.

**Why:** the user wants relationship-based limits on examining both NPCs and
other players, with five exact information levels that deepen through extensive
participation by both parties. The user also wants criminal and unemployed
NPCs to have an employment presentation, with front companies available to
advanced criminals.

**How to apply:** make profile disclosure gradual rather than all-or-nothing,
enforce the level gates server-side, and keep each field within its security
and data-access permissions. Base progression on substantial participation
between the two people, not a one-sided profile view. Give criminal/unemployed
NPCs an employed presentation, and let advanced criminals use a front company
with an office.

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

## Shop staffing, schedules, and personal lives

Shops operate 24/7 with four staggered nine-hour shifts, including a one-hour
lunch and two 15-minute breaks. Overlapping coverage is intentional and is
funded by the shop's budget. Up to 3–5 employees per shift is the maximum
staffing example, not a requirement for every shop; staffing needs vary by
business.

NPCs have routines and family obligations that shape their work and choices.
They can get sick, marry, feel sadness or depression, and commit suicide, among
other human life events. NPCs walking around can talk about their routines,
shift trades, and gossip through in-world dialogue boxes.

Shop work should be more difficult than ordinary labor, and players can help.
Keep a continuing need for shop workers available. Some businesses may remain
short-staffed for months or employ incompetent NPCs who are later fired, leaving
the shop short-staffed again.

**Why:** the user wants 24/7 businesses with budgeted overlap, variable staffing
demand, player-help opportunities, ongoing worker openings, and realistic labor
shortages, alongside NPC personal obligations and wellbeing.

**How to apply:** model each location's shift coverage and each employee's
routine, family obligations, and competence together. Keep staffing levels
business-specific, allow long vacancies and repeated firings, and make the
maximum four-shift staffing example affordable to the shop. Keep handoffs,
trades, and life events visible through walking NPC dialogue.

Public maintenance payouts are issued by receptionist Mila from the game reward
pool. Private organization work is paid by that organization's receptionist only
after verified completion. These payer roles do not create separate assistant
backends.

**Why:** the user assigned the public and private maintenance payment roles.

**How to apply:** record the named receptionist as the payment agent, but settle
money from the authoritative public pool or the owning organization's funds.

## NPCs as purposeful automation characters

NPCs should extend existing API automations rather than use separate game-only
assistant backends. Fraction the curated workforce into named specialist NPCs with
a unique identity, story, purpose, job, destination or route, and bounded authority.
Pablo Corp's rental roster may grow into many such characters, not generic background
headcount. The Prime office secretary is the explicit all-skills/all-automations
exception, but must still reuse the existing automation systems.
NPC-operated businesses may grow into
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

## Pablo Corp workforce rentals and Prime secretary

Game-world NPC hires cost a signing bonus plus a recurring daily rate. The
minimum-wage benchmark for NPCs and humans is USD-equivalent $1/hour: a 12-hour
workday is $12/day, paid in game FIAT (ƒ12/day).

Pablo Corp owns the Tower and a curated roster of named, costumed specialist NPCs
included with PABLO PRIME's browser-side workforce access. Each roster character
is unique: only one exists and can be rented by one organization at a time;
in-game organizations hire specialists for their particular strengths at a
steep price. NPCs may be working, unemployed, sick, displaced by a business
disaster, or starting their own businesses; they should autonomously pursue
wealth and compete with players and each other.

A PABLO PRIME Stripe subscription automatically triggers an elaborate elevator
cutscene delivering one distinctive secretary to the subscriber's office. This
secretary combines the available skills and automations, with a unique name and
costume; the secretary is included in the Prime package, with no separate setup
fee. She is a physical office worker: for an automation, she walks to relevant
objects and the terminal and visibly works there. Players access and configure
her skills through the game terminal's Automations section, parallel to the
browser surface. Reuse the same server-side automations and reflect their actual
run state and duration; do not simulate instant work or invent a fixed AI delay.
When the player is away, she acts as an office manager; where a human office
manager is assigned, she supports that person with their work rather than
replacing them.
Without Prime, players ask the receptionist which Pixel Agent or NPC is
available for work. Hiring and construction organizations are subject to
regulations.

## Secretary-led office command and delegation

The secretary is the unified interface to SALARYMAN's technology and automation
services. Real human employees can issue commands from their office terminals;
the secretary identifies available capabilities, performs the work, and can
coordinate or delegate suitable subtasks to NPC staff hired by the organization.
She runs operations when the owner or human management is away, while also
helping human managers learn how to use her and the available tools.

Each human employee needs an individual desk, chair, and computer terminal, but
the organization owner must purchase these furnishings; they are not provisioned
automatically. Furnishings and their customizations cost in-game money.
Organization systems and automation configurations are shared across members;
a task submitted from any member's purchased terminal can be routed to the
secretary and her hired NPC support staff.

NPCs hired to support this work receive a one-time signing bonus and recurring
daily pay under a fixed-term contract lasting weeks or months. This is
pay-as-you-go employment: organizations must keep funds available for payroll.
Unfunded obligations can lead to debt collection and organization shutdown.
Keep payroll obligations distinct from daily tax assessments, even if future
collections share infrastructure.

**Why:** The user wants actual human office workers to get work done through
commands, the secretary to coordinate human and NPC labor, and NPC employment
to create persistent financial obligations with consequences.

**How to apply:** Route commands through real, existing capabilities; retain
approval, permissions, and execution status. Let the secretary coordinate NPCs
without turning them into generic duplicate agents. Track signing bonuses,
contract terms, daily wages, and available organization funds separately from
taxes; do not assume a specific collections grace period for payroll.

**Why:** The user explicitly distinguishes paid game NPC labor, Pablo Corp's
exclusive specialist rentals, Prime-triggered secretary onboarding, and an
in-world secretary that physically performs real automation work and supports
the human office manager when the player is away.

**How to apply:** Keep individual hiring costs and NPC rental exclusivity in the
game economy; gate the automatic all-skills secretary and online workforce
access on the existing Prime subscription, with no extra secretary fee. Drive
office movement/status from real automation activity and share the browser
backend; never create a parallel pretend execution loop. Never allow concurrent
rentals of the same specialist. Pay the wage floor in FIAT.

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