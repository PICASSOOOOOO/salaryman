---
name: Pablo inline image generation
description: How Pablo draws pictures inside chat ("like Google") and the gotchas around it.
---

## Pablo generates images inline in /chat/pablo/message
Pablo can draw on demand. The message route (chat.ts, both guest AND auth paths)
runs through a shared `runPabloCompletion(messages)` helper that gives gpt-4o a
single `generate_image` OpenAI tool. On a tool call it generates via Nano Banana
(`generateImage` + `applyTaste`), then embeds the result as markdown
`![alt](cdnUrl)` appended to a SECOND completion's caption. The chat UI renders
replies through MarkdownRenderer (ReactMarkdown + remarkGfm), so markdown images
show inline — no frontend change was needed.

**Why a capability note was required:** the base system prompt lists the DARK ROOM
(/creative/darkroom) as "AI image generation", so Pablo would DESCRIBE the image and
redirect there instead of drawing. `PABLO_IMAGE_CAPABILITY` is appended to the system
prompt in both paths and explicitly overrides that ("do NOT redirect to DARK ROOM,
produce it inline"). Without that override the tool is never called.

**Constraints baked in:**
- Must answer EVERY tool_call id (generate_image + a fallback "ok" for others)
  before the second completion, or the next OpenAI call 400s.
- Hard cap MAX_IMAGES_PER_MESSAGE = 1 — the model can fire several generate_image
  calls in one turn; cap or it's an unbounded cost/latency blowup.
- Tax: sum token usage across BOTH completions (kind:"chat") + flat per-image
  charge (kind:"image") on the auth path only; guests unbilled.

**Known trade-off (intentional):** the persisted chat content stores the raw apipass
CDN URL, not a re-hosted /objects path. Simpler + no artifact base-path issues, but if
apipass rotates/expires URLs, old chat images break. Re-hosting was skipped on purpose
because the backend can't know the client BASE_URL to build a working <img> src.

**Gotcha — apipass credit:** image gen fails with `402 Insufficient credit` when the
apipass/Nano Banana account is out of credit (seen at required 19 / available 6). The
helper degrades gracefully (Pablo apologizes, 200, no image). If images "stumble" for
everyone, check apipass credit FIRST — it's not a code bug.
