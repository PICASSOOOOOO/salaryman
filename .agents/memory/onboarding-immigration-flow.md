---
name: SALARYMAN onboarding = Immigration flow
description: Where the new-player onboarding the user actually sees lives, and what is dead.
---

The onboarding a new SALARYMAN (interview-helper) player actually experiences is the
post-OAuth **Immigration** page flow, NOT PabloTerminal.

Flow order (Immigration.tsx phases):
`wakeup` → `intake` → `stamping` → `intro` → `/rebellion` → `/office`
- wakeup   = WakeUpScene (asleep-at-desk, "you're late", CLOCK IN)
- intake   = PabloOnboarding (the choice steps; posts POST /api/world/register)
- stamping = StampingPanel (economy/housing fees, charges /api/onboard-housing/charge)
- intro    = PostOnboardingIntro (interactive controls tutorial via playable PixelOffice → onEnterTerminal)

**What is dead / a trap:** PabloTerminal's old long Pablo monologue + "passcode riddle"
framing. The passcode gate was already removed; `STORY_LINES` was unused and is now deleted;
`INTRO_LINES` is a single line. Don't go editing PabloTerminal looking for onboarding copy —
edit the Immigration components above.

**Why:** "redesign onboarding" reads like it lives in the terminal, but the terminal
monologue had been dead for a while; the real funnel is Immigration.

**How to apply:** Any onboarding copy/flow change → start in Immigration.tsx and its
child components (WakeUpScene, PabloOnboarding, PostOnboardingIntro). Keep the
POST /api/world/register payload contract intact (playerName, businessType, companyName,
industry, companySize, contactEmail, isPaid, payrollProvider, declaredMonthlyIncome,
incomeVerified, pace, faction, jobClass) and the tutorial-progress state getters/setters.
PixelOffice already supports `playable` + `onEnterTerminal` — reuse it for hands-on tutorials.
