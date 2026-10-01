# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pablo-auth.smoke.spec.ts >> console sign-in reaches the Replit authorization handoff
- Location: e2e/pablo-auth.smoke.spec.ts:13:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'SIGN IN' })
Expected: visible
Error: strict mode violation: getByRole('button', { name: 'SIGN IN' }) resolved to 2 elements:
    1) <button type="button" title="Sign in" aria-label="Sign in" class="flex min-h-10 items-center rounded-md px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">SIGN IN</button> aka getByRole('button', { name: 'Sign in', description: 'Sign in' })
    2) <button>SIGN IN</button> aka getByRole('button', { name: 'SIGN IN', exact: true })

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: 'SIGN IN' })

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - status "Pablo is synchronizing this workspace" [ref=e3]:
    - generic [ref=e4]:
      - paragraph [ref=e10]: LOADING PABLO
      - paragraph [ref=e11]: LOADING YOUR WORKSPACE
  - region "Notifications (F8)":
    - list
```

# Test source

```ts
  1  | /** E2E smoke checks for the public Pablo surface and its sign-in handoff. */
  2  | 
  3  | import { test, expect } from "@playwright/test";
  4  | 
  5  | test("Pablo mounts the nebula instead of the route loading screen", async ({ page }) => {
  6  |   await page.goto("/pablo", { waitUntil: "networkidle" });
  7  | 
  8  |   await expect(page.locator('[data-testid="pablo-orb"]')).toBeVisible();
  9  |   await expect(page.locator('[data-testid="pablo-orb"] canvas')).toHaveCount(1);
  10 |   await expect(page.getByText("PABLO // SYNCING")).toHaveCount(0);
  11 | });
  12 | 
  13 | test("console sign-in reaches the Replit authorization handoff", async ({ page }) => {
  14 |   await page.goto("/console", { waitUntil: "networkidle" });
  15 | 
  16 |   const signIn = page.getByRole("button", { name: "SIGN IN" });
> 17 |   await expect(signIn).toBeVisible();
     |                        ^ Error: expect(locator).toBeVisible() failed
  18 |   await Promise.all([
  19 |     page.waitForURL(/https:\/\/replit\.com\/(?:oidc\/auth|oidc\/login|oidc-login-consent)/),
  20 |     signIn.click(),
  21 |   ]);
  22 | });
```