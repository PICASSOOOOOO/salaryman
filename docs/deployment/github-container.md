# GitHub-based build and portable app image

The repository can build a single-port container for the SALARYMAN web app and
API. GitHub Actions currently verifies the workspace, builds both production
artifacts, and constructs the image. It does **not** publish an image or deploy
to a server; no hosting provider has been selected.

## Build locally

```sh
docker build -t salaryman-app .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL \
  -e REPL_ID \
  -e SESSION_SECRET \
  -e AI_INTEGRATIONS_OPENAI_BASE_URL \
  -e AI_INTEGRATIONS_OPENAI_API_KEY \
  -e AI_INTEGRATIONS_ANTHROPIC_BASE_URL \
  -e AI_INTEGRATIONS_ANTHROPIC_API_KEY \
  salaryman-app
```

The app serves the frontend, HTTP API, and WebSocket endpoints from the same
Node process on `PORT` (8080 by default). Supply runtime credentials through the
chosen host's secret manager, never as Docker build arguments or committed
`.env` files. PostgreSQL must be reachable from the container. The API imports
the OpenAI and Anthropic integrations during startup, so both integration base
URLs and credentials must be configured even if a particular request does not
use those providers.

## Migration blockers to resolve before production hosting

- **Authentication:** sign-in currently uses Replit OIDC (`ISSUER_URL`, default
  `https://replit.com/oidc`) and requires `REPL_ID`. Confirm that this provider
  will remain usable from the new public domain, or select and implement an
  alternative before moving production traffic. Update callback URLs and
  logout behavior as part of that decision.
- **Object storage:** the current object-storage client calls the Replit
  sidecar at `127.0.0.1:1106`. A non-Replit host needs a compatible storage
  adapter and migration plan for existing public/private objects.
- **Replit connectors and domain defaults:** email/connectors and several
  callback URLs use Replit environment variables. Configure supported
  replacements and set explicit application-domain variables before cutover.
- **WebSocket proxying:** the selected host and reverse proxy must support
  WebSocket upgrades for the app's realtime paths and allow long-lived
  connections. Validate this on staging.
- **Realtime scaling:** world/chat connection state is process-local today.
  Multiple API replicas do not automatically share realtime state or fan-out.
  Validate the single-instance target first; before scaling across replicas,
  add and test a shared coordination/pub-sub layer for the affected paths.
- **Browser capture:** gameplay capture and the site audit use Playwright. This
  image does not install browser binaries or their system libraries, so those
  features need an explicit browser runtime or a separate worker before they
  are enabled on an external host.
- **Capacity:** building the image does not demonstrate 1,000 concurrent-user
  readiness. Run a controlled staging test with representative signed-in HTTP
  and WebSocket traffic, plus a separate login-burst test, before raising
  production limits.

The image is a packaging baseline, not a production migration. Keep the current
deployment active until auth, storage, database, domain, WebSocket routing, and
capacity checks pass on the selected host.
