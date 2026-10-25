---
name: Beta hosting capacity
description: SALARYMAN's GitHub-based deployment move and minimum concurrent signed-in user capacity for beta.
---

The user plans to deploy SALARYMAN from GitHub onto other server systems rather
than host it on Replit. GitHub is the source for deployment, not the hosting
platform. The destination system has not yet been selected.

The app must be prepared to support at least 1,000 concurrent signed-in users.
This is an application capacity target, not a count of organization members or a
requirement that all users share one city/realm.

**Why:** The user says the alpha has gone well, expects beta by January 2027, and
clarified that the 1,000-user minimum means people must be able to sign in and
use the app concurrently, not that they are literal organization members.

**How to apply:** Evaluate deployment and scaling work against a minimum of
1,000 concurrent authenticated app users across sign-in, sessions, API, database,
and realtime services. Treat GitHub as the code source and deployment origin;
ask which destination server systems they choose before platform-specific work.
Require a container startup smoke test in addition to image construction; pass
the eagerly imported AI provider settings even when the smoke test uses dummy
values and exercises only health/static routes.
