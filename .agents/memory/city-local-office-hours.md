---
name: City-local office hours
description: Real-time Tower business hours must use server-synchronised IANA timezone clocks, not the fictional world calendar or browser locale.
---

The fictional world calendar and real-world office hours are separate systems. Resolve local date, weekday, and time with `Intl.DateTimeFormat(..., { timeZone })`; overnight windows must also test the previous local weekday, so DST and cross-midnight schedules remain correct.

**Why:** The same Tower runs in multiple city realms. A browser locale or fictional `g.worldTime` makes Huda and Minx tenants open or closed at the wrong moment.

**How to apply:** Keep timezone identity in the shared city registry, expose a server-synchronised clock for UI, and enforce open/closed state again on every authoritative business action.