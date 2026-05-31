---
name: Mila / Pablo assistant persona swap
description: How the SALARYMAN assistant switches from Pablo to Mila once a player's story is active, and the hard constraint that Pablo's look/voice must never change
---

# Mila vs Pablo assistant persona

When a player's story is active, the in-game assistant swaps from Pablo to Mila
(escaped replicant, warm/rebellious, hunted by Pablo Corp). The swap drives her
own prompt, a distinct aqua/teal orb variant, her own voice, and occasional glitchy
"Pablo claws back" intrusion lines spoken in Pablo's voice before her reply.

**Two rules that bit us:**

1. **Persona is server-authoritative — never a client flag.** It's derived from
   gameplay save state (active story), so EVERY surface must agree: the chat
   routes, AND a way for the terminal to learn the persona on load (not only after
   the first message round-trip) or it briefly renders the wrong identity. When you
   add a new surface that shows "who's answering," wire it to the server signal.

2. **HARD CONSTRAINT (user raised firmly, twice): Pablo must stay byte-identical.**
   His orb visuals and his default voice cannot change for pre-story players — the
   swap is strictly ADDITIVE (new variant/prompt/voice, gated on persona), never a
   fork or edit of Pablo's existing assets. Portrait was removed to match their
   screenshot; only restore if they ask.

**Why:** the user is highly sensitive to any visual/voice regression on Pablo, and
a half-swapped terminal (Mila's words under Pablo's label/orb) reads as a bug.

3. **First-frame persona cache must be account-scoped.** To paint the right
   identity on the very first frame (before the server persona fetch resolves) the
   terminal seeds from a localStorage cache. In a static SPA the user's id itself
   is only known after an async auth fetch, so a shared/global cache key lets a
   DIFFERENT account on the same browser inherit a stale Mila — a Pablo regression
   for a pre-story player. Store the cache as `{ uid, persona }`, validate the uid
   once auth resolves (guest or mismatch → drop it + re-resolve persona), and clear
   it on logout. A zero-frame cross-account guarantee is impossible client-side
   without SSR/bootstrap; the residual is one self-correcting frame only in the
   pathological "switch accounts without logging out" path.

**Why (rule 3):** two architect rounds rejected first-frame Pablo-flash for Mila
players AND cross-account Mila-flash for Pablo players; these can't both be perfect
without server-rendered persona, so account-tag + correct-on-resolve is the bar.
