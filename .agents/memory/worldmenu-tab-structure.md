---
name: WorldMenu tab block placement
description: Where tab-content blocks live in WorldMenu.tsx vs the bottom bar / welcome dialog
---

In `artifacts/interview-helper/src/pages/WorldMenu.tsx`, all `{tab === '...' && (...)}`
content blocks live inside ONE tab-content container `<div>` that CLOSES right
before the "Bottom bar" comment. After that container come (still inside the
outermost div): the bottom bar, then the `showWelcomeDialog` modal, then the
outermost `</div>` and `);`.

**Trap:** the JSX at the very end of the file (the `</button> )} </div> </div> )} </div> );`
chain) belongs to the **welcome dialog** (its ENTER CITY / VIEW PLANS buttons),
NOT to a tab block. Anchoring a new tab block on the file's tail places it
OUTSIDE the tab container and after the bottom bar — it renders at the page
bottom, mispositioned.

**How to apply:** add a new tab block as a sibling of the others — anchor right
after the FIELD GUIDE block's closing `)}` (just before the tab-container `</div>`
that precedes the `{/* Bottom bar */}` comment). Also update the tab-bar `.map`
array and the `tab` useState union type.
