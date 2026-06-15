---
name: gpt-5 migration constraints
description: Non-obvious API differences when switching OpenAI chat-completion calls from gpt-4o to gpt-5 (via the Replit modelfarm proxy).
---

# Switching gpt-4o → gpt-5 (chat completions)

gpt-5 is a reasoning model and the modelfarm/OpenAI proxy enforces three things a
naive find-replace breaks:

1. **`max_tokens` is rejected** → must use `max_completion_tokens`. Error: "Unsupported parameter: 'max_tokens' is not supported with this model."
2. **`temperature` only accepts the default (1)** → any other value 400s ("Only the default (1) value is supported"). Drop the `temperature` field entirely; do NOT pin it to a non-1 value.
3. **Reasoning eats the token budget.** Tiny `max_completion_tokens` (≤~16) returns EMPTY content (`finish_reason: "length"`) because reasoning tokens are charged against the same budget. Need ≥~64 to get any visible text back. Plain tool-call replies survive ~200.

**Why:** these caused a real regression here — a provider health check pinged gpt-5 with `max_completion_tokens: 10` and always got empty content, reporting `gpt: false` even though the model worked. Bumping to 64 fixed it.

**How to apply:** when migrating a call site to gpt-5, in the SAME object: rename `max_tokens`→`max_completion_tokens`, delete any `temperature`, and sanity-check the budget isn't tiny. Leave `gpt-4o-mini` / `gpt-4o-mini-transcribe` untouched — those are different models that still accept `max_tokens`/`temperature`. Verify live, don't just typecheck: the empty-content failure is silent.
