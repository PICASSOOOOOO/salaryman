---
name: Internal Pablo AI routing
description: Provider, health-check, navigation, and story-grounding invariants for Pablo and Mila.
---

Pablo and Mila are built-in capabilities backed by Replit-managed OpenAI and Anthropic integrations. User-owned provider keys and external provider Connectors are never prerequisites.

**Why:** Runtime fallback and health monitoring have different semantics. Conversation should survive one provider failing, while a provider health probe must test only that provider or it masks the outage. Client-supplied page metadata also cannot grant navigation authority.

**How to apply:** Every user-facing Pablo completion, including lightweight `/advisor/chat`, must use the shared GPT/Claude fallback rather than calling the selected GPT model directly. Disable fallback for each named provider probe. Keep final navigation actions within a server-owned exact allowlist. Project story state into bounded primitive fields, and omit character identity when Pablo privacy mode is enabled.

The configured Astra model can be rejected by the active Replit proxy even while Anthropic and the fallback GPT model are healthy. A direct route-level OpenAI call turns that provider mismatch into a user-visible chat outage; the shared internal completion helper must own the fallback.

Interactive live weather now uses Open-Meteo directly, with a required explicit place and bounded per-request timeouts. Other live web searches remain best-effort and make one short attempt only; never let a slow search block a whole chat turn with a retry.

**Why:** Live web search was timing out in Pablo’s request path and delaying replies; a direct weather endpoint returned current conditions reliably, while the managed model fallback still answered normally.

**How to apply:** Keep current weather distinct from general web research. If the user gives no location or the provider fails, have Pablo ask for the city or clearly say live conditions could not be fetched instead of guessing.