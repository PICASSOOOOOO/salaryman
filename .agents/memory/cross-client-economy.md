---
name: Cross-client economy
description: Shared browser/desktop currency and reward rules for SALARYMAN.
---

Browser “Credits” is a display label for the existing server FIAT balance, not a second balance. Desktop and browser clients must read and mutate the same server-owned FIAT and GOLD ledgers; GOLD remains separate from FIAT and conversion uses the existing quote/settlement path. Desktop task rewards require server-verifiable, idempotent completion settlement. Office-shift FIAT accrues only from linked-device heartbeats at no more than 45-second gaps while the user is seated in an authorized office or assigned-workstation floor; client-reported duration alone does not qualify. Gameplay currencies do not unlock USD-paid products such as Phone System or Automation Pixel Agents.

**Why:** The owner wants desktop earnings and spending to appear in browser balances without duplicate wallets, while preserving the existing economy, verifying work time from server-received presence, and keeping third-party USD services separately billed.

**How to apply:** Route both clients through the existing economy APIs and refresh browser balances after desktop settlements. Never accept client-supplied balances, timestamps, or local task completion as proof of a reward; accumulate office-shift time only from validated, recent presence heartbeats.