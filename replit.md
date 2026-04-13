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
- Categorized navigation cards linking to all business sub-modules:
  - **People & Operations**: Team Directory, Contacts, Hiring, Interview Office, Task Board, Time Tracking, Announcements, Calendar, Documents
  - **Sales & Revenue**: Deals, Invoices, Estimates/Quotes, Leads
  - **Financials**: Payroll, Gusto Payroll, Bills, Expenses, Vendors, P&L, Balance Sheet
  - **Marketing & Growth**: Campaigns, SEO
  - **Analytics & AI**: Reports, Dashboard, Bot Factory, Insurance API
- Backend summary endpoint at `/api/enterprise/summary` aggregates counts and financials across all enterprise tables

## Business Operations Modules (New)

Seven new modules added to fill real business-owner gaps:

- **Time Tracking** (`/business/time-tracking`, `TimeTracking.tsx`): Clock in/out, timesheets, billable hours, hourly rate tracking. API: `/api/business/time-entries`
- **Task Board** (`/business/tasks`, `TaskBoard.tsx`): Kanban board + list view, priorities (low/medium/high/urgent), status columns (todo/in_progress/review/done), assignees, due dates. API: `/api/business/tasks`
- **Team Directory** (`/business/team`, `TeamDirectory.tsx`): Full org view with roles, departments, compensation, contact info. Uses existing staff/org data.
- **Announcements** (`/business/announcements`, `Announcements.tsx`): Company-wide posts with priority levels and pinning. API: `/api/business/announcements`
- **Estimates & Quotes** (`/business/estimates`, `Estimates.tsx`): Quote builder with line items, tax calculation, status workflow (draft → sent → accepted/declined). API: `/api/business/estimates`
- **Vendor Directory** (`/business/vendors`, `Vendors.tsx`): Vendor contacts, payment terms, categories, status tracking. API: `/api/business/vendors`
- **Profit & Loss** (`/business/profit-loss`, `ProfitLoss.tsx`): Income statement with revenue vs costs, net profit calculation, margin percentage. Uses existing financial data.

DB schema: `lib/db/src/schema/business-ops.ts` (tables: time_entries, business_tasks, announcements, estimates, vendors)
API routes: `artifacts/api-server/src/routes/business-ops.ts` (registered under `/api/business/`)

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

### Jean Claw Knowledge Base
Jean Claw's system prompt (`seed-bots-marketplace.ts`, slug `claw-bot`) contains a comprehensive knowledge base covering:
- **Complete platform module map** with exact paths for every page (Pablo, Phone, Bots, Console, Business, Creative, Marketing, Intel, World, Admin)
- **Full 77-bot roster** organized by category with slug references and one-line descriptions
- **Automated 5-step onboarding flow**: Discovery → Platform Setup → Bot Deployment → Channel Connection → Ongoing Optimization
- **Business module expertise**: Knows all OPS-CORE tools (Team, Tasks, Time Tracking, Announcements, Invoices, Estimates, Vendors, P&L, etc.)
- **Bot-to-business matching**: Maps industry types to recommended bot combinations
- **Dual currency awareness**: FIAT (ƒ) vs AVAILABLE ($), debt display rules
- **Pricing tiers**: Free (Pablo) vs Jean Claw ($145/mo)

Pablo (`chat.ts`) and Marco Atlas (`seed-bots-marketplace.ts`) also have updated knowledge of the full platform module structure and bot roster.

## Jean Claw Workforce — In-Game NPCs

Player-owned building interiors in Minx City now spawn Jean Claw + department workers as NPCs:
- **JEAN CLAW** appears as FOREMAN at the front desk with gold suit, gold accent glow, and larger name label
- **Department workers** spawn at workstations with serial designations (e.g., "LINDA G-468", "VIKTOR B-112")
- Serial format: `{LETTER}-{001-999}` deterministic from floor seed (A-001 through Z-999)
- Worker count scales by building size: tower (8), large (6), medium (4), small (3)
- Workers drawn from 16 departments: Finance, Sales, E-Commerce, Creative, Operations, Trades, Publishing, Music, Education, Medical, Legal, Real Estate, Insurance, Design, Logistics, Core
- Dark teal uniforms for workers, gold/brown suit for Jean Claw
- All workers have dialogue (press [E] to talk)
- Workers only appear in player-owned floors — they are paid personal staff, not public NPCs
- Code: `generateClawWorkers()`, `CLAW_DEPARTMENTS`, `clawSerial()` in WorldPlay.tsx

## Corporate Admin Panel (Picasso Internal)

Internal staff control center at `/profile/admin`, gated by `isOwner` / `requirePicassoAdmin`. Completely separate from Org Admin (`/business`).

### 9 Tabs
- **ANALYTICS**: Signup trends, top players, feature subscription counts
- **USERS**: Search/detail view with save data, balance adjustment (FIAT), feature grant/revoke, destructive resets (save data / features)
- **BUSINESSES**: Org listing with member counts
- **FEATURE TOGGLES**: Toggle switches for platform features (maintenance mode, new user registration, etc.)
- **SYSTEM CONFIG**: Key-value config store with categories and descriptions
- **BROADCAST**: Send/manage platform announcements with targeting (all/free/paid) and expiration; public endpoint filters to `all` audience only
- **REPORTS**: Feedback/bug report management with status workflow (open → investigating → resolved → dismissed)
- **BANS**: User ban management
- **AUDIT LOG**: All admin actions logged with actor, action type, target, and details

### DB Tables
- `system_config` — key/value with category, description, updatedBy
- `broadcast_messages` — title, message, type, targetAudience, active, expiresAt, createdBy
- `admin_audit_log` — adminId, action, targetType, targetId, details, createdAt

### API Routes (all under `/api/admin/`)
- Analytics: `GET /admin/analytics`
- Users: `GET /admin/users`, `GET /admin/users/:userId`, `POST /admin/users/:userId/adjust-balance`, `POST /admin/users/:userId/grant-feature`, `POST /admin/users/:userId/revoke-feature`, `POST /admin/users/:userId/reset`
- Config: `GET /admin/system-config`, `PUT /admin/system-config`, `DELETE /admin/system-config/:key`
- Broadcasts: `GET /admin/broadcasts`, `POST /admin/broadcasts`, `PATCH /admin/broadcasts/:id`, `GET /admin/broadcasts/active` (public, filtered)
- Reports: `GET /admin/reports`, `PATCH /admin/reports/:id`
- Audit: `GET /admin/audit-log`