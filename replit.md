# Workspace — SALARYMAN by Picasso.ai — THE PICASSO PLATFORM

## Overview

SALARYMAN is the universal hub for THE PICASSO PLATFORM, an AI-powered executive productivity platform. It integrates AI agents, communication tools, creative suites, and CRM functionalities to deliver AI-augmented workflows for professionals. Key offerings include the "Bot Factory" with 77 specialized bots managed by "Jean Claw," a free-tier AI assistant "Pablo AI," and tools for interview preparation, content creation, and video intelligence. The platform aims to unify various business operations into a single, efficient operating environment, offering advanced AI capabilities for enhanced productivity and creative output.

## User Preferences

I prefer concise and direct communication. When suggesting code changes, prioritize modern TypeScript features and functional programming paradigms where appropriate. For development workflow, I favor an iterative approach with clear, small, and testable changes. Please ask for confirmation before implementing significant architectural changes or altering core game mechanics. Do not make changes to the `artifacts/api-server/src/lib/resend.ts` file regarding Resend API key handling.

## System Architecture

The project is a pnpm workspace monorepo built with TypeScript, emphasizing modularity and distinct UI/UX designs.

### UI/UX Decisions
- **Non-game pages:** Feature a modern, dark SaaS aesthetic inspired by Linear/Vercel, using a dark zinc base, emerald green accents, Inter font for body, and Share Tech Mono for headings.
- **Game pages:** Employ a CRT/Pip-Boy aesthetic with phosphor green on black, scan lines, VT323 and Share Tech Mono fonts, and square borders.

### Technical Implementations
- **Core Technologies:** Node.js 24, pnpm, TypeScript 5.9, Express 5, PostgreSQL with Drizzle ORM, Zod for validation, Orval for API codegen, and esbuild for bundling.
- **Monorepo Structure:** Organized into deployable applications (`artifacts`), shared libraries (`lib`), and scripts.
- **Database & API:** PostgreSQL managed by Drizzle ORM. The Express 5 API server uses Zod for validation, with an OpenAPI 3.1 specification for codegen of React Query hooks and Zod schemas.
- **Game World:** A large, persistent world featuring a 13-month calendar, 4-season weather system, day/night cycle, and interactive building interiors with NPCs. Police use a tiered confrontation system — low wanted levels trigger dialogue prompts (pay fine / resist / walk away), while high wanted levels (3+) trigger physical force. ESC key toggles game pause.
- **Authentication:** All feature pages require authentication via Replit Auth (OIDC).
- **Communication:** WebRTC for video and proximity voice chat, a terminal phone system, private messaging, and an in-game CRM. Features a persistent, real-time app-wide chat (COMMS) with Global, Company, and Private DM channels via WebSockets.
- **AI Voice Architecture:** Utilizes ElevenLabs TTS (with OpenAI TTS-1 fallback) for web/game chat and Google Neural2-F for phone calls, ensuring natural conversational tones through system prompts. A `useVoiceConversation` hook enables continuous voice interaction with Pablo AI.
- **Pablo 3D Mascot:** Landing page features a 3D animated Maltese dog (Pablo, Chief Executive Dog) built with React Three Fiber + Drei. Cycles through funny quotes with speech bubbles. Falls back to animated 2D SVG when WebGL is unavailable. Component: `src/components/PabloMascot.tsx`.
- **Subscription Model:** A feature-based subscription system implemented with Stripe, gating cost-incurring APIs behind `requireFeature('claw_bot')`.
- **Org Role Hierarchy:** A 6-tier role system (Owner, CEO, Executive, Director, Manager, Specialist) controls access and permissions, with separate platform admin roles.
- **Content Rating:** Bot marketplace content is rated (sfw/mature/adult), with adult content restricted and build-your-own-bot only, controlled by an org `adultContentEnabled` toggle.
- **Bot Factory:** An OpenClaw-powered system for creating and managing custom AI bots with persistent memory, configurable personality, access control, and collaborative modes.
- **Creative Suite:** Unified "Dark Room" for graphics (AI image gen, canvas editor), copy, social media templates, and various production modes.
- **Video Intelligence:** VID-SCAN for extracting transcripts and metadata from video URLs, generating structured intelligence reports.
- **Job Command Center (JCC):** AI-powered job search automation with pipeline scoring, application tracking, resume tailoring, and interview prep.
- **Claude Code Templates (CCT):** A browser for a template library of AI agents, skills, commands, and other components.
- **Music Production:** "Tempo Prime" uses Replicate MusicGen for AI music generation, with full songwriting, mixing, mastering, and distribution pipeline capabilities.

## External Dependencies

- **Email:** Resend
- **AI Models:** Anthropic Claude Sonnet, OpenAI GPT-4o
- **AI Gateway:** OpenClaw
- **Authentication:** Replit Auth (OIDC)
- **Telephony:** Twilio SDK
- **Object Storage:** Google Cloud Storage (GCS-backed via Replit App Storage)
- **Database:** PostgreSQL
- **Payment Processing:** Stripe
- **Music Generation:** Replicate MusicGen API (used by Tempo Prime)

## Business Management Hub

The `/business` route renders a BusinessHub landing page that provides an overview of all business management tools. It displays:
- Organization details (name, industry, member count, user role)
- Financial summary stats (net profit, gross income, invoices, bills, employees, payroll, expenses, outgoings)
- Action required alerts for overdue bills and invoices
- Categorized navigation cards linking to all business sub-modules (Contacts, Hiring, Interview Office, Calendar, Documents, Deals, Invoices, Payroll, Bills, Expenses, Balance Sheet, Insurance API)
- Backend summary endpoint at `/api/enterprise/summary` aggregates counts and financials across all enterprise tables

## Finance & Dual Currency System

The platform tracks two distinct currencies:
- **FIAT (ƒ)**: In-game currency earned through gameplay, faction salaries, business profits, ATM interactions in the Salaryman MMO
- **AVAILABLE ($)**: Real USD linked to bank accounts, Stripe revenue, Gusto payroll — withdrawable to real bank accounts
- Negative balances = **DEBT** — always displayed, never hidden

The Balance Sheet page (`/business/balance-sheet`) shows both currencies side by side with integration panels for:
- **Gusto Payroll** — W-2, 1099, employee pay data (requires `GUSTO_API_KEY`)
- **Bank (Plaid)** — auto-import transactions (future integration)
- **Google Sheets** — sync accounting data to live spreadsheets

The ATM in-game (Banco Ombra) displays FIAT checking/savings in amber and AVAILABLE (real USD) in green, with clickable links to the Gusto Payroll page.

## Gusto Payroll Page

Dedicated Gusto Payroll page at `/business/gusto` (component: `GustoPayroll.tsx`) with live data from Gusto API:
- **Overview tab**: Company info, active employee count, locations, last payroll details, quick nav cards
- **Employees tab**: Full roster with names, titles, departments, emails, pay rates, status badges
- **Payroll Runs tab**: Processed payrolls with gross/net/taxes/deductions breakdown, expandable detail cards, aggregate summary stats
- Accessible from: BusinessHub FINANCIALS section, in-game ATM (Banco Ombra), and Overview tab's Manual Payroll link back to `/business/payroll`
- API endpoints: `/api/enterprise/gusto/company`, `/api/enterprise/gusto/employees`, `/api/enterprise/gusto/payrolls`

## Bot Factory (Jean Claw)

All 77 marketplace bots live under "JEAN CLAW — 77 BOTS" tab (no separate marketplace tab). The "MY BOTS" tab shows user's active/custom bots. Key finance bot is **Viktor Vault** (AI CFO) with Google Sheets, bank, Gusto, and Stripe integration capabilities.