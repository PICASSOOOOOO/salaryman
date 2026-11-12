---
name: compound-engineering
description: Working principles distilled from agentic-coding tools (compound-engineering-plugin, claude-code, cursor/plugins, ECC). Use at the START of any non-trivial task on this repo to work like a senior engineer — make each task leave reusable leverage, plan before editing, and verify before claiming done.
---

# Compound Engineering

These are working habits, not app features. They came from coding-agent tooling the
owner pasted (everyinc/compound-engineering-plugin, anthropics/claude-code,
cursor/plugins, affaan-m/ECC, awesome-ai-coding-tools) — tools that run in OTHER
environments and can't be installed into this Replit agent runtime. What IS portable
is the methodology. Load this at the start of any non-trivial task.

## The core idea: make work compound

Every task should leave the codebase (and your future self) faster, not just "done."
Before you finish, ask: *what did I learn that the next task shouldn't have to
re-learn?* Then capture it where it will actually be found:

- A durable, non-obvious lesson or gotcha → `.agents/memory/` (index in MEMORY.md,
  detail in a topic file). See the memory rules in the system prompt.
- A reusable procedure or workflow → a new skill under `.agents/skills/`.
- A user preference or convention → the "User preferences" section of `replit.md`.

Do NOT save things derivable from the current code, implementation changelogs, or
conversation-local IDs (task numbers, SHAs). Memory is for what code can't tell you.

## The loop: explore → plan → build → verify

1. **Explore before editing.** Locate code with `rg`/glob first; read only the files
   and line ranges you need. For broad/architectural questions, dispatch the `explore`
   subagent instead of reading 10+ files yourself.
2. **Check memory first.** Scan `.agents/memory/` for relevant gotchas before you
   "try something and see." This repo has many sharp edges already documented there.
3. **Plan in small, ordered steps.** For multi-step work, write `.local/session_plan.md`
   (objective, ordered steps, key files, "done" criteria). Delete it when done.
4. **Build the smallest change that satisfies the request.** Reuse what exists — search
   for an existing table/route/component before adding a new one. Match the surrounding
   conventions (this is a pnpm monorepo; keep files small and factored).
5. **Verify before claiming done.** Typecheck, restart the affected workflow, and spot-
   check the runtime. Run the `architect` code review (code_review skill) after a
   meaningful feature. Don't report success on an unverified build.

## Repo-specific leverage (SALARYMAN)

- **pnpm monorepo, `/api` prefix.** Apps: `artifacts/interview-helper` (web) +
  `artifacts/api-server`. Shared libs in `lib/*` (e.g. `@workspace/db`).
- **Editing a shared lib** (new table/export in `lib/db`): consumers won't see it until
  the composite build emits fresh `.d.ts`. Run `pnpm run typecheck:libs`
  (`tsc --build`) — clearing tsbuildinfo alone won't fix it. (memory: composite-db-package-builds)
- **New backend route:** add the file under `artifacts/api-server/src/routes/`, then
  MOUNT it in `routes/index.ts` (`import` + `router.use(...)`) — unmounted routes are
  dead. Before adding, grep: a route for your need may already exist.
- **Auth in routes:** `requireAuth(req,res)` → userId (uses `req.isAuthenticated()`),
  401s on failure. Scope every query by `userId`.
- **Verify a route is live:** `curl -s -o /dev/null -w '%{http_code}' -X POST
  $REPLIT_DEV_DOMAIN/api/<path>` — a `401` (not `404`) means mounted + auth-gated.
- **Honest triage of "add these GitHub repos" dumps:** most pasted repos are not
  drop-in for a Node/React app. Triage into in-stack-prompt-fit, build-native-concept,
  dev-agent-tooling (→ a skill like this one), and can't-drop-in (full platforms /
  Docker). Be honest; don't fabricate fake features. (memory: github-upgrade-requests)

## Don't over-build

This owner is a Director who says "only do what I ask." Deliver exactly the requested
scope, make a reasonable call on minor details rather than asking, and stop cleanly.
Don't tack on unrequested features or close with "want me to also…?".
