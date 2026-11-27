---
name: PTU and PU release flow
description: SALARYMAN's fast PTU testing track and stable PU release boundary.
---

For SALARYMAN, PTU means the persistent tester universe and PU means the live persistent universe. The current project/workspace is where the user does most development. PTU should receive the newest code for testing; PU at `salaryman.io` should remain on a deliberately selected, more stable release. The user wants experimental Game OS work available in PTU while locked or minimized in PU until ready. Do not start feature work over in PTU or remix changes back.

The Remix is only an initial copy: code, deployments, databases, and Stripe connections do not stay synchronized automatically. Use GitHub as the intentional one-way code handoff from the development source to PTU, then publish the tested revision to PU only after explicit user direction. Keep PTU's database and Stripe sandbox separate from PU's. Replit GitHub auto-sync can sync code but does not publish automatically; publishing still requires a separate action unless custom automation is deliberately configured.

**Why:** The user wants a continuously newer tester build for evaluating unfinished work while protecting the live universe from unstable releases.

**How to apply:** Make changes in the current development project, sync the intended commit to PTU, publish and test there, and promote only an approved stable revision to PU. Keep code-transfer one-way, preserve separate data and payment environments, and never publish to PU without explicit “PU” instruction.
