# SALARYMAN Engine Kit

This is a text-first source export of the reusable SALARYMAN engines. It is
intended to be copied into another Replit project and adapted there. It is not a
drop-in deployment and it intentionally contains no secrets, database contents,
private object URLs, or environment values.

## What is included

- Art direction, art-family contracts, condition-aware briefs, prompt/style
  rules, render-provider interfaces, provider registry, QA, polish, and asset
  routing.
- Godot 4 art review/blocking project and the API render bridge.
- Unreal render-node client contract and provider adapter.
- World condition states, repair scoring, world economy, authoritative FIAT
  actions, jobs, cargo, market quotes, and recreation/arcade contracts.
- Office/pixel rendering contracts, world-facing client engines, and shared
  API/database contract sources.
- Org permissions, hiring/business operations, autopilot, AI routing, voice,
  phone, communications, trading, and broker adapter engine sources.

## Fast copy path

1. Start with `ENGINE_INDEX.md` and choose the engines you need.
2. Copy the matching folders under `src/` into the destination project's
   server/client layers.
3. Copy the shared contracts under `shared/` before wiring routes.
4. Read `COPY_MAP.md` and replace `@workspace/*` imports with the destination
   project's package paths.
5. Add the destination project's own auth, database, object storage, and
   integration adapters. Never paste credentials into source.
6. For art work, copy `godot/art-dev` and use the Unreal HTTP contract in
   `docs/unreal-render-node-contract.md`.

## Non-negotiable contracts

- The web runtime remains the gameplay renderer and the API remains
  authoritative for economy, art records, QA, provider selection, and world
  state.
- Art providers receive one baked visual direction. A renderer must not inject
  its own competing style.
- Generated art is review-only until explicitly approved and promoted.
- Unreal jobs fail clearly when the configured node is unavailable; they never
  silently fall back to another renderer.
- Condition changes affect localized wear, plants, clutter, stains, lighting,
  and repairs. They do not change collision, silhouettes, footprints, camera,
  animation timing, or interaction targets.
- Real-life clocks stay real-life clocks. Game jobs, wages, and provider
  polling must not invent accelerated time unless the destination app explicitly
  chooses that policy.

## Source export note

The files preserve the current production implementation and its comments. Some
files still depend on SALARYMAN-specific database tables, auth helpers, route
mounts, and integration packages. `COPY_MAP.md` identifies those seams; adapt
them rather than copying environment configuration.