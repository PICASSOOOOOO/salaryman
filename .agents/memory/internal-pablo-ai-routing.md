---
name: Internal Pablo AI routing
description: Provider, health-check, navigation, and story-grounding invariants for Pablo and Mila.
---

Pablo and Mila are built-in capabilities backed by Replit-managed OpenAI and Anthropic integrations. User-owned provider keys and external provider Connectors are never prerequisites.

**Why:** Runtime fallback and health monitoring have different semantics. Conversation should survive one provider failing, while a provider health probe must test only that provider or it masks the outage. Client-supplied page metadata also cannot grant navigation authority.

**How to apply:** Every user-facing Pablo completion, including lightweight `/advisor/chat`, must use the shared GPT/Claude fallback rather than calling the selected GPT model directly. Disable fallback for each named provider probe. Keep final navigation actions within a server-owned exact allowlist. Project story state into bounded primitive fields, and omit character identity when Pablo privacy mode is enabled.

The configured Astra model can be rejected by the active Replit proxy even while Anthropic and the fallback GPT model are healthy. A direct route-level OpenAI call turns that provider mismatch into a user-visible chat outage; the shared internal completion helper must own the fallback.