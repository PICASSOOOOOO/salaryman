# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: profile.labor-record.spec.ts >> anonymous /profile access returns to the public Pablo front door
- Location: e2e/profile.labor-record.spec.ts:11:1

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/pablo(?:$|[?#])/
Received string:  "https://4cd4455d-8664-45df-88b0-61c0445e96ff-00-1ddsloe07rpc5.kirk.replit.dev/sign-in?returnTo=%2Fprofile"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    13 × unexpected value "https://4cd4455d-8664-45df-88b0-61c0445e96ff-00-1ddsloe07rpc5.kirk.replit.dev/sign-in?returnTo=%2Fprofile"

```

```yaml
- banner:
  - button "SALARYMAN home": SALARYMAN ALPHA v.24.0.2495
  - navigation "Main navigation":
    - button "MORE"
    - button "PABLO AI"
    - button "CALLL HOME"
    - button "APP DOWNLOAD"
- heading "Welcome back to SALARYMAN" [level=1]
- paragraph: Sign in to continue
- button "Sign in with Google Continue with Google": Continue with Google
- paragraph: or
- text: Email address
- textbox "Email address":
  - /placeholder: Enter your email address
- button "Continue":
  - text: Continue
  - img
- text: Don’t have an account?
- link "Sign up":
  - /url: https://4cd4455d-8664-45df-88b0-61c0445e96ff-00-1ddsloe07rpc5.kirk.replit.dev/sign-up#/?return_to=%2Fprofile
- paragraph: Development mode
- region "Notifications (F8)":
  - list
```

# Test source

```ts
  1  | /**
  2  |  * E2E: protected profile access stays behind the Clerk/security boundary.
  3  |  *
  4  |  * Detailed LABOR RECORD rendering is covered by Profile.labor-record.test.tsx.
  5  |  * This browser check verifies that an anonymous browser cannot reach that
  6  |  * surface by guessing /profile.
  7  |  */
  8  | 
  9  | import { test, expect } from "@playwright/test";
  10 | 
  11 | test("anonymous /profile access returns to the public Pablo front door", async ({ page }) => {
  12 |   await page.goto("/profile");
  13 | 
> 14 |   await expect(page).toHaveURL(/\/pablo(?:$|[?#])/);
     |                      ^ Error: expect(page).toHaveURL(expected) failed
  15 |   await expect(page.getByRole("textbox", { name: "Type a message…" })).toBeVisible();
  16 |   await expect(page.getByText("LABOR RECORD", { exact: false })).not.toBeAttached();
  17 | });
```