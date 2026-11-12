---
name: Org door locks (server-authoritative passcodes)
description: How SALARYMAN's organization door-passcode access control is wired across db/api/client, and the door_lock routing rule.
---

Org-controlled door locks let manager+ org members passcode-lock buildings/offices/makeshift spaces, with role-level gating. **The server is the only authority** — the client never decides access.

**Rule — door_lock interior object routing** (WorldPlay door_lock interaction):
1. building in COMPANY_HQ set → existing WS company-lock flow (`pwPrompt`), unchanged.
2. bid === player's personal home (`g.hamletBuildingId`) → existing client-only `HOME_PASSWORDS` flow, unchanged.
3. else, player is an ACTIVE org member → ORG manage UI (`orgDoorPrompt` mode 'manage'); manager+ can set/update/remove passcode + minRole, lower ranks see read-only info.
4. else → falls through to personal HOME_PASSWORDS.
**Why:** door_lock objects previously existed ONLY in `minx_arms` (personal unit) + `_company_hq`. Org spaces had none, so door_lock objects were added to `_office` and `_office_floor` interiors. Vans/tents use the fallback interior (no door_lock object) — they are still enforced via the tryEnter gate, just not manageable in-world yet.

**Entry gate (tryEnter):** client keeps only a HINT (`orgDoorLocksRef`, building ids + minRole/label/spaceType, NO passcodes) from `GET /orgs/doors/locked`. On entering a hinted+locked door it calls `POST /orgs/doors/enter`; only `allowed:true` proceeds. `requiresPasscode` → passcode prompt. Session-cleared doors cached in `orgDoorUnlockedRef`. Hint fetch failure is non-fatal (server still enforces).

**Contract gotcha:** `GET /orgs/doors/locked` returns the hint array under the key **`doors`** (canonical; matches `GET /orgs/:orgId/doors`), with `locks` kept only as a back-compat alias. The client reads `data.doors ?? data.locks`. If the hint comes back empty, `orgDoorLocksRef` stays empty and tryEnter NEVER gates → locked doors silently open. Keep both ends on `doors`.

**Update semantics:** `POST /orgs/:orgId/doors` requires a passcode only when CREATING a lock. Updating an EXISTING own-org lock may omit the passcode (metadata-only update of label/spaceType/minRole keeps the current code) — the manage UI's "leave blank to keep" depends on this.

**API (organizations.ts):** enter (optional-auth: member-with-role OR passcode), GET locked (public hint, no passcodes), GET/POST/DELETE `/orgs/:orgId/doors` (members read; manager+ write). Passcode min 6 chars; cross-org doorKey hijack → 409. Access checks use `getCallerMembership` + `hasRoleAccess` (ORG_ROLE_HIERARCHY: owner100>ceo90>executive80>director60>manager40>specialist20).

**Schema:** `orgDoorLocksTable` (lib/db organizations.ts) — `doorKey` globally unique, orgId FK cascade, label, spaceType (ORG_DOOR_SPACE_TYPES), passcode, minRole default 'specialist'.
