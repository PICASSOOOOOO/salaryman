# SALARYMAN — Secrets, APIs & URLs reference

A living inventory of every external credential / URL the project reads, what it
unlocks, and whether it is currently set. Add secrets via the **Secrets** tab in
the Replit workspace (or ask the agent to request them) — never paste secret
values into code or env vars.

Status legend: ✅ configured · ⬜ not set (feature dormant until added) ·
🔧 platform/runtime-managed (do not edit).

---

## 1. THIS TASK — Cloud Unreal (UE5) render node

The art pipeline (`unreal` provider) is fully built and tested; it activates the
**instant** a real render-node URL is present — no code change, no redeploy. The
registry reads `isConfigured()` live, and only routes here for art rows whose
`backend` is explicitly `unreal` (the default backend stays Nano Banana).

| Key                 | Req | Status | Purpose |
| ------------------- | --- | ------ | ------- |
| `UNREAL_RENDER_URL` | yes | ⬜ | Base URL of your UE5 GPU render node, e.g. `https://render.example.com`. Setting this flips the `unreal` backend to "configured". |
| `UNREAL_RENDER_KEY` | no  | ⬜ | Bearer token, sent as `Authorization: Bearer <key>` when set. Omit if your node is open. |

> ⚠️ Do **not** set a fake/placeholder URL value. Any non-empty `UNREAL_RENDER_URL`
> makes the provider report "configured" in the admin backend picker, so a selected
> render would fail against a dead endpoint. Add the real URL only when the node is
> live; until then the slot stays empty and the pipeline falls back cleanly.

The node must implement `POST /render` + `GET /render/{jobId}` per
[`unreal-render-node-contract.md`](./unreal-render-node-contract.md).

---

## 2. Currently configured (✅ working)

| Key | Unlocks |
| --- | ------- |
| `AI_INTEGRATIONS_OPENAI_API_KEY` / `_BASE_URL` | Pablo/Mila chat, inline image-gen tool, OpenAI TTS fallback (Replit OpenAI integration). |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` / `_BASE_URL` | Anthropic model access (Replit Anthropic integration). |
| `ELEVENLABS_API_KEY` | Primary voice TTS for Pablo/Mila. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_LIVE_API_KEY`, `STRIPE_LIVE_API_KEY_2`, `STRIPE_PRO_PRICE_ID` | Payments, PRIME subscription, webhooks, pledge store checkout. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Phone system: calls, SMS, voicemail (CRM telephony). |
| `DISCORD_WEBHOOK_URL` | Discord alert/notification posts. |
| `SLACK_LIVE_API_KEY` | Slack integration posts. |
| `OWNER_EMAILS` | Owner / Picasso-staff gating for admin & exec routes. |
| `SESSION_SECRET` | Express session signing. |
| `DATABASE_URL`, `PG*` 🔧 | Postgres (runtime-managed). |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` 🔧 | App Storage (object storage). |
| `REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN`, `REPL_ID` 🔧 | Platform runtime (auth callback domain, etc.). |

---

## 3. Optional — dormant until you add them (⬜)

Each unlocks a specific feature; the app runs without them (feature is hidden,
simulated, or falls back).

### Art / media backends
| Key | Unlocks |
| --- | ------- |
| `UNREAL_RENDER_URL` / `UNREAL_RENDER_KEY` | UE5 render backend (see §1). |
| `FAL_KEY` (+ `FAL_IMAGE_MODEL`, `FAL_UPSCALE_MODEL`, `FAL_BG_REMOVE_MODEL`) | fal.ai art backend + the polish/upscale/background-remove pass. |
| `NANO_BANANA_API_KEY` | Direct Nano Banana key for the default art backend (otherwise uses the AI-integration credit path). |
| `REPLICATE_API_TOKEN` | Replicate-hosted media models. |
| `ELEVENLABS_VOICE_ID` | Pin a specific ElevenLabs voice (else default). |

### Discord (login + server automation)
| Key | Unlocks |
| --- | ------- |
| `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_MOD_ROLE_ID` | Silent member add, auto-moderation, role grants. |
| `DISCORD_OAUTH_CLIENT_ID`, `DISCORD_OAUTH_CLIENT_SECRET` | "Sign in / connect with Discord" (login breaks only if these are missing). |
| `DISCORD_GUILD_INVITE_URL` | Invite link shown in-app (currently set as an env var). |

### GitHub (login)

A GitHub OAuth App allows exactly **one** authorization callback URL, so the dev
domain (`*.replit.dev`) and the published prod host can't share one app. The
server picks the right credential pair per request host (`resolveGithubCreds` in
`lib/github-auth.ts`): development hosts use the default pair, production hosts
prefer the `*_PROD` pair and fall back to the default pair when it's absent.

| Key | Unlocks |
| --- | ------- |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | "Sign in with GitHub" on the **dev** domain. GitHub OAuth App with callback `https://<dev-host>.replit.dev/api/auth/github/callback`. Button is hidden/inert if missing. |
| `GITHUB_OAUTH_CLIENT_ID_PROD`, `GITHUB_OAUTH_CLIENT_SECRET_PROD` | "Sign in with GitHub" on the **published prod** host. Register a SECOND GitHub OAuth App with callback `https://<prod-host>/api/auth/github/callback` (e.g. `https://picassoo.app/api/auth/github/callback`) and store its id/secret here. If unset, prod falls back to the dev pair — which GitHub will reject because the callback host won't match. |

### Marketing / social OAuth (owner must register each app)
| Key | Unlocks |
| --- | ------- |
| `FACEBOOK_APP_SECRET` | Facebook publishing. |
| `LINKEDIN_OAUTH_CLIENT_ID` / `_CLIENT_SECRET` | LinkedIn publishing. |
| `GMAIL_OAUTH_CLIENT_ID` / `_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` | Gmail/Google send + OAuth callback. |
| `SPOTIFY_CLIENT_ID` / `_CLIENT_SECRET`, `APPLE_MUSIC_DEVELOPER_TOKEN` | Music integrations (Hummingbird). |

### Telephony (browser-side calling)
| Key | Unlocks |
| --- | ------- |
| `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID` | Twilio Voice SDK in-browser dialer (the base SMS/voice stack already works via the SID/token above). |

Run the owner-managed daily phone check as a **Scheduled Deployment** with the
exact command `pnpm --filter @workspace/api-server run health:phone`. Configure
`HEALTH_CHECK_BASE_URL` to the published app origin and
`PHONE_HEALTH_ALERT_EMAIL` (or `OWNER_EMAILS`) for alerts. The check validates
credentials, account/number/balance, the TwiML Application's exact Voice URL,
and the deployed client-voice TwiML contract without placing a charged call.

### Payroll / commerce
| Key | Unlocks |
| --- | ------- |
| `GUSTO_API_KEY` | Real Gusto payroll payouts (currently metadata-only). |
| `STRIPE_PRICE_SEASON_PASS` | Season-pass price id (else uses default catalog). |

### Internal signing secrets (recommended for production)
| Key | Purpose |
| --- | ------- |
| `BOT_ENCRYPTION_KEY` | Encrypt stored bot OAuth credentials. |
| `BOT_OAUTH_STATE_SECRET`, `OAUTH_STATE_SECRET`, `GUEST_TOKEN_SECRET` | Sign OAuth state / guest tokens. |
| `OPENCLAW_GATEWAY_TOKEN` | OpenClaw gateway auth. |

### Tuning / config (env vars, not secrets — have safe defaults)
`SERVER_CITY_ID`, `SERVER_REGION`, `MAX_PLAYERS` / `SERVER_MAX_PLAYERS` (realm
config), `PLEDGE_MARKUP_PCT` (store markup), `PHONE_HEALTH_ALERT_EMAIL` /
`PHONE_HEALTH_ALWAYS_EMAIL` / `PHONE_HEALTH_MIN_BALANCE` (phone health check),
`TIKTOK_PRIVACY_LEVEL`, `CAPTURE_*` (gameplay capture), `APP_URL` / `APP_BASE_URL`
/ `PUBLIC_APP_URL` / `APP_DOMAIN` / `ISSUER_URL` / `HEALTH_CHECK_BASE_URL` (URLs,
mostly derived from `REPLIT_DOMAINS`).
