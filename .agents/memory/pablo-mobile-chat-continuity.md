---
name: Pablo mobile chat continuity
description: Mobile behavior and continuity expectations for the Pablo terminal.
---

Pablo's mobile conversation must remain scrollable and survive navigating to another top-bar destination and returning. Keep recent local session history scoped to the signed-in user. File access must use the device's user-selected picker; web pages cannot browse unselected files on a device.

**Why:** the user reported that the mobile conversation was hard to scroll, disappeared after using top options, and needed broader image/document attachment support.

**How to apply:** preserve conversation state across route changes, verify scrolling on small touch screens, and support user-selected common image/document formats without claiming filesystem-wide access.
