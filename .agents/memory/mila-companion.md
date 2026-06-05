---
name: Mila replicant companion (physical NPC)
description: How the in-world Mila companion (desk + follower + wardrobe) is wired in WorldPlay, distinct from the chat-assistant Pablo→Mila persona swap.
---

# Mila replicant companion

A PHYSICAL paper-doll NPC in WorldPlay.tsx — separate from the chat-assistant
Pablo→Mila persona swap (see mila-pablo-persona.md). Do not conflate them.

- **State**: `g.mila { x, y, outfitId, task: 'follow'|'stay', dialogueCooldown, spawnAt }`.
  Persisted in the save blob as `milaOutfitId` + `milaTask` (loaded from `_ss`).
  `spawnAt` is ephemeral (drives the materialise/appear fade; reset to 0 when
  off-duty so she re-appears beside the player when a mission goes live).
- **Desk (home interior)**: rendered + `[E]`-interactable whenever the player is in
  their OWN home interior (`itr.bid === g.hamletBuildingId`) — NOT gated on story.
  She idles at her desk off-duty. Anchored next to the first `terminal` (then
  `desk`) object in the interior def.
- **Follow (open world)**: gated on `g.story?.active && task==='follow'`. Cloned from
  the `g.dogCompanion` follow-AI (no combat). World sprite render is gated the same
  way + `spawnAt !== 0`.
- **Rule — desk = always-home, follow = story-only**: the plan's "follows during
  story missions, idles at her desk otherwise" means the desk/panel must be reachable
  regardless of story state; only the world follower is story-gated. An early version
  gated the desk on story.active too and the architect flagged it (panel unreachable
  pre-story).
- **Label** `Mila-<orgSerial>` via `milaLabelRef`. **Limitation/drift**: client
  `OrgDataShape.org` exposes no org key/slug, so `orgSerialCode` can't be computed
  client-side; label falls back to `PICASSO_SERIAL` ('A-001') for everyone. True
  per-org serials need the org key surfaced in OrgDataShape (follow-up).
- **Wardrobe**: both Mila and the player wear the SAME Armory "outfit"-slot catalog
  items (item-catalog.ts). The Mila panel fetches `/api/items/catalog` +
  `/api/items/inventory?slot=` and lists OWNED `type==='clothes'` items. Selecting one
  sets `g.mila.outfitId`; her sprite tint comes from `clothOutfitColor(id)` →
  `CLOTH_OUTFIT_COLORS` map in character-identity.ts (keyed by catalog id). The
  player's own avatar already gets a rarity tint from drawGearOutfit on equip, so
  "player wears catalog clothes" needs no extra wiring.
- **Freeze**: `showMila` must be in the `frozenRef.current` chain (modal open ⇒ freeze).
