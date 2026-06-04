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
- There is no source-visible SSR or prerender pipeline for public routes, so initial HTML quality matters disproportionately for social bots and AI crawlers.
