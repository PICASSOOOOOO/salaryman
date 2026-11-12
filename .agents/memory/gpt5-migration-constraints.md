---
name: gpt-5 migration constraints (chat completions)
description: Non-obvious API differences when switching OpenAI chat-completion calls from gpt-4o* to gpt-5* via the Replit AI Integrations / modelfarm proxy.
---

# Switching gpt-4o* → gpt-5* (chat completions)

gpt-5* (gpt-5, gpt-5-mini, gpt-5-nano, …) are reasoning models, and the proxy
enforces three things a naive model-id find/replace breaks:

1. **`max_tokens` is rejected** → rename to `max_completion_tokens`
   ("Unsupported parameter: 'max_tokens' is not supported with this model" /
   "Use 'max_completion_tokens' instead").
2. **`temperature` only accepts the default (1)** → any other value 400s
   ("Only the default (1) value is supported"). Delete the field; do NOT pin it
   to a non-1 value.
3. **Reasoning eats the token budget.** Reasoning tokens are drawn from
   `max_completion_tokens`, so a tiny budget returns EMPTY content with
   `finish_reason: "length"` — a SILENT failure, not an error. ≤~16 always blank;
   need ≥~64 for visible text; plain tool-call replies survive ~200.

**Why:** gpt-4o-mini was a non-reasoning model with permissive params; gpt-5* has
a stricter param schema AND spends budget on reasoning. A model-id-only swap
compiles and 200s on some calls but 400s or returns blank on others. Real
regression seen here: a provider health check pinged gpt-5 with
`max_completion_tokens: 10`, always got empty content, and reported `gpt: false`
even though the model worked — bumping to 64 fixed it.

**How to apply:** per migrated call site, in the SAME object — drop `temperature`,
rename `max_tokens`→`max_completion_tokens`, and ensure the budget isn't tiny. For
high-volume "cheap" calls, add `reasoning_effort: "minimal"` (accepted on
chat.completions through the proxy; produces output even at ~120 tokens).
json_object mode still needs the literal word "json" in the messages (same as
gpt-4o, not a regression). Leave `gpt-4o`, `gpt-4o-mini`, and
`gpt-4o-mini-transcribe` call sites untouched — they still accept
`max_tokens`/`temperature`. Verify LIVE, not just typecheck — the empty-content
failure is silent.
