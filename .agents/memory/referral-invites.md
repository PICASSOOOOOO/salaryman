---
name: Referral invite system
description: Durable design decisions for recipient-addressed referral invites (email/SMS) — attribution model and anti-abuse invariants.
---

# Referral invites

Players invite outsiders by email/SMS; a unique-token link converts on the
invitee's first sign-in, paying a one-time reward to both sides, credited to the
**bank checking account** (the canonical server-authoritative wallet) so delivery
is offline-safe and survives the invitee being logged out.

## Attribution: two deliberate paths
- **Token link is primary** (only path that covers SMS). Because the recipient is
  usually logged out when they click, the token must survive the sign-in boundary —
  persist it client-side and retry accept after auth (a 401 means "not signed in
  yet, keep the token"). Clear only on a non-401 response.
- **Email auto-reconcile is secondary**, run from the auth JIT path, and must be
  gated to brand-new accounts only. **Why:** never silently reward a long-standing
  player just because someone emailed their existing address.

## Anti-abuse invariants (do not regress)
- Welcome reward is for NEW players only — the token-accept path also rejects
  established accounts (account-age window), or an old account could farm rewards.
- Self-referral blocked; a person is attributed at most once ever.
- Reward payout must be **atomic + idempotent under concurrency**: claim the invite
  row with SELECT…FOR UPDATE and do claim + both payouts + flag-set in ONE
  transaction, so retries / concurrent accepts can't double-pay. Earlier read-then-
  write (paying before flagging) was rejected in review as a double-pay race.
- DB-level uniqueness is the backstop, not just app checks: partial unique indexes
  on (inviter, email)/(inviter, phone) for send dedupe and on invitedUserId for
  one-attribution-per-person. Catch unique-violation (PG 23505) and surface it as a
  benign dedupe/"taken", never a 500.

**Why all this:** money rewards are an economic-abuse target; correctness under
races and against existing-account farming was the explicit review blocker.
