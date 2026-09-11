---
name: Homepage authentic Pygame media
description: Keeps SALARYMAN homepage visuals and typography aligned with the downloadable desktop client.
---

Homepage product imagery must be captured directly from the current downloadable Pygame runtime. Do not use the old SALARYMAN trailer, teaser, browser-game footage, or a stylized display/terminal typeface on the public homepage. Use neutral professional system typography.

**Why:** The old trailer showed gameplay and visual language that did not match the downloadable client, making the product presentation misleading. The user explicitly rejected both that footage and its homepage font.

**How to apply:** When creating or refreshing homepage media, render the current Pygame client and use those captures. Re-capture after material desktop-runtime visual changes instead of substituting archived promotional footage.

The user confirmed the clean, responsive white homepage foundation but later removed gameplay promotion until the visual game is ready. The public homepage should be feature-first, with ocean/navy blue plus restrained saffron and coral—not dominant green.

Until the bright solar-punk visual game build is presentation-ready, every desktop download control stays visibly disabled and no gameplay preview is marketed. The web workspace and its high-return business features lead the homepage.

The staff-only `/desktop` download page is the exception: it may show direct captures from the current Pygame runtime so admins and approved moderators can test the downloadable build. It must never reuse archived trailer or generated gameplay footage.

**Why:** The public homepage should remain truthful and finished-looking, while internal testers need to see the actual client they are downloading.

**How to apply:** Use current-runtime Pygame captures for the download page and protect the package route server-side for Picasso admins and approved moderators.

**Browser playback rule:** The App Download hero must use a muted, inline autoplay capture with an explicit source selected from `canPlayType`: VP9/WebM when supported, otherwise H.264 MP4. Do not rely on a `<source>` list to choose the playable format.

**Why:** The development Chromium environment rejects H.264 but supports VP9. Its media element fell through an otherwise valid WebM-first source list to the unsupported MP4; direct source selection plays reliably. This is also the most reliable way to retain an MP4 fallback for browsers that lack VP9.

**How to apply:** Keep both current-runtime WebM and fast-start H.264 derivatives alongside the original capture. Verify autoplay in a real mobile browser by checking `readyState`, `paused`, and advancing `currentTime`, not from a static screenshot.