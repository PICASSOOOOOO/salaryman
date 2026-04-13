# SALARYMAN by Picasso.ai

## Overview

SALARYMAN is the central component of THE PICASSO PLATFORM, an AI-powered executive productivity platform. It integrates advanced AI agents, comprehensive communication tools, creative suites, and robust CRM functionalities. The platform offers specialized AI bots through its "Bot Factory," a free AI assistant named "Pablo AI," and tools for interview preparation, content creation, and video intelligence. The primary goal is to consolidate diverse business operations into a single, highly efficient environment, leveraging AI to boost productivity and creative output for professionals.

## User Preferences

I prefer concise and direct communication. When suggesting code changes, prioritize modern TypeScript features and functional programming paradigms where appropriate. For development workflow, I favor an iterative approach with clear, small, and testable changes. Please ask for confirmation before implementing significant architectural changes or altering core game mechanics. Do not make changes to the `artifacts/api-server/src/lib/resend.ts` file regarding Resend API key handling.

**Communication rules (apply to ALL interactions):**
1. Never agree by default. Stress-test what was said, find the weakest point before affirming anything.
2. No glazing. No compliments without substance. Don't call something great/brilliant/smart unless you can also say what's wrong with it.
3. Don't echo framing back. Restate in your own terms or skip it.
4. When you do agree, earn it. Show the reasoning.
5. Call out bad logic, weak assumptions, and blind spots immediately.
6. Never open with "that's a great point" or "you're absolutely right." Use more useful words.

## System Architecture

The project is a pnpm workspace monorepo built with TypeScript, emphasizing modularity and distinct UI/UX designs.

### UI/UX Decisions
- **Non-game pages:** Modern, dark SaaS aesthetic inspired by Linear/Vercel (dark zinc, emerald green accents, Inter font for body, Share Tech Mono for headings).
- **Game pages:** CRT/Pip-Boy aesthetic (phosphor green on black, scan lines, VT323 and Share Tech Mono fonts, square borders).

### Technical Implementations
- **Core Technologies:** Node.js 24, pnpm, TypeScript 5.9, Express 5, PostgreSQL with Drizzle ORM, Zod for validation, Orval for API codegen, esbuild for bundling.
- **Monorepo Structure:** Divided into deployable applications (`artifacts`), shared libraries (`lib`), and scripts.
- **Database & API:** PostgreSQL via Drizzle ORM; Express 5 API server uses Zod for validation, with OpenAPI 3.1 for codegen.
- **Game World:** Persistent world with 13-month calendar, 4-season weather, day/night cycle, interactive building interiors, and NPCs. Police interaction includes tiered confrontation.
- **Authentication:** Replit Auth (OIDC) for all feature pages.
- **Communication:** WebRTC for video and proximity voice chat, in-game terminal phone, private messaging, and CRM. Features a real-time app-wide chat (COMMS) using WebSockets with Global, Company, and Private DM channels.
- **AI Voice Architecture:** ElevenLabs TTS (with OpenAI TTS-1 fallback) for chat, Google Neural2-F for phone calls. `useVoiceConversation` hook for continuous AI voice interaction.
- **Pablo 3D Mascot:** Animated 3D Maltese dog on landing page with React Three Fiber + Drei, displays quotes and has 2D SVG fallback.
- **Subscription Model:** Feature-based Stripe integration to gate cost-incurring APIs.
- **Org Role Hierarchy:** 6-tier system (Owner to Specialist) for access control, plus separate platform admin roles.
- **Content Rating:** Bot marketplace content rated (sfw/mature/adult), with adult content restrictions.
- **Bot Factory (Jean Claw):** OpenClaw-powered system for creating and managing custom AI bots with persistent memory, configurable personality, and collaborative features.
- **Creative Suite (Dark Room):** Unified tools for AI image generation, canvas editing, copy creation, and social media templates.
- **Video Intelligence (VID-SCAN):** Extracts transcripts and metadata from video URLs to generate structured reports.
- **Job Command Center (JCC):** AI-powered job search automation with pipeline scoring, application tracking, resume tailoring, and interview prep.
- **Claude Code Templates (CCT):** A browser for a template library of AI agents, skills, and commands.
- **Music Production (Tempo Prime):** Uses Replicate MusicGen for AI music generation, covering songwriting, mixing, mastering, and distribution.
- **Business Management Hub:** `/business` route offering an overview of business tools, financial summaries, and categorized navigation to sub-modules like Time Tracking, Task Board, Team Directory, Announcements, Estimates & Quotes, Vendor Directory, and Profit & Loss.
- **Dual Currency System:** Tracks FIAT (ƒ) for in-game currency and AVAILABLE ($) for real USD, with negative balances displayed as DEBT. Integrates with Gusto Payroll and planned Plaid integration.
- **Zero Starting Income:** All characters start at ƒ0 with no government base salary. FIAT must be earned legitimately: 1) Register a real business with verified income via payroll provider (Gusto, ADP, Paychex, etc.), 2) Convert real USD to FIAT through the exchange, or 3) Run an in-game business with verified activity. Business registration supports "CUSTOM / OTHER" industry for any business type. Income verification fields stored in `world_businesses` table (payroll_provider, declared_monthly_income, income_verified).
- **Gusto Payroll Page:** Dedicated page (`/business/gusto`) displaying company info, employee roster, and payroll runs from Gusto API.
- **Jean Claw Knowledge Base:** Jean Claw's system prompt includes platform module map, full bot roster, onboarding flow, business module expertise, dual currency awareness, and pricing tiers.
- **Jean Claw Workforce (In-Game NPCs):** Player-owned building interiors spawn Jean Claw (foreman) and department workers (NPCs) with unique serial designations and dialogue.
- **Corporate Admin Panel:** Internal control panel at `/profile/admin` for Picasso staff, featuring tabs for Analytics, Users, Businesses, Feature Toggles, System Config, Broadcast, Reports, Bans, Audit Log, and Email Security.
- **Knowledge Vault (NEXUS-V):** Obsidian-style knowledge graph at `/console/vault` under CIPHER-X module. Users create typed entries (note, idea, reference, person, project, concept, resource, action) with tags, link them via connections, and visualize relationships on an interactive d3-force graph canvas. DB tables: `vault_entries`, `vault_connections`. API: `/api/vault/entries`, `/api/vault/connections`, `/api/vault/graph`.

## External Dependencies

- **Email:** Resend
- **AI Models:** Anthropic Claude Sonnet, OpenAI GPT-4o
- **AI Gateway:** OpenClaw
- **Authentication:** Replit Auth (OIDC)
- **Telephony:** Twilio SDK
- **Object Storage:** Google Cloud Storage (GCS-backed via Replit App Storage)
- **Database:** PostgreSQL
- **Payment Processing:** Stripe
- **Music Generation:** Replicate MusicGen API