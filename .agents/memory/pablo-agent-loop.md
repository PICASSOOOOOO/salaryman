---
name: Pablo agent loop (OpenAI tool-calling)
description: Threading + safety rules for the Pablo autonomous agent loop that runs real userId-scoped pipeline/memory actions
---

# Pablo agent loop

POST /api/pablo/agent/run runs a bounded OpenAI tool-calling loop that executes
REAL userId-scoped actions (deal pipeline + Pablo memory), persisting each run +
steps. Backed by three drizzle tables (memories, commands, agent_runs).

## Tool-call threading (the bug that bites)
**Rule:** an assistant turn that emits N tool_calls MUST be answered with N
tool-role messages, one per `tool_call_id` — even the `finish` call, even when
you're about to break the loop.
**Why:** the model can emit multiple tool calls in one turn. If you append the
full `tool_calls` array to history but only reply to the first, the NEXT
`chat.completions.create` call 400s on unmatched tool calls. Original loop read
`msg.tool_calls?.[0]` only → latent 400.
**How to apply:** iterate over ALL `toolCalls` each iteration; push one
`{role:"tool", tool_call_id, content}` per call; track a `finished` flag and
break only AFTER the inner loop so every id is paired.

## Other invariants
- Loop is bounded by MAX_STEPS; always persist a run row even on error path.
- Every tool execution is scoped by userId (move_deal's ilike title match is
  `and(eq(userId), ilike(...))` — no cross-user moves).
- **move_deal must hit exactly one row.** A fuzzy `UPDATE ... WHERE ilike('%title%')`
  with `.returning()[0]` silently bulk-mutates every partial match while reporting
  only one — autonomous runs then corrupt the pipeline. Resolve first: SELECT the
  matches (limit small), reject when >1 as ambiguous (list candidates back to the
  model), and UPDATE by `id` only when exactly one matches. Same rule for any
  "act on a named entity" tool — never let a fuzzy match fan out to a write.

## Command default-seeding race
ensureSeeded (pablo-commands.ts) is count-then-insert → two concurrent first
GETs could both insert defaults. Fixed with a per-user transaction-scoped
advisory lock: `pg_advisory_xact_lock(hashtext('pablo_cmd_seed:'+userId))`
inside `db.transaction`, auto-released at xact end. Use this pattern for any
"seed-on-first-read" path here rather than adding a unique constraint (custom
commands may legitimately share labels).
