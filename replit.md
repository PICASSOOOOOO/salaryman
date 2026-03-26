# Workspace — Salaryman by Picassoo.ai (PABLO device)

## Overview

Salaryman is an AI-powered executive productivity suite and the foundational project for a post-apocalyptic MMO world, known as "Minx City World". The application, branded as the "PABLO device", serves as the in-game interface for players. It combines elements of cyberpunk, Fallout, Final Fantasy VII, and Blade Runner, set in a 1980s Japan post-apocalyptic theme. The project is part of the broader Picassoo.ai product suite.

Key capabilities include:
- A 2.5D isometric canvas RPG world with an in-game billboard advertising marketplace and a dual currency economy (FIAT and GOLD).
- A dynamic housing system with multiple tiers and rent mechanics.
- Comprehensive building interiors, including interactive elements like elevators and lockable player homes.
- A sophisticated NPC system with daily schedules, unique personalities, and voice-acted dialogue.
- An in-game newspaper system ("THE MINX") providing lore and news.
- Robust communication features including WebRTC video chat, proximity voice chat, terminal-based phone calls, and private messaging.
- A spatial audio engine for immersive soundscapes.
- A subscription model for premium features like Live Listen, Screen Scan, Say This, and Calll Home.
- Media Analyzer (SPECTRA-X) integrated into the Console — upload images, audio, or video for AI analysis via Pablo. Images use GPT-4o vision, audio is transcribed and summarized, video gets frame extraction + audio transcription + combined analysis.
- Integrated productivity tools such as invoice and contract generators, and a file manager.

## User Preferences

I prefer concise and direct communication. When suggesting code changes, prioritize modern TypeScript features and functional programming paradigms where appropriate. For development workflow, I favor an iterative approach with clear, small, and testable changes. Please ask for confirmation before implementing significant architectural changes or altering core game mechanics. Do not make changes to the `artifacts/api-server/src/lib/resend.ts` file regarding Resend API key handling.

## System Architecture

The project is structured as a pnpm workspace monorepo utilizing TypeScript.

### UI/UX Decisions
- **Non-game pages:** Feature a modern, dark SaaS aesthetic inspired by Linear/Vercel, using a dark zinc base, emerald green accents, Inter font for body, and Share Tech Mono for headings. Border-radius is subtle (4-12px), with frosted card backgrounds and disabled CRT scanlines.
- **Game pages (WorldPlay, WorldMenu, MobileTerminal):** Maintain a CRT/Pip-Boy aesthetic with phosphor green on black, scan lines, VT323 and Share Tech Mono fonts, and square borders. A `game-route` class is added to the `<body>` for game-specific styling.

### Technical Implementations
- **Core Technologies:** Node.js 24, pnpm, TypeScript 5.9, Express 5, PostgreSQL with Drizzle ORM, Zod for validation, Orval for API codegen, and esbuild for bundling.
- **Monorepo Structure:** Divided into `artifacts` (deployable apps like `api-server`), `lib` (shared libraries like `db`, `api-spec`, `api-client-react`, `api-zod`), and `scripts`.
- **Database:** Drizzle ORM manages PostgreSQL schema, with `drizzle-zod` for insert schemas. Migrations are handled by Replit for production and Drizzle Kit for development.
- **API:** An Express 5 API server (`@workspace/api-server`) handles routes, utilizing `@workspace/api-zod` for validation and `@workspace/db` for persistence.
- **API Spec:** OpenAPI 3.1 (`openapi.yaml`) drives codegen for React Query hooks (`api-client-react`) and Zod schemas (`api-zod`).
- **Game World:** A 14400x12600 world with a central city (1200x1000 walkable area) divided into four quadrants. Features include a 13-month calendar, 4-season weather system, rare disasters, radiation zones, and a day/night cycle. First mission: "FIND A TERMINAL" — player must locate any public terminal in the city; Pablo AI handles intro intake with profile calibration and forces player to save at the end.
- **Auth Gating:** All feature pages (Console, Dashboard, Profile, Documents, BillboardAdmin, MobileTerminal, Reporting, Hiring, Invoices, Campaigns, ContactCollector, Calendar, Deals, ContentStudio, BrandKit, AgentTeam, Goals, SeoModule) show a consistent SignInPage (ACCESS DENIED / AUTHENTICATION REQUIRED) when not authenticated. Game requires sign-in to start (WAKE UP button triggers login). SignInPage component at `src/components/SignInPrompt.tsx`.
- **Economy:** Dual currency (FIAT and GOLD), with a Gold Exchange for precious metals and a stock market for businesses.
- **Housing:** Seven-tier system with free shelters and paid apartments/hotels. Rent cycles vary per tier, with auto-deduction and eviction mechanics.
- **Building Interiors:** All buildings have walkable interiors defined by `InteriorDef` objects, complete with floor layouts, furniture, exit triggers, and NPCs. Elevators are implemented in specific buildings, allowing players to claim floors with passwords.
- **NPC System:** NPCs have defined names, locations, types, genders, jobs, homes, workplaces, backstories, and roles. They follow daily schedules and can engage in voice-acted dialogue.
- **Communication:** WebRTC for peer-to-peer video calls and proximity voice chat. A terminal phone system enables direct voice calls between players regardless of proximity. Private messaging and an in-game CRM are also included.
- **Audio:** A spatial audio engine provides distance-based volume attenuation for environmental SFX and crowd murmurs. Web Speech API TTS is used for NPC dialogue.
- **Voice Conversation Mode:** A shared `useVoiceConversation` hook (`src/hooks/use-voice-conversation.ts`) provides continuous hands-free voice conversation with Pablo AI across all pages. Uses Web Speech API for STT and browser speechSynthesis for TTS. Conversation states: idle → listening → processing → speaking → listening (loop). Integrated on Home page (alongside VOX HOLD), WorldPlay in-game terminal chat tab, and Console page (alongside Live Listen). Stop phrases: "goodbye pablo", "bye pablo", etc. Ready chime plays when mic reactivates.
- **Subscription Model:** A per-feature subscription system is implemented using Stripe, storing feature grants in a `user_features` DB table. Features are gated by a `ProGate` component and backend middleware.
- **Documents:** Invoice and contract generators create PDF documents. A file manager allows upload/download/sharing of files to GCS-backed object storage.

## External Dependencies

- **Email:** Resend (via Replit integration connector `connector:ccfg_resend_01K69QKYK789WN202XSE3QS17V`).
- **AI:**
    - Anthropic Claude Sonnet (via Replit integration `@workspace/integrations-anthropic-ai`)
    - OpenAI GPT-4o (via `@workspace/integrations-openai-ai-server`)
    - OpenClaw gateway (`ws://127.0.0.1:18789`, `openclaw` npm package)
- **Authentication:** Replit Auth (OIDC), storing sessions in PostgreSQL.
- **Telephony:** Twilio SDK (direct use of `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` secrets).
- **Object Storage:** Google Cloud Storage (GCS-backed via Replit App Storage).
- **Database:** PostgreSQL.
- **Payment Processing:** Stripe.
- **Owner Access:** The `OWNER_EMAILS` secret (set in Replit Secrets) lists comma-separated emails that bypass all premium feature gates. Currently configured for `alejandroduong@gmail.com` via the `isOwnerEmail()` function in `artifacts/api-server/src/lib/plan.ts`.