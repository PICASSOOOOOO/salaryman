---
name: gpt-5 family chat-completions param constraints
description: Why swapping a chat call to a gpt-5* model breaks on temperature/max_tokens and tight token budgets, and how to fix.
---

When migrating an OpenAI chat.completions call from a gpt-4o* model to a gpt-5*
model (gpt-5, gpt-5-mini, gpt-5-nano, etc.) via the Replit AI Integrations proxy,
three things break:

1. `temperature` only accepts the default (1). Any other value → HTTP 400
   `Unsupported value: 'temperature' does not support X`. Remove the param.
2. `max_tokens` is rejected → 400 `Use 'max_completion_tokens' instead`. Rename it.
3. gpt-5* are reasoning models: reasoning tokens are drawn from
   `max_completion_tokens`. A small budget (e.g. 120–200) can be fully consumed by
   reasoning, returning EMPTY content with `finish_reason: "length"` — looks like a
   silent failure, not an error.

**Why:** gpt-4o-mini was a non-reasoning model with permissive params; gpt-5-mini is
a reasoning model with a stricter param schema. A naive find/replace of just the
model id compiles and 200s on some calls but 400s or returns blank on others.

**How to apply:** for each migrated call — drop `temperature`, rename
`max_tokens`→`max_completion_tokens`, and to keep these high-volume "cheap"
calls fast/cheap and guarantee output, add `reasoning_effort: "minimal"` (verified
to produce output even at ~120 tokens). `reasoning_effort` IS accepted on
chat.completions through the proxy. json_object mode still requires the literal
word "json" in the messages (same rule as gpt-4o, not a regression). Note gpt-4o
(non-mini) and Claude call sites in the same files are unaffected — leave them.
