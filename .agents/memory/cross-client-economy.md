---
name: Cross-client economy
description: Shared browser/desktop currency and reward rules for SALARYMAN.
---

The current Credits economy uses one new server-authoritative balance shared across browser and game clients: the browser labels it “Credits,” and the game labels it “battery charges.” Every logged-in account, including Free, can use Credits and the Gold exchange. Gold remains a separate game balance; vending converts Gold into Credits. Do not silently merge legacy FIAT/GOLD balances into Credits without an explicit migration rule. New monthly plan prices are Free, $50, $100, and Custom; new checkout must use an exact matching Stripe price and must not change existing subscriptions. Desktop task rewards require server-verifiable, idempotent completion settlement. Office-shift FIAT accrues only from linked-device heartbeats at no more than 45-second gaps while the user is seated in an authorized office or assigned-workstation floor; client-reported duration alone does not qualify. Gameplay currencies do not unlock USD-paid products such as Phone System or Automation Pixel Agents.

**Why:** The user wants a shared Credits/battery-charges wallet available to logged-in free users, with Gold vending feeding it, while preserving legacy balances and keeping third-party USD services separately billed.

**How to apply:** Route both clients through authenticated server-owned Credits APIs and refresh browser balances after settlements. Keep Credits distinct from legacy FIAT and Gold unless an explicit migration rule says otherwise. Never accept client-supplied balances, timestamps, or local task completion as proof of a reward; accumulate office-shift time only from validated, recent presence heartbeats.