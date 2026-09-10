---
name: Responsive navigation chrome
description: Durable rules for shared destinations, safe Back behavior, device safe areas, and short landscape layouts
---

Desktop navigation may expose the shared destination model. Mobile uses only one
minimal top header; do not add a fixed bottom navigation bar, subnavigation row,
or floating feedback control over page content.

**Why:** duplicated route lists had drifted in destination, visibility, and active
matching, making mobile and desktop behave like different applications.

**How to apply:** add or change desktop/overflow destinations in the shared model.
Keep mobile page chrome limited to Back, SALARYMAN, and login/account.

Back navigation may follow history only when the current entry was pushed during
the current app document session. A direct document entry or reload must use the
authenticated Office fallback (`/` when signed out), never arbitrary browser
history.

**Why:** history length alone can send deep-linked users to an unrelated external
site or stale page from a prior document.

**How to apply:** preserve the per-document history session marker on app pushes
and replacements. New full document loads start at depth zero.

Do not reserve mobile viewport space for global bottom controls. Page-owned actions
must remain in normal document flow unless the page is an intentionally fullscreen
surface.

**Why:** the old fixed navigation and feedback button covered forms and primary
actions on small phones and made every page look like a control panel.

**How to apply:** verify important pages at 320px and reject any global control
that overlays page content.