---
name: Onboarding-aware integration fixtures
description: Test users for protected paid or mutation routes must carry the same completed browser-onboarding signal as real users.
---

Global onboarding enforcement runs before downstream route validation, so authenticated integration fixtures without a valid onboarding row receive onboarding `403` responses instead of testing the route behavior they intended to cover.

**Why:** Adding the guard exposed many false test failures in phone and automation suites because their synthetic users had authentication and entitlements but no server-authoritative onboarding record.

**How to apply:** When a test targets a protected mutation or USD-paid feature, seed a browser-onboarding row with a valid email and phone in the shared fixture. Keep separate tests for the onboarding rejection path.