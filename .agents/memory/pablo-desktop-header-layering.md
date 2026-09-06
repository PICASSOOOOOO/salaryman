---
name: Pablo desktop header layering
description: Fullscreen Pablo header placement relative to the global alpha warning banner.
---

The fullscreen Pablo surface starts at the viewport top, while the desktop alpha
warning is a separate sticky banner with a higher stacking order. On desktop
widths, Pablo must reserve the banner's vertical strip or its controls become
visually hidden behind the warning; narrow mobile layouts do not render that
banner.

**Why:** The fixed Pablo root and the global warning are siblings, so z-index
alone cannot make the underlying header usable without making it cover the
warning.

**How to apply:** When changing the Pablo header or global warning, verify both
desktop and narrow mobile viewports and preserve the desktop offset.