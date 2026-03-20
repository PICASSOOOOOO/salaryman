# Workspace — Salaryman by Picassoo.ai (PABLO device)

## Overview

pnpm workspace monorepo using TypeScript. **Salaryman** is the master brand — an AI-powered executive productivity suite and the foundation of a post-apocalyptic MMO world. **PABLO** is the in-world mega-corporation whose products power the suite. The app is the "PABLO device" players carry. Branding dual-mode: "SALARYMAN / PABLO CORP. DEVICE v1.0" (real) and "DevDocs" (discreet cover). Part of the Picassoo.ai product suite.

### Brand Architecture
- **Salaryman** — master brand, the world, the game (future MMO: Cyberpunk × Fallout × FF7 × Blade Runner, 1980s Japan post-apocalyptic)
- **Minx City World** — 2.5D isometric canvas RPG with billboard advertising marketplace (8 ad slots), proximity-based interaction ([E] key), in-game Florin/CREAM currency purchases, admin panel at `/admin/billboards`. World is 14400×12600 with city as a compact 4-quadrant layout centered on ONE main intersection (crossroads at x=6800, y=6300). City bounds: CITY_LEFT=6200, CITY_RIGHT=7400, CITY_TOP=5800, CITY_BOTTOM=6800 (~1200×1000 walkable area). NW quadrant: civic/finance (Shadow Tower, bank, clinic, police, Pablo Store). NE quadrant: commercial/entertainment (dojo, nightclub, hotel, arcade, food court, shops). SW quadrant: residential/shelters (Minx Arms, Eastside, Pinnacle, bunkers, exchange). SE quadrant: admin/tech/industry (admin bureau, Picassoo HQ, scrap yard). Only Shadow Tower exceeds 10 stories (62 floors); all other buildings are 2-3 stories. Suburbs/outskirts just outside city walls (metro stations, gates). Wasteland features: procedural trees, rocks, grass patches. Sewer system with manhole covers at street intersections. Day/night cycle (worldTime 0-24), behavior state machine for threats, faction schedules, conditional hostility based on player class and territory, minimap radius 180px with 900 world unit view. Territory renamed "MINX CITY LIMITS". Zone label shows sector names inside city and nearest settlement in wasteland. Fog of war: reduced minimap opacity (0.35), doubled visit radius (160), reduced night overlay (0.28). Dev grid lines and territory border outlines removed. Gang zone borders render as transparent fill only. NPC silhouettes visible through building exteriors when player within ~200px. Scrapyard gated behind `storyFlags.scrapyard_unlocked`.
- **Game Systems Module** (`gameSystems.ts`) — Centralized module for: 13-month calendar (1 real hour = 1 game day), 4-season weather system (CLEAR/RAIN/SNOW/STORM/ACID_RAIN/HEATWAVE/FOG/DUST/OVERCAST), rare disasters (FIRE/EARTHQUAKE), radiation zones in wasteland (5 zones with varying intensity), Gold Exchange economy (FIAT_PER_GOLD=100000, year-scaling tax), treasure chests/maps (8 chests, 3 maps), Boomer Mode terminology map, branching dialogue system (DialogueTree/DialogueNode/DialogueChoice), rumor system (20+ floating NPC rumors), character costumes (8 options), timezone cities, subscription pricing ($4-6/mo), lore weapon names, weather particle rendering.
- **Economy** — Dual currency: FIAT (standard) + GOLD (measured in ounces, via Gold Exchange at x:6100 y:6800, 1oz = ƒ100,000). Tax scales with calendar year. Real estate requires GOLD only (cheapest: 2oz wasteland lot). Starting net worth lowered: Corporate ƒ25,000, Replicant ƒ10,000, Outlaw ƒ5,000. Consistent salary every ~60s: Corporate +ƒ500/min, Replicant +ƒ300/min, Outlaw +ƒ200/min (+bonus in wasteland). City Admin Bureau (8220,6120) for business registration: fictitious entity ƒ50,000, real enterprise ƒ100,000. Game-world industry categories for fictitious businesses (thievery, salvaging, bounty hunting, assassin, drug dealing, smuggling, hacking, forgery, etc.). Click/touch-to-move: clicking empty ground moves character; clicking enemy attacks with ranged weapon or walks to melee range. **Gold Exchange expanded** to "Minx City Exchange" with 3 tabs: GOLD (original buy/sell), JEWELS & METALS (diamond/ruby/emerald/platinum/sapphire with fluctuating prices), and STOCK MARKET (buy/sell shares in registered businesses). **Stock Market**: 5 pre-listed stocks (PCSO/Picassoo.ai, PABLO, NEON, IRNT, DOJO) + dynamically-listed player businesses (real type only). Stock prices fluctuate via deterministic sine waves. Dividends paid every 60 game ticks (0.3% of share price per share). **Asset system**: `g.assets` tracks commodity holdings, `g.stocks` tracks share counts. Both saved in buildSaveData().
- **Housing System** — 7-tier housing based on player status. FREE tiers: CITY SHELTER/BUNKER, DESERT OUTPOST, MACHINE BUNKER (underground). PAID tiers: MINX ARMS HOTEL (ƒ80/night, fictitious biz req), EASTSIDE FLATS (ƒ500/week, fictitious biz), THE PINNACLE (ƒ200/night, real biz), HOTEL NEON SUITE (ƒ350/night, real biz). Hotels charge per night, apartments per week. MINX ARMS is a HOTEL, not a free apartment — players cannot spawn there without paying rent. Everyone starts at shelters/bunkers/outposts. Player's `housingTier` determines spawn building via `getHamletSpawn()`. Rent cycle is per-tier: hotels charge per night (1 real-life day cycle), apartments per week (7 real-life day cycle). Grace period is 1 day. Daily rent reminders when due. Auto-deduction from salary at grace expiry; eviction to shelter if insufficient funds. Housing Management panel accessible from Real Estate Office (realestate_office building). Moving requires deposit (2x rent). `g.housingTier`, `g.rentPaidAt`, `g.rentReminded` saved in buildSaveData(). Shelters, bunkers, and outposts are heavily populated (8-10 named NPCs each) — these are crowded refugee/worker camps.
- **Picassoo.ai HQ** — Dedicated building at (8500, 6620) with unique interior: reception, AI demo station, engineering bay, GPU cluster, model dashboard, gallery display, creator lounge, roadmap board. Workers: ARIA CHEN (Lead Engineer), DEV-K (AI Researcher), RECEPTIONIST. Pre-registered as a real enterprise on the stock market (ticker: PCSO, base price ƒ4,500).
- **Building Interiors** — Every building in the game has a walkable interior. Interior system uses `InteriorDef` objects with floor layout, wall boundaries, furniture objects, exit trigger zones, and optional `workers` (InteriorWorker[]) array. `BUILDING_INTERIOR_MAP` maps all 60+ building IDs to interior definitions. Unique interiors: minx_arms, clinic, hotel, megabank, nightclub, dojo, armory, machine_bunker, admin_bureau, police_hq, realestate_office, nexus_hub, public_office, gold_exchange, eastside_flat, overlook, scrap, radio, depot_south, north_gate, picassoo_hq. Generic templates: _shop, _office, _lobby, _subway, _checkpoint, _outpost, _wasteland_shelter, _npc_apartment, _office_floor. All interiors have named NPC workers (hostile workers deal 5 HP damage when player is within 15px, warn at 25px). **Elevators**: ELEVATOR_BUILDINGS set defines 11 buildings with elevator objects; floors 2-5 available per building. Vacant floors freely enterable; players can CLAIM floors by setting a password (6+ chars, 1 number, 1 symbol). Only rented/claimed floors show 🔒 RENTED and require password entry. FLOOR_PASSWORDS in-memory Map tracks per-building per-floor passwords. **Home Lock**: Player's home (minx_arms) has a DOOR LOCK object near the exit — interact with [E] to set/change/remove a unit password via HOME_PASSWORDS Map. Other locked homes require password entry to access. Entry uses fade-to-black transition via `interiorFade`/`interiorFadeDir` state. Player moves inside with WASD/arrows, collision against walls and furniture objects (except windows/plants). Threats cannot aggro while player is indoors. Indoor-start cinematic spawns player inside Minx Arms apartment. Hospital wake-up spawns inside City Clinic interior. Interior NPCs (Suits faction) added to gold_exchange, admin_bureau, police_hq, megabank, nexus_hub, realestate_office — each with cycling dialogue. `storyFlags` field added to game state for quest gating (persisted in saves).
- **NPC System** — All NPCs use original names (no derivative/copyrighted names). Each NPC has `NpcDef` interface with: name, x, y, type, gender, job, home (building ID), workplace (building ID), whisper, backstory, optional role (police/guard/corpo_military/corpo_worker/dealer_papers/dealer_weapons/homeless/pedestrian/newspaper_seller), voiceActor (boolean), walkSpeed (number), personality (string), voiceLines (string[]). NPCs follow a daily schedule: home (20:00-6:00), commute to work (6:00-8:00), at work (8:00-18:00), commute home (18:00-20:00). Schedule positions computed by `getNpcSchedulePos()` using `worldTime`. Key NPCs: CLARA BRENNAN (grand_meridian bartender), MILES ORREN (ashfield_hostel utility mgr), ALDRIC PENN (overlook porter), DREN MALIK (rust_porch cook), PETRA VANCE (bastion_keep guard), LIRA WYNNE (ashfield_hostel medic), SENNA KADE (document forger dealer), ROOK TALVERA (city arms dealer), MARSH KETTER (wasteland arms dealer), FINN CORVANE (document forger), PRESS-UNIT 04 / INK-7 / HERALD-9 (android newspaper sellers). RAT threat type: HP=4, EXP=1, BOUNTY=0, passive, color=#665544, 12 spawns in city alleys. Print Shop has library feature (6 books) when press is on cooldown. Faction roles: corpo_worker (civilian Pablo Corp employees, no combat), corpo_military (armed tower guards, protect corp assets only), police (slow patrol, corrupt_bureaucratic personality). All 30+ named story NPCs have voiceActor:true with 3 curated voiceLines each, played via Web Speech API TTS on interaction.
- **THE MINX Newspaper System** — Underground newspaper "THE MINX" with 4 seasonal issues (Winter/Spring/Summer/Autumn). Each issue has headline, subhead, 3-5 articles, classifieds/ads, weather report, and editorial. Seasonal issue shown based on worldTime. Found at water coolers in building interiors (E key, pauses game), 8 scattered newspaper spots in the city overworld, and 3 android newspaper seller NPCs. Players can keep a copy for 100 FIAT (added to inventory). Newspaper spots render as small paper items on canvas with proximity [E] prompt.
- **Inventory System** — 6×4 grid (24 slots max) accessible via [I] key. Items have id, name, desc, icon, stackable flag, qty, and value. Stored in game state and saved. Sell-back mode activated when inside pawn_shop or market — items show SELL price badge and clicking sells for FIAT. Newspaper copies are the first inventory item type. `InventoryItem` interface defined in WorldPlay.tsx.
- **Video Chat System** — WebRTC peer-to-peer video/audio calls at terminals. Press [C] near any terminal, inside a building with a terminal, or with a PABLO device to start a call. Google Meet-style grid layout in top-right corner shows local + remote video tiles. Mic/camera toggle buttons. Server-side signaling in worldServer.ts with room-based peer management (`videoRooms` Map). Room membership enforced for signal relay. Cleanup on disconnect/unmount. STUN servers: Google public STUN. Falls back to audio-only if camera denied.
- **Communication Systems** — Proximity voice chat (always-live when mic enabled via [V], no push-to-talk), volume attenuates by distance within 100px range using WebRTC + GainNode. Separate mic mute/unmute control (distinct from voice on/off). Terminal phone call system: CALL tab in Terminal Hub lists online players, sends invite, target sees incoming call notification overlay, accept/decline creates direct voice channel via RTC room (regardless of proximity). Server-side call state validation with `pendingCalls`/`activeCalls` maps, busy guards, 30s invite timeout, cleanup on disconnect. Private messaging: improved DM UI with dedicated PRIVATE MSG button, player picker, blue-themed visual distinction (border, prefix, color). In-game CRM: Terminal Hub CRM tab with contacts list (auto-added on interaction), custom tags, notes, categories per contact. Schema: `CrmContact` with source field ('in_game'|'external') for future external CRM sync. Data persisted to localStorage.
- **Audio Systems** (`soundEngine.ts`) — Spatial audio engine with distance-based volume attenuation (spatialVolume, MAX_SPATIAL_DIST=800px). Proximity system (isWithinEarshot, EARSHOT_RADIUS=600px). Environmental SFX: sfxSpatialStep (surface types: concrete/metal/dirt/wood), sfxDoor, sfxVehicle, sfxMachinery, sfxWeaponDraw, sfxItemPickup, sfxUIClick, sfxWeatherRain, sfxWeatherWind. Crowd murmur system: startCrowdMurmur/updateCrowdMurmurVolume/stopCrowdMurmur — volume scales with nearby NPC count. Voice dialog: speakDialog/cancelSpeech using Web Speech API TTS with gender-based voice selection. Proximity overheard conversations: ConversationEvent system with POLICE_STOP_DIALOGS and CORPO_MILITARY_STOP_DIALOGS — police/corpo military randomly stop citizens, players within earshot see dialog text in HUD.
- **Field Guide Factions** — WorldMenu.tsx GUIDE_SECTIONS includes 'factions' tab with entries for Pablo Corp Workers, Corpo Military, Police, and Wasteland Gangs (Iron Rats, Void Dogs, Static Monks, Eastern Bloc).
- **Terminal Hub** — The in-game menu is called "Terminal" (not "Menu"). The Terminal Hub is the main management interface containing Pablo AI (front and center, free-forever), player stats with net worth/USD conversion, missions, save/load, costume, and premium module listings. Accessible via top-right "☰ TERMINAL" button or [P] key. HUD is compact and positioned bottom-left showing only: HP hearts (Zelda-style), Gold, Fiat, zone, and weather indicator. Proximity notification bar at top of screen replaces the old news ticker. Chat is at bottom center.
- **Mobile Terminal** — Terminal Hub mobile web view at `/mobile` route. Pablo AI tab is default (front and center). Provides remote access to character stats, Pablo AI chat, and business overview without 3D rendering. Connects to same cloud save data via `/api/salaryman/saves`. Accessible via links in Terminal footer and Profile page. Mobile-optimized with `100dvh`, max-width 480px, touch-friendly controls.
- **PABLO** — in-world mega-corporation that manufactures all the tools (AI assistant, devices, software)
- **TTC (The Telephone Company)** — In-world lore: TTC is the independent comms monopoly of Minx City. NOT a Pablo Corp subsidiary. TTC owns all phone lines, signal relays, broadcast towers, payphones, kiosks, and long-range comm infrastructure in Minx City. The TTC building (id: `ttc`) is located in Block G on the map. Former TTC engineers who were expelled when TTC automated its relay grid became the Static Monks faction in the wasteland. In-game: the PHONE tab in Terminal Hub reads "TTC · THE TELEPHONE COMPANY"; the phone module codename is "TTC"; the PhoneLayout header reads "TTC PHONE SYSTEM".
- **Calll Home (product)** — PABLO's CRM power dialer product (branded as TTC in-game). Pulls contacts with phone numbers from the CRM database, supports multi-select batch calling (blast mode — fires multiple Twilio calls concurrently via `/twilio/batch-call`), individual dialing via manual dial pad or contact list, live call monitoring with per-call hangup or hang-up-all, and full call history log. Available on Home page (floating phone button, authenticated users) and World game screen (PHONE tab in Terminal Hub HUD). Backend: `artifacts/api-server/src/routes/twilio.ts`. Frontend: `artifacts/interview-helper/src/components/PhoneDialer.tsx`. DB: `lib/db/src/schema/call-history.ts`. Requires env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.
- **Picassoo.ai** — company umbrella (3 products: Salaryman, Calll Home)

### UI Theme
- **Non-game pages** (Cover, Features, NavBar, and all app pages): Modern dark SaaS aesthetic (Linear/Vercel inspired). Dark zinc base (#09090b background), emerald green accent (hsl 142 71% 45%), Inter font for body/UI copy, Share Tech Mono for brand headings and nav labels. Slight border-radius (4-12px), frosted/muted card backgrounds, CRT scanlines **disabled** on these pages.
- **Game pages** (WorldPlay, WorldMenu, MobileTerminal): CRT/Pip-Boy aesthetic retained — phosphor green (#00ff41) on black, scan lines (via `body.game-route::before/after`), VT323 + Share Tech Mono fonts, square borders. App.tsx adds `game-route` class to `<body>` when on game routes.
- CRT utility classes (`.crt-text`, `.crt-panel`, `.crt-btn`, etc.) preserved in index.css for game components.
- Multiple skins planned (same features, different look)

## Per-Feature Subscription Model

- **Free tier**: PABLO AI Chat, CRM, Workspace, Presentations, Calendar, Documents/Invoices, Hiring tools, CIPHER-X, Content Studio — all free forever
- **Paid features** (individual monthly subscriptions):
  - **Live Listen** (ECHO-7): $5/mo — real-time audio intercept
  - **Screen Scan** (OPTIC-9): $5/mo — auto-identifies code/content on screen
  - **Say This** (VOX-4): $5/mo — real-time speech coaching
  - **Calll Home** (phone system): $95/mo — unlimited predictive dialing, SMS campaigns, AI call coaching, voicemail, conference calling
- **Architecture**: Per-feature subscriptions stored in `user_features` DB table (userId + featureKey composite PK). Each feature has its own Stripe price ID env var: `STRIPE_PRICE_LIVE_LISTEN`, `STRIPE_PRICE_SCREEN_SCAN`, `STRIPE_PRICE_SAY_THIS`, `STRIPE_PRICE_PHONE_SYSTEM`
- **Gating**: `ProGate` component accepts optional `featureKey` prop for feature-specific gating. `usePlan` hook returns `features: Set<FeatureKey>` with active feature keys. Backend uses `requireFeature(featureKey)` middleware.
- **Owner bypass**: Set `OWNER_EMAILS` env var (comma-separated) to grant those emails all features automatically
- **Grant endpoint**: `POST /api/plan/grant` — owner-only route to grant a specific feature to any user
- **Stripe payment**: Per-feature Stripe Checkout. `POST /api/stripe/create-checkout-session` accepts `{ feature: "live_listen" | "screen_scan" | "say_this" | "phone_system" }`. Webhook maps subscription to feature via metadata. `customer.subscription.deleted` revokes the specific feature by subscription ID.
- **DB tables**: `user_features` (per-feature subscriptions), `user_tiers` (legacy, kept for backward compat)
- **Email Subscribers**: `subscribers` DB table. `POST /api/subscribers` endpoint. Welcome email via Resend.
- **Key files**: `artifacts/api-server/src/lib/plan.ts`, `artifacts/api-server/src/routes/plan.ts`, `artifacts/api-server/src/routes/stripe.ts`, `lib/db/src/schema/user-features.ts`, `artifacts/interview-helper/src/hooks/use-plan.ts`, `artifacts/interview-helper/src/components/ProGate.tsx`, `artifacts/interview-helper/src/pages/Upgrade.tsx`

## Documents / ARCHIVE-X / INK-6 (Pro feature at `/documents`)

- **Invoice Generator**: Create invoices with client details, line items, tax rate, terms. Download as PDF using jsPDF with CRT/green aesthetic. Stored in `invoices` DB table.
- **Contract Generator**: 3 templates (NDA, Freelance Agreement, Service Contract). Fill in parties, scope, terms, compensation, jurisdiction. Download as PDF. Stored in `contracts` DB table.
- **File Manager**: Upload files (any type) to Replit object storage (GCS-backed). Browse/organize in folders. Download files. Generate shareable links (public token-based). Stored in `files_folders` DB table.
- **Object Storage**: GCS-backed via Replit App Storage. Presigned URL upload flow. See env vars: `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR`.
- **Key files**: `artifacts/interview-helper/src/pages/Documents.tsx`, `artifacts/api-server/src/routes/documents.ts`, `artifacts/api-server/src/routes/storage.ts`, `artifacts/api-server/src/lib/objectStorage.ts`, `lib/db/src/schema/documents.ts`, `lib/object-storage-web/`

## Integrations
- **Email**: Resend connected via Replit integration connector (`connector:ccfg_resend_01K69QKYK789WN202XSE3QS17V`, connection `conn_resend_01KKJY7ZSMG96FN06W6BZEYYZV`). Uses `getUncachableResendClient()` from `artifacts/api-server/src/lib/resend.ts`. Do NOT use RESEND_API_KEY env var — use the connector.
- **AI**: Multi-AI orchestration — Claude Sonnet (Anthropic via Replit integration `@workspace/integrations-anthropic-ai`), GPT-4o (OpenAI via `@workspace/integrations-openai-ai-server`), OpenClaw gateway (open-source AI gateway at `ws://127.0.0.1:18789`, npm package `openclaw`, config at `~/.openclaw/openclaw.json`). Router: `artifacts/api-server/src/lib/ai-router.ts`. Agent codenames: CORTEX-1 (Claude), SWIFT-3 (GPT), CLAW-7 (OpenClaw). Triple fallback chain: OpenClaw → Claude → GPT. Health check includes all three providers.
- **Auth**: Replit Auth (OIDC) — session stored in PostgreSQL `sessions` table
- **Twilio**: PSTN phone calls via Twilio SDK. Credentials stored as secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (user account: alexduong@yourmedicareclub.com). NOT using the Replit Twilio connector — using direct secrets. Routes: `artifacts/api-server/src/routes/twilio.ts`. Schema: `call_history` table in `lib/db/src/schema/call-history.ts`. Frontend: `PhoneDialer` component on Home page (floating button), `WorldPhoneDialer` inline component in WorldPlay phone tab.

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
