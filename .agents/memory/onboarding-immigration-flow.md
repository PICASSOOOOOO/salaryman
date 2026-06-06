---
name: SALARYMAN onboarding = Immigration flow
description: Where the new-player onboarding the user actually sees lives, and what is dead.
---

The onboarding a new SALARYMAN (interview-helper) player actually experiences is the
post-OAuth **Immigration** page flow, NOT PabloTerminal.

Flow order (Immigration.tsx phases):
`wakeup` → `intake` → `stamping` → `intro` → `/office`
- wakeup   = WakeUpScene (asleep-at-desk, "you're late", CLOCK IN)
- intake   = PabloOnboarding — CONSOLIDATED into 4 grouped pages (not ~12 micro-steps):
  GREET → IDENTITY (name/email/gender + CHARACTER BUILDER w/ live drawPlayerSprite preview)
  → BUSINESS (choice + type/company/industry/faction/job/headcount/payroll/income)
  → REAL ESTATE (home-city picker + office tier + location consent). Posts /api/world/register.
  A single buildAnswers() is the source of truth; onComplete fires ONCE on the final CTA.
- stamping = StampingPanel (economy/housing fees, charges /api/onboard-housing/charge)
- intro    = PostOnboardingIntro (interactive controls tutorial via playable PixelOffice → onEnterTerminal)

**The separate `relocation` phase + CityImmigrationPanel are GONE** — the home-city picker
is folded into PabloOnboarding's REAL ESTATE page; Immigration.handleComplete persists it and
fire-and-forgets POST /api/world/home-city {homeCityId, locationConsent, coarseLocation}
(coarseLocation gated by consent), then goes straight to stamping. The old `pace` quick/full
screen is dropped (hardcoded 'full' in the register payload — keep the field). Appearance is
persisted into the save blob as `data.appearance` (WorldPlay reads it). Stamping welcome line
resolves the chosen city via getCityById, not a hardcoded "MINX CITY".

**Onboarding ends at `/office`, NOT the Rebellion film.** handleIntroComplete used to
navigate('/rebellion') (6-act manifesto film) after the controls tutorial; that was a
jarring wall right after the "enter your terminal" beat. It now navigates('/office')
(+matching hard-reload fallback). The Rebellion film is still reachable from Home — it's
just no longer a mandatory step. Don't "restore" the /rebellion handoff thinking it's a regression.

**What is dead / a trap:** PabloTerminal's old long Pablo monologue + "passcode riddle"
framing. The passcode gate was already removed; `STORY_LINES` was unused and is now deleted;
`INTRO_LINES` is a single line. Don't go editing PabloTerminal looking for onboarding copy —
edit the Immigration components above.

**Why:** "redesign onboarding" reads like it lives in the terminal, but the terminal
monologue had been dead for a while; the real funnel is Immigration.

**Intake art is PAINTED, not pixel.** The "intake office" the user pointed at is the
`<PixelOffice>` diorama in PabloOnboarding's GREET step — now swapped for the cinematic
painted `scene_office` (Nano Banana) via `useArtAsset`, with the pixel diorama as a
graceful fallback until the asset resolves. ImmigrationBackdrop also gets a painted base
(`scene_office` intake / `scene_pablo_terminal` stamping) BEHIND the canonical Pablo orb
(orb is additive-only — keep it). Scenes live in `art_assets` (status='ready' w/ url),
served at /api/art/asset/:key. NEW scene generation is credit-gated (apipass 402), but the
intake scenes are already baked. PabloOnboarding is shared by Immigration AND WorldPlay, so
the greet swap hits both surfaces (intended). NOTE remaining pixel surface: PostOnboardingIntro's
playable tutorial diorama is still pixel (interactive — larger separate lift).

**How to apply:** Any onboarding copy/flow change → start in Immigration.tsx and its
child components (WakeUpScene, PabloOnboarding, PostOnboardingIntro). Keep the
POST /api/world/register payload contract intact (playerName, businessType, companyName,
industry, companySize, contactEmail, isPaid, payrollProvider, declaredMonthlyIncome,
incomeVerified, pace, faction, jobClass) and the tutorial-progress state getters/setters.
PixelOffice already supports `playable` + `onEnterTerminal` — reuse it for hands-on tutorials.
