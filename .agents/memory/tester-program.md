---
name: Tester program (alpha → tester)
description: How SALARYMAN's capped tester program, inactivity sweep, and Discord gating are wired and why.
---

The "alpha program" doubles as the community TESTER PROGRAM. Key durable decisions:

- **20-slot cap, owners exempt.** `MAX_ALPHA_TESTERS` counts only approved `alpha_tester` rows whose user email is NOT an owner (`isOwnerEmail`). Owners are seeded approved and must never consume or be swept from a slot — every count/sweep filters them out.
  **Why:** owners are auto-seeded testers; counting them would permanently eat slots and the sweep would revoke staff.

- **Approval cap is enforced atomically.** The decide route wraps the recount + status write in one `db.transaction` and takes `pg_advisory_xact_lock(ALPHA_CAP_LOCK_KEY)` before counting, so two concurrent approvals can't both pass a stale 19/20 check. Returns 409 `{capReached:true}` when full.
  **How to apply:** any new path that newly occupies a tester slot must go through the same lock+recount, not a bare count-then-update.

- **3-day inactivity auto-revoke.** `sweepInactiveTesters()` (scheduled in index.ts: 90s after boot, then hourly) revokes testers whose `max(users.lastActiveAt, decidedAt) < now-3d`. Using `decidedAt` as a floor guarantees a freshly-approved tester always gets a full window. The revoke UPDATE is guarded `WHERE id AND status='approved'` and only notifies when a row actually changed, so overlapping sweeps don't double-revoke.
  **Why:** `lastActiveAt` of a just-approved tester who hasn't sent a heartbeat yet would be stale and revoke them instantly.

- **Discord "join" is GENTLE, not hard-gated.** Requirement was deliberately softened to a dismissible banner (localStorage `salaryman_discord_banner_dismissed`) + tester-rules warning + an acknowledgment checkbox that gates the tester submit button. There is NO server-side guild-membership block on approval — that would contradict the gentle direction and needs unconfigured bot infra.

- **Approved testers auto-become Discord moderators** via best-effort `assignGuildRole` (PUT guild member role), only for `discord:<id>` users and only when `modRoleConfigured()` (bot token + guild id + `DISCORD_MOD_ROLE_ID`). Silent no-op otherwise; never blocks the approval.

- **Discord login was broken ONLY because all `DISCORD_*` env vars were missing** — the OAuth callback code (upsertDiscordUser + createSession) is correct. Login needs just `DISCORD_OAUTH_CLIENT_ID` + `DISCORD_OAUTH_CLIENT_SECRET`. Auto-join/auto-mod additionally need `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_MOD_ROLE_ID`. Public invite is the shared env `DISCORD_GUILD_INVITE_URL`.
