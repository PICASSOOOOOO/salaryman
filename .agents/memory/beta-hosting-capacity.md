---
name: Beta hosting capacity
description: SALARYMAN's GitHub-based deployment move and minimum concurrent signed-in user capacity for beta.
---

The user plans to deploy SALARYMAN from GitHub onto other server systems rather
than host it on Replit. GitHub is the source for deployment, not the hosting
platform. The destination system has not yet been selected.

The user has not chosen the beta hosting provider and wants a daily reminder
about this decision using the same reminder method as the SMS-verification
reminder. Stop the reminders when the provider is chosen.

The app must be prepared to support at least 1,000 concurrent signed-in users.
This is an application capacity target, not a count of organization members or a
requirement that all users share one city/realm.

Each city is its own server.

**Why:** the user clarified the city-to-server boundary.

**Why:** The user set the first beta day as December 25, 2026, and clarified that
the 1,000-user minimum means people must be able to sign in and use the app
concurrently, not that they are literal organization members.

**Why:** The user asked to be reminded daily until they select the hosting
provider.

**How to apply:** Evaluate deployment and scaling work against a minimum of
1,000 concurrent authenticated app users across sign-in, sessions, API, database,
and realtime services. Treat GitHub as the code source and deployment origin;
ask which destination server systems they choose before platform-specific work.
Account for each city having its own server when reasoning about game-server
capacity and isolation.
Require a container startup smoke test in addition to image construction; pass
the eagerly imported AI provider settings even when the smoke test uses dummy
values and exercises only health/static routes.

For beta-host selection, repeat a daily reminder through the user's existing
SMS-verification reminder path; stop once they choose the provider.
