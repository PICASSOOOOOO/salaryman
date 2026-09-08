# SEO Strategy

## In scope
- Public marketing and acquisition pages: `/features`, `/pricing`, `/upgrade`, `/jean-claw`, `/pablo/promo`, `/landing`, `/alpha`, `/rebellion`
- Public investor / supporter pages: `/investors`, `/pledge`, `/pledge/agents`
- Public legal pages: `/legal/**`
- Public homepage / entry experience at `/` and `/pablo`

## Out of scope
- Authenticated dashboard and workspace routes under `/business/**`, `/creative/**`, `/marketing/**`, `/intel/**`, `/console/**`, `/profile/**`
- In-app phone, office, bot, world, meet, admin, and game routes unless they materially affect public crawlability

## Target audience
- Professionals and business operators looking for an AI-powered business operating system
- Buyers evaluating AI agents, AI phone systems, CRM, hiring, invoicing, payroll, and productivity tooling
- Early supporters / backers evaluating the SALARYMAN platform and Pixel Agents offering

## Primary keywords
- AI business operating system
- AI agents platform
- AI phone system
- AI CRM
- business automation platform
- AI productivity software
- Pixel Agents
- SALARYMAN by Picasso AI

## Dismissed categories
- None yet.

## Notes
- Public SEO depends on `artifacts/interview-helper`, a React + Vite SPA with client-side routing via Wouter.
- The build now includes `scripts/prerender-meta.mjs`, which generates route-specific static HTML and head tags for a subset of public routes defined in `src/lib/page-meta-data.json`.
- Routes that are not listed in `page-meta-data.json` still fall back to the shared homepage metadata and shared SPA shell on first response.
