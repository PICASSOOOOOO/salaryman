---
name: Account identity linking
description: How "connect provider X to my existing account" works (account_identities table, link-wins-over-email upsert rule).
---

# Account identity linking ("connect from profile")

Users can attach a secondary OAuth identity (GitHub, and later Discord) to an
ALREADY-signed-in account, instead of that provider creating a fresh
`github:<id>` / `discord:<id>` user row.

## Mechanism
- Generic table `account_identities` (lib/db/src/schema/account-identities.ts):
  userId FK→users (cascade), provider, providerUserId, providerUsername,
  timestamps; `unique(provider, providerUserId)` + index(userId).
- A provider backs EXACTLY ONE app account.

## The hard rule
`upsert<Provider>User` (auth.ts) MUST consult `account_identities` FIRST:
1. link row exists → use its userId (link wins over email match), backfill blanks.
2. fall through to email-link / new-account ONLY if no link (or dangling link).
**Why:** the whole point is that the linked account is authoritative even when
the provider email differs from the account email; checking email first would
mis-route or 500.

## Connect/disconnect flow (profile)
- `GET /auth/github/connect` (session-gated) sets `github_link_user` cookie +
  state/return_to, redirects to provider authorize.
- `callback` branches on `github_link_user`: verify req.isAuthenticated() &&
  req.user.id === linkUserId; reject `already_linked` if the identity already
  maps to another user OR a standalone `github:<id>` account exists; else
  insert/update link; redirect `?github_linked=1` or `?github_link_error=...`.
- `GET /auth/github/status` → {configured, linked, githubLogin, linkedAt}.
- `POST /auth/github/disconnect` deletes the link (primary sign-in untouched).
- Frontend: GithubLinkSection.tsx (mirror of GoogleLinkSection) in Profile.tsx;
  connect via window.location to apiUrl(/api/auth/github/connect?returnTo=path).

## Status
GitHub + Discord both wired end-to-end + tested (api-server/src/__tests__/
github-link.test.ts, discord-link.test.ts). Discord mirrors GitHub exactly:
connect/status/disconnect routes + callback link branch (discord_link_user
cookie) + upsertDiscordUser link-first lookup; status returns discordUsername;
connect also best-effort guild-joins. Frontend DiscordLinkSection.tsx in
Profile.tsx. Google also has a link section but a different (Replit-managed)
mechanism — not account_identities.

## Gotchas
- account_identities.user_id has a REAL FK to users — tests must seed a users row
  (unlike the FK-less twilio test tables).
- Editing replit-auth-web shared lib? its dist .d.ts can go stale (loginWithGithub
  missing) → run `npx tsc --build` at repo root before artifacts typecheck clean.
