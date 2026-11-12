---
name: Release and pledge-store roadmap
description: SALARYMAN's beta target, publishing readiness, and the dependency that puts pledge-store work after the asset catalog.
---

SALARYMAN is in alpha. The first beta day is December 25, 2026. The user wants
at least 30 consecutive days without errors on major features before beta
(November 25 through December 24 if the period is immediately before launch),
and wants automation tested and used extensively.

The alpha release counter should be shorter and advance on each publish. The
exact display format and a durable publish-event source still need to be decided;
the current git-commit-derived build number is not a publish counter.

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
complete. Increment a short alpha release counter only through a durable
successful-publish signal. Treat catalog completion as a prerequisite for
pledge-store offers and keep the base game free.
