---
name: Character identity single source
description: Where the player's appearance/portrait lives and how photo→character generation flows end-to-end.
---

# Character identity single source

- Procedural paper-doll `Appearance` lives in `interview-helper/src/lib/character-identity.ts`; `drawPlayerSprite` is THE in-world renderer. `sanitizeAppearance` is the gate for what persists.
- Appearance rides the NORMAL save under `data.appearance` (onboarding `buildAnswers` spreads it into the save payload; the PUT stores `data` jsonb wholesale, no server strip). Anything you add to `Appearance` must be allow-listed in `sanitizeAppearance` or it can be a stored-payload injection vector.

## Two photo→character paths (don't confuse them)
1. **Swatch derive** — `POST /salaryman/appearance/from-photo` (uses the user's stored profile photo): vision model maps the photo onto the SAME fixed palettes (skin/hair/outfit), returns `{appearance}`. Drives the pixel sprite only. No image generation.
2. **Painted portrait (headline path)** — `POST /salaryman/character/portrait` (client uploads a fresh selfie). This is the "real, good-looking character" the user wanted instead of pixel swatches.

## Painted-portrait pipeline (`/salaryman/character/portrait`)
- Client (`PabloOnboarding.tsx`) downscales the selfie to a ≤1024px JPEG **data URL** (canvas), POSTs `{photo, gender, charClass}`.
- Server: auth + `canUseApiFeatures` budget gate (402 graceful) → `ObjectStorageService.uploadBuffer` hosts the selfie → `signDownloadURL` mints a short GET URL → **in parallel** `generateImage` (Nano Banana image-to-image, `imageInput=[signedUrl]`, aspect `2:3`, `1K`, jpg) + swatch derive → re-host the result (model URL is temporary) → fire-and-forget `chargePabloTax` (~4¢) → return `{portraitUrl: "/objects/...", appearance}`.
- `appearance.portraitUrl?: string` is the new optional field; client stores it and it's shown as the headline avatar via `resolveAvatarUrl` (renders `/objects/...`). Swatches still derived so the in-world pixel sprite resembles the player.

## Critical constraints / gotchas
- **External model fetches OUR signed object-storage URL directly.** Validated live: upload+sign+our fetch=200 and apipass accepted the GCS signed URL and started the task. (Only ever blocked by `402 Insufficient credit` — an apipass account-balance issue, NOT a code bug; route returns it gracefully.)
- **Selfies are sensitive biometric input — delete after use.** The route deletes the source selfie in a `finally` (`ObjectStorageService.deleteObject`, never-throws) on success OR failure. Don't leave selfies in object storage: `/storage/objects/*` is path-protected but NOT ACL-gated (see object-acl-disabled-posture), so a retained selfie is effectively retrievable by path. The PORTRAIT staying public-by-path is fine (it's an avatar, same posture as profile photos).
- Re-host fetch of `gen.imageUrls[0]` has no host allowlist — consistent with the other re-host sites (`studio.ts`, `studio-gen.ts`); the URL is a trusted first-party apipass result.
- Nano Banana Pro only does LANDSCAPE/PORTRAIT (no true square/transparency) and ignores `outputFormat` for some shapes — `2:3` maps to PORTRAIT.
