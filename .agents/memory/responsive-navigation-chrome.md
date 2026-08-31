---
name: Responsive navigation chrome
description: Durable rules for shared destinations, safe Back behavior, device safe areas, and short landscape layouts
---

Desktop and mobile navigation must consume one shared destination and active-state
model. Render labels on roomy screens and icons on compact screens; do not fork
the route definitions again.

**Why:** duplicated route lists had drifted in destination, visibility, and active
matching, making mobile and desktop behave like different applications.

**How to apply:** add or change primary/overflow destinations in the shared model,
then keep renderers limited to presentation and auth/staff filtering.

Back navigation may follow history only when the current entry was pushed during
the current app document session. A direct document entry or reload must use the
authenticated Office fallback (Pablo when signed out), never arbitrary browser
history.

**Why:** history length alone can send deep-linked users to an unrelated external
site or stale page from a prior document.

**How to apply:** preserve the per-document history session marker on app pushes
and replacements. New full document loads start at depth zero.

Short landscape phone/PWA viewports use the icon-first chrome even when their CSS
width exceeds the normal tablet breakpoint. Shared bottom controls use one safe
inset plus the page-action reservation, while game/fullscreen HUDs remain exempt.

**Why:** browser chrome and landscape width make width-only breakpoints unreliable,
and independent bottom offsets cause controls to overlap device home indicators.

**How to apply:** consider both width and height for chrome mode; route shared
launchers, sheets, and toasts through the common bottom-inset contract.