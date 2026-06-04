---
name: Pre-onboarding signup-intent detectors
description: Where the logged-out chat funnel's buying-signal detectors live and the rule that cost/"is it free" questions are buying signals routed to intake.
---

# Pre-onboarding signup-intent detectors (PabloTerminal funnel)

The logged-out visitor flow in `PabloTerminal.tsx` runs a `chatting` phase where pure regex detectors decide whether to pivot the visitor into intake (ask name → OAuth) vs. let the free-chat LLM answer.

The pure detectors live in `interview-helper/src/lib/signup-intent.ts` (`isReadyToEnter`, `isCostCurious`), extracted from the component so they're unit-testable (`signup-intent.test.ts`). Edit the lib, not an inline copy.

**Decision / rule:** cost & "is it free" questions ("how much…", "do I have to pay", "free to join", "I don't want to pay") are treated as **buying signals**, not idle questions. They get a reassuring "walking in is free — only advantage costs" line and pivot straight to intake, rather than being answered by the free-chat LLM.
**Why:** the owner flagged these phrasings as people who are ready to sign up; answering inline risks losing them mid-funnel. Also matches Pablo's persona rule (chat.ts): "platform is free; advantage costs — pledge at the store."
**How to apply:** when adding more buying-signal keywords, extend the regexes in signup-intent.ts and add positive/negative cases to the test. Keep `how much`/`pay` tied to a product/cost object (avoid hijacking "how much time…", "pay rent"); negation guard (`NEGATED_READY_RE`) drops "can't/don't/won't sign up".

**Chatting-phase precedence (order matters):** `detectSignInIntent` (returning user → straight OAuth, runs globally first) → crosstalk → `isCostCurious` → `isReadyToEnter` → `wantsTool` → identity-volunteer (email/name) → free-chat LLM.
