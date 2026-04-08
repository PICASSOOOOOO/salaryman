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
- **Video Intelligence:** Video Analyzer (VID-SCAN) at `/intel/video` — paste any video URL (YouTube, TikTok, Vimeo, Instagram, X, any website) and AI extracts transcript + metadata, analyzes content, and returns structured intelligence reports with actionable strategies.
- **Communication:** A robust phone system with autonomous call agents and dual-DID routing, alongside real-time translation tools.
- **Business Management:** CRM with deals pipeline, lead management, contact database, and full document management.

### Minx City World
A pixel office simulation with a virtual employee system, territory control, and a persistent world state.

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
- **Subscription Model:** Feature-based subscription system using Stripe, gated by `ProGate` component and backend middleware.
- **Bot Factory:** OpenClaw-powered system for creating custom AI bots and managing pre-built bots, with integration to multiple communication platforms. Features persistent memory, configurable personality, access control, and scheduled tasks. Billing is handled via Stripe.
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