---
name: Astra model rollout
description: GPT-6 Astra is an opt-in OpenAI text model that must pass a provider-only readiness probe before Pablo can use it.
---

All general-purpose OpenAI text work in SALARYMAN—including user chat, backend
automation, telephony summaries, social/campaign copy, studio tools, education,
and art-direction planning—uses the centrally selected verified model through
the existing Replit-managed OpenAI client. GPT-5 remains the safe default.
Astra requires `PABLO_ASTRA_ENABLED=1`, and even then a short provider-only
readiness probe must pass before any user content is sent to it. A model-name
override alone cannot activate Astra; failure returns to the GPT/Claude cascade.

**Why:** Astra supports the existing text capabilities needed here—streaming,
function calling, structured output, image input, and Responses API tools—but
availability can differ between proxy environments and accounts. The earlier
override-only rollout could silently route live traffic to an unsupported model.

**How to apply:** Keep audio, transcription, image-generation, Nano Banana, FAL,
Claude, and OpenClaw calls on their specialized providers; keep the fallback
path intact; and verify Astra with a provider-only probe before making provider
health claims or exposing it in a client status surface.