# Workspace — SALARYMAN by Picasso.ai — THE PICASSO PLATFORM

## Overview

SALARYMAN is the universal hub for THE PICASSO PLATFORM, an AI-powered executive productivity platform. It unifies AI agents, communication tools, creative suites, and CRM functionalities into a single operating environment to provide AI-augmented workflows for professionals.

### Flagship Products
- **Jean Claw:** A premium AI agent service offering specialized AI agents and communication channels.
- **Pablo AI:** A free-tier AI assistant integrated across the platform.
- **Bot Factory:** A system for custom AI bot creation and a marketplace with multiple platform connectors.

### Core Capabilities
- **AI Agents:** Equipped with a structured skill system for planning, review, execution, security, design, and analysis.
- **Interview Preparation:** Tools for real-time coaching, including live listening and screen analysis.
- **Content Creation:** AI-generated presentations, long-form content creation (Writer's Studio), and a comprehensive creative suite.
- **Dark Room:** Unified creative studio at `/creative/darkroom` with 5 tabs: GRAPHICS (AI image gen + canvas editor), COPY (marketing copy, emails, ads), SOCIAL (social media templates), PRODUCTION (8 image modes: clothing brand, lookbook, billboard, 35mm film, hi-def cinema, packaging, labels/tags, poster), VIDEO (5 script modes: TV commercial, music video, brand film, social video, lookbook video). Gallery persists in localStorage. Old routes `/creative/studio` and `/creative/production` redirect to `/creative/darkroom`.
- **Video Intelligence:** Video Analyzer (VID-SCAN) at `/intel/video` — paste any video URL (YouTube, TikTok, Vimeo, Instagram, X, any website) and AI extracts transcript + metadata, analyzes content, and returns structured intelligence reports with actionable strategies.
- **Job Command Center (JCC):** Jean Claw premium feature at `/bots/jobs` — AI-powered job search automation inspired by career-ops. Features: Pipeline (A-F job scoring across 10 dimensions), Tracker (application status management), Resume AI (ATS-optimized resume tailoring), Interview Prep (STAR framework + company intel + salary negotiation). All endpoints gated behind `claw_bot` subscription.
- **Claude Code Templates (CCT):** Template library browser at `/bots/templates` — indexes 1,700+ components from davila7/claude-code-templates: 417 AI agents, 804 skills, 280 commands, 84 MCPs, 54 hooks, 67 settings, 14 templates, 11 sandbox configs, 10 plugins. Backend caches full catalog (1hr TTL), serves stripped index without content, loads component source on demand. Category filtering, search, copy install command, copy source content.
- **Communication:** A robust phone system (CalllHome/TTC) with autonomous call agents, dual-DID routing, real-time translation tools, and enhanced live call monitoring with expandable call details (SID, metadata, encryption, conference), live transcript panel, and AI coaching tips. Session launch renamed to "GO ACTIVE".
- **Business Management:** CRM with deals pipeline, lead management, contact database, and full document management.

### Minx City World
A pixel office simulation with a virtual employee system, territory control, and a persistent world state. Multi-city expansion planned: 24 cities worldwide (Minx City live; Neon Lagos, Sector Berlin, Old Shanghai, etc. planned). Cities schema in `lib/db/src/schema/server-regions.ts` (`citiesTable`, `PLANNED_CITIES`). World businesses (`world_businesses` table) now include a `userId` column for reliable user linkage. Enterprise save limits (1 slot) check org ownership, active org membership, AND real-world businesses tied to the user's account.

## User Preferences

I prefer concise and direct communication. When suggesting code changes, prioritize modern TypeScript features and functional programming paradigms where appropriate. For development workflow, I favor an iterative approach with clear, small, and testable changes. Please ask for confirmation before implementing significant architectural changes or altering core game mechanics. Do not make changes to the `artifacts/api-server/src/lib/resend.ts` file regarding Resend API key handling.

## System Architecture

The project is a pnpm workspace monorepo built with TypeScript, focusing on modularity and a distinct UI/UX for different sections.

### UI/UX Decisions
- **Non-game pages:** Modern, dark SaaS aesthetic inspired by Linear/Vercel, featuring a dark zinc base, emerald green accents, Inter font for body, and Share Tech Mono for headings.
- **Game pages:** CRT/Pip-Boy aesthetic with phosphor green on black, scan lines, VT323 and Share Tech Mono fonts, and square borders.

### Technical Implementations
- **Core Technologies:** Node.js 24, pnpm, TypeScript 5.9, Express 5, PostgreSQL with Drizzle ORM, Zod for validation, Orval for API codegen, and esbuild for bundling.
- **Monorepo Structure:** Divided into deployable applications (`artifacts`), shared libraries (`lib`), and scripts.
- **Database:** PostgreSQL managed by Drizzle ORM, with `drizzle-zod` for schema validation.
- **API:** Express 5 server utilizing Zod for validation and Drizzle ORM for persistence. OpenAPI 3.1 specification drives codegen for React Query hooks and Zod schemas.
- **Game World:** A large, persistent world with a 13-month calendar, 4-season weather system, day/night cycle, and interactive building interiors with NPCs.
- **Error Handling:** `ErrorBoundary` components provide graceful degradation and prevent crashes.
- **Authentication:** All feature pages require authentication, with a consistent sign-in prompt.
- **Economy:** Dual currency system (FIAT and GOLD) with an exchange and stock market.
- **Housing:** A multi-tier housing system with varying rent cycles and eviction mechanics.
- **NPC System:** NPCs have defined roles, schedules, and engage in voice-acted dialogue.
- **Communication:** WebRTC for video and proximity voice chat, a terminal phone system, private messaging, and an in-game CRM.
- **App-Wide Chat (COMMS):** Persistent, real-time chat with Global, Company, and Private DM channels, powered by WebSockets.
- **Audio:** Spatial audio engine for SFX and crowd murmurs, Web Speech API TTS for NPC dialogue.
- **Pablo Voice Architecture:** Unified human-like voice using ElevenLabs TTS (with OpenAI TTS-1 fallback) for web/game chat and Google Neural2-F for phone calls. System prompts ensure natural conversational tone.
- **Org-Specific Screening Scripts:** Dynamic application of company-specific scripts for Pablo's call agent based on the user's organization.
- **Voice Conversation Mode:** A `useVoiceConversation` hook enables continuous, hands-free voice interaction with Pablo AI across the platform, using Web Speech API for STT and OpenAI TTS-1 for TTS.
- **Subscription Model:** Feature-based subscription system using Stripe, gated by `ProGate` component and backend middleware. All cost-incurring APIs (DALL-E image gen, ElevenLabs/OpenAI TTS, transcription, Resend email, studio content generation) are gated behind `requireFeature('claw_bot')` to prevent free-tier cost exposure. Phone system (TTC) retains its own `phone_system` feature gate.
- **Bot Factory:** OpenClaw-powered system for creating custom AI bots and managing pre-built bots, with integration to multiple communication platforms. Features persistent memory, configurable personality, access control, scheduled tasks, and bot collaboration mode (team bots share context, delegate sub-tasks, spawn custom sub-bots like "Jean Claw (Custom)"). Billing is handled via Stripe.
- **Documents & Media:** Invoice and contract generators, a file manager for GCS-backed object storage, and a dedicated Media Library (VAULT-X) for managing audio/image/video files.
- **Sound Lab Looper:** A persistent, always-visible overlay for the Sound Lab (1999) that allows recording and managing audio loops across different instrument sections.

## External Dependencies

- **Email:** Resend (via Replit integration).
- **AI:** Anthropic Claude Sonnet, OpenAI GPT-4o, and OpenClaw gateway.
- **Authentication:** Replit Auth (OIDC).
- **Telephony:** Twilio SDK for autonomous call agents, multi-turn conversations, CRM integration, call recording, and dual-DID call center functionalities.
- **Enterprise Lead Database:** Role-based lead management system with CRUD operations, CSV import/export, and notes.
- **Object Storage:** Google Cloud Storage (GCS-backed via Replit App Storage).
- **Database:** PostgreSQL.
- **Payment Processing:** Stripe.