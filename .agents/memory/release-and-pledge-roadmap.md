---
name: Release and pledge-store roadmap
description: SALARYMAN's beta target, publishing readiness, and the dependency that puts pledge-store work after the asset catalog.
---

SALARYMAN is in alpha. The first beta day is December 25, 2026. The user wants
at least 30 consecutive days without errors on major features before beta
(November 25 through December 24 if the period is immediately before launch),
and wants automation tested and used extensively.

The alpha version should display only the major.minor number, such as `v24.3`;
do not append an `a1` or Git commit-count suffix. Advance the existing minor
number on each publish and roll over to the next major when the minor reaches
its limit. The publish event still needs a durable source so increments do not
repeat across fresh builds.

Keep the game free and preserve the planned macOS, Windows, Linux, itch.io, and
Twitch/watch paths.

Pledge-store work is intentionally deferred until the objects, avatars,
furniture, decorations, and related catalog are decided. After that catalog is
settled, the user wants optional advantages and features offered through the
pledge store to help cover Replit costs.

**Why:** The user set the beta date, stability target, versioning rule, and
explicitly made pledge-store design dependent on completing the sellable asset
catalog first.

**How to apply:** Plan for a 30-day major-feature stability window before beta;
define the major-feature inventory and error criteria before claiming it is
complete. Show only the major.minor version and tie its rollover to successful
publishes through a durable release signal. Treat catalog completion as a
prerequisite for pledge-store offers and keep the base game free.
