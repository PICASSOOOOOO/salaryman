---
name: Astra model rollout
description: GPT-6 Astra is the preferred OpenAI text model, with a controlled gpt-5 fallback for proxy or availability gaps.
---

All general-purpose OpenAI text work in SALARYMAN—including user chat, backend
automation, telephony summaries, social/campaign copy, studio tools, education,
and art-direction planning—prefers OpenAI's `gpt-6-astra` through the existing
Replit-managed OpenAI client. The model is selected centrally and can be
overridden with `OPENAI_TEXT_MODEL`; failures fall back to the existing
GPT/Claude cascade instead of taking chat offline.

**Why:** Astra supports the existing text capabilities needed here—streaming,
function calling, structured output, image input, and Responses API tools—but
availability can differ between proxy environments and accounts.

**How to apply:** Keep audio, transcription, image-generation, Nano Banana, FAL,
Claude, and OpenClaw calls on their specialized providers; keep the fallback
path intact; and verify Astra with a live capability probe before making
provider health claims.