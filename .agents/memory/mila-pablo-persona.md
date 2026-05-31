---
name: Mila / Pablo assistant persona swap
description: How the SALARYMAN assistant switches from Pablo to Mila once a player's story is active, and the hard constraint that Pablo's look/voice must never change
---

# Mila vs Pablo assistant persona

When a player's story is active, the in-game assistant swaps from Pablo to Mila.
Persona selection is **server-authoritative** in `chat.ts` — decided from
`userHasActiveStory(userId)` / `storyDefected`, NOT a client flag — across both the
chat-completion route (`/chat/pablo/message`) and the terminal command route
(`/chat/pablo/command`). Success responses carry a `persona` field; persisted bot
messages flip senderName to `MILA` when active.

- **Mila** = escaped replicant ("MEE-lah"), warm/rebellious, works for Jean Claw on
  paper but really for the player, hunted by Pablo Corp, phone routes OFF-LIMITS.
  Prompt: `MILA_SYSTEM_PROMPT`. Orb: `MILA_VARIANT` (aqua/teal) in PabloNebula3D,
  rendered only when `persona === 'mila'`. Voice: `character: "MILA"` via
  resolveVoiceId (openai/index.ts).
- **Pablo intrusions**: ~16% chance (`maybePabloIntrusion()`, `PABLO_INTRUSIONS[]`)
  Pablo "claws back" — the terminal plays the intrusion line in Pablo's voice
  (`character: "PABLO"`) BEFORE Mila's reply.

**HARD CONSTRAINT (user raised firmly, twice):** Pablo's nebula orb (`PABLO_VARIANT`)
and Pablo's default voice (no `character`) must stay byte-identical for pre-story
players. Only his "brain"/behavior may change. Portrait already removed to match
their screenshot — only restore if they ask. Don't refactor the shared
PabloNebula3D in a way that touches the Pablo path.

**Why:** the user is highly sensitive to any visual/voice regression on Pablo; the
swap must be additive (new variant/prompt/voice) and gated, never a fork of Pablo's
existing assets.
