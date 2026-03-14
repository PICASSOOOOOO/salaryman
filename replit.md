# Workspace — Salaryman by Picassoo.ai (PABLO device)

## Overview

pnpm workspace monorepo using TypeScript. **Salaryman** is the master brand — an AI-powered executive productivity suite and the foundation of a post-apocalyptic MMO world. **PABLO** is the in-world mega-corporation whose products power the suite. The app is the "PABLO device" players carry. Branding dual-mode: "SALARYMAN / PABLO CORP. DEVICE v1.0" (real) and "DevDocs" (discreet cover). Part of the Picassoo.ai product suite.

### Brand Architecture
- **Salaryman** — master brand, the world, the game (future MMO: Cyberpunk × Fallout × FF7 × Blade Runner, 1980s Japan post-apocalyptic)
- **Minx City World** — 2.5D isometric canvas RPG with billboard advertising marketplace (8 ad slots), proximity-based interaction ([E] key), in-game Florin/CREAM currency purchases, admin panel at `/admin/billboards`. World is 14400×12600 with city centered at (7200,6300), city bounds CITY_LEFT=5400, CITY_RIGHT=9000, CITY_TOP=5100, CITY_BOTTOM=7500. City uses modern urban grid with streets at x=5700/6200/6700/7200/7700/8200/8700 and y=5400/5850/6300/6750/7200. Player starts indoors at (5555,5620) in MINX ARMS building. Wasteland features: procedural trees, rocks, grass patches. Sewer system with manhole covers at street intersections. Features day/night cycle (worldTime 0-24), behavior state machine for threats (SLEEPING/WORKING/CAMPING/SOCIALIZING/PATROLLING/HOSTILE), faction schedules, conditional hostility based on player class and territory, minimap radius 180px with 900 world unit view.
- **Game Systems Module** (`gameSystems.ts`) — Centralized module for: 13-month calendar (1 real hour = 1 game day), 4-season weather system (CLEAR/RAIN/SNOW/STORM/ACID_RAIN/HEATWAVE/FOG/DUST/OVERCAST), rare disasters (FIRE/EARTHQUAKE), radiation zones in wasteland (5 zones with varying intensity), Gold Exchange economy (FIAT_PER_GOLD=100000, year-scaling tax), treasure chests/maps (8 chests, 3 maps), Boomer Mode terminology map, branching dialogue system (DialogueTree/DialogueNode/DialogueChoice), rumor system (20+ floating NPC rumors), character costumes (8 options), timezone cities, subscription pricing ($4-6/mo), lore weapon names, weather particle rendering.
- **Economy** — Dual currency: FIAT (standard) + GOLD (premium via Gold Exchange building at x:6100 y:6800). Tax scales with in-game calendar year. Property purchase requires gold.
- **Building Interiors** — Walkable interior rooms for key buildings. Interior system uses `InteriorDef` objects with floor layout, wall boundaries, furniture objects, and exit trigger zones. Buildings with interiors: Minx Arms (apartment unit 408), City Clinic, East Clinic, North Clinic, plus generic shop/office templates for pablo_store, noodle_bar, pawn_shop, markets, print shops, data_vault, oxide_labs, call_home, terminal_shop. Entry uses fade-to-black transition via `interiorFade`/`interiorFadeDir` state. Player moves inside with WASD/arrows, collision against walls and furniture objects (except windows/plants). Exit door at bottom of room returns player to exterior. Indoor-start cinematic now spawns player inside Minx Arms apartment. Hospital wake-up spawns inside City Clinic interior. Threats cannot aggro while player is indoors. Existing building interactions (healing, shopping, etc.) execute on entry. Interior map: `BUILDING_INTERIOR_MAP` in WorldPlay.tsx.
- **NPC System** — All NPCs use original names (no derivative/copyrighted names). Each NPC has `NpcDef` interface with: name, x, y, type, gender, job, home (building ID), workplace (building ID), whisper, backstory, optional role (police/guard/corpo_military/corpo_worker/dealer_papers/dealer_weapons/homeless/pedestrian), voiceActor (boolean), walkSpeed (number), personality (string), voiceLines (string[]). NPCs follow a daily schedule: home (20:00-6:00), commute to work (6:00-8:00), at work (8:00-18:00), commute home (18:00-20:00). Schedule positions computed by `getNpcSchedulePos()` using `worldTime`. Key NPCs: CLARA BRENNAN (grand_meridian bartender), MILES ORREN (ashfield_hostel utility mgr), ALDRIC PENN (overlook porter), DREN MALIK (rust_porch cook), PETRA VANCE (bastion_keep guard), LIRA WYNNE (ashfield_hostel medic), SENNA KADE (document forger dealer), ROOK TALVERA (city arms dealer), MARSH KETTER (wasteland arms dealer), FINN CORVANE (document forger). RAT threat type: HP=4, EXP=1, BOUNTY=0, passive, color=#665544, 12 spawns in city alleys. Print Shop has library feature (6 books) when press is on cooldown. Faction roles: corpo_worker (civilian Pablo Corp employees, no combat), corpo_military (armed tower guards, protect corp assets only), police (slow patrol, corrupt_bureaucratic personality). All 30+ named story NPCs have voiceActor:true with 3 curated voiceLines each, played via Web Speech API TTS on interaction.
- **Audio Systems** (`soundEngine.ts`) — Spatial audio engine with distance-based volume attenuation (spatialVolume, MAX_SPATIAL_DIST=800px). Proximity system (isWithinEarshot, EARSHOT_RADIUS=600px). Environmental SFX: sfxSpatialStep (surface types: concrete/metal/dirt/wood), sfxDoor, sfxVehicle, sfxMachinery, sfxWeaponDraw, sfxItemPickup, sfxUIClick, sfxWeatherRain, sfxWeatherWind. Crowd murmur system: startCrowdMurmur/updateCrowdMurmurVolume/stopCrowdMurmur — volume scales with nearby NPC count. Voice dialog: speakDialog/cancelSpeech using Web Speech API TTS with gender-based voice selection. Proximity overheard conversations: ConversationEvent system with POLICE_STOP_DIALOGS and CORPO_MILITARY_STOP_DIALOGS — police/corpo military randomly stop citizens, players within earshot see dialog text in HUD.
- **Field Guide Factions** — WorldMenu.tsx GUIDE_SECTIONS includes 'factions' tab with entries for Pablo Corp Workers, Corpo Military, Police, and Wasteland Gangs (Iron Rats, Void Dogs, Static Monks, Eastern Bloc).
- **Mobile Terminal** — Terminal-only mobile web view at `/mobile` route. Provides remote access to character stats, Pablo AI chat, and business overview without 3D rendering. Connects to same cloud save data via `/api/salaryman/saves`. Accessible via links in WorldMenu footer, WorldPlay top menu, and Profile page. Mobile-optimized with `100dvh`, max-width 480px, touch-friendly controls.
- **PABLO** — in-world mega-corporation that manufactures all the tools (AI assistant, devices, software)
- **Calll Home** — PABLO's CRM + dialer product, lives inside the suite (insurance industry, needs API connection)
- **Picassoo.ai** — company umbrella (3 products: Salaryman, Calll Home)

### UI Theme
- CRT/Pip-Boy aesthetic: phosphor green (#00ff41) on black, scan lines, VT323 + Share Tech Mono fonts
- All borders square (no border-radius), terminal language (UPPERCASE labels, monospace)
- Multiple skins planned (same features, different look)

## Freemium Model

- **Free tier**: PABLO AI chat only (fully functional, always free)
- **Pro tier** ($4–6/mo, 7-day free trial): PABLO AI Pro + Live Listen, Scan Screen, Presenter Mode, Contacts/CRM, Workspace
- **Gating**: `ProGate` component wraps pro pages/sections. `usePlan` hook fetches tier from `GET /api/plan`.
- **Owner bypass**: Set `OWNER_EMAILS` env var (comma-separated) to grant those emails permanent pro access
- **Grant endpoint**: `POST /api/plan/grant` — owner-only route to grant pro to any email
- **Webhook endpoint**: `POST /api/plan/activate` — protected by `WEBHOOK_SECRET` env var for Stripe/payment callbacks
- **DB table**: `user_tiers` — stores tier assignments; auto-created by `ensureTables()` in `plan.ts`
- **Key files**: `artifacts/api-server/src/lib/plan.ts`, `artifacts/api-server/src/routes/plan.ts`, `artifacts/interview-helper/src/hooks/use-plan.ts`, `artifacts/interview-helper/src/components/ProGate.tsx`, `artifacts/interview-helper/src/pages/Upgrade.tsx`

## Integrations
- **Email**: Resend connected via Replit integration connector (`connector:ccfg_resend_01K69QKYK789WN202XSE3QS17V`, connection `conn_resend_01KKJY7ZSMG96FN06W6BZEYYZV`). Uses `getUncachableResendClient()` from `artifacts/api-server/src/lib/resend.ts`. Do NOT use RESEND_API_KEY env var — use the connector.
- **AI**: OpenAI via Replit integration (`@workspace/integrations-openai-ai-server`)
- **Auth**: Replit Auth (OIDC) — session stored in PostgreSQL `sessions` table

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

- `src/schema/billboards.ts` — billboard advertising marketplace table (id, locationId, ownerPlayerName, adText, adImageUrl, priceFlorin, rentedUntil, createdAt)
- Billboard API routes in `artifacts/api-server/src/routes/billboards.ts` (GET list, GET by id, POST purchase, POST update-content, POST release)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
