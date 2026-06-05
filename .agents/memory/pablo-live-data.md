---
name: Pablo live-data grounding
description: How Pablo/Mila get current date + web-search facts, and the rules for changing it
---

# Pablo live-data grounding

Pablo/Mila run on gpt-4o (chat.completions), which has a fixed training cutoff
and otherwise does not even know the real current date. Live awareness is added
via `artifacts/api-server/src/lib/pablo-live.ts` → `buildLiveContext(userText)`,
appended to the persona system prompt at three entry points in `chat.ts`: guest
`/chat/pablo/message`, authed `/chat/pablo/message`, and the `/chat/pablo/command`
terminal route.

- `buildLiveContext` ALWAYS adds the real current UTC date line, and adds a
  fresh web brief only when a broad regex (`needsLiveSearch`) matches.
- Web search uses the **OpenAI Responses API `web_search` tool**
  (`openai.responses.create({ model:"gpt-4o", tools:[{type:"web_search"}], input })`).

**Why this shape:** the Replit OpenAI proxy SUPPORTS the Responses API
`web_search` tool, but does NOT support the `gpt-4o-search-preview` chat model
(returns 400 "not supported"). So web search must go through `responses.create`,
not `chat.completions`.

**How to apply / constraints:**
- The web brief is UNTRUSTED open-web content. It is fenced
  (`<<<LIVE_REFERENCE_START>>>…`) with an explicit anti-prompt-injection
  guardrail because command mode emits navigate/external ACTIONS — keep that
  fence if you touch the brief assembly.
- `pabloWebSearch` is best-effort (catches, returns null, 12s timeout) so a
  search failure never breaks the chat reply.
- Web search is awaited INLINE before the main completion, so matched turns are
  slower/cost more; the heuristic gates it and the existing guest IP cap bounds
  guest usage. Don't make it unconditional.
- The date line explicitly notes the in-world game calendar/quarter is a
  SEPARATE fictional clock (see quarter-season-weather.md) — don't let Pablo
  conflate real "today" with story.quarter.
