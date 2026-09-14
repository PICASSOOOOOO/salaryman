# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tower.authenticated-reception.spec.ts >> authenticated Tower bookmarks use the desktop client handoff
- Location: e2e/tower.authenticated-reception.spec.ts:12:1

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/desktop(?:$|[?#])/
Received string:  "https://4cd4455d-8664-45df-88b0-61c0445e96ff-00-1ddsloe07rpc5.kirk.replit.dev/immigration"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    5 × unexpected value "https://4cd4455d-8664-45df-88b0-61c0445e96ff-00-1ddsloe07rpc5.kirk.replit.dev/tower"
    9 × unexpected value "https://4cd4455d-8664-45df-88b0-61c0445e96ff-00-1ddsloe07rpc5.kirk.replit.dev/immigration"

```

```yaml
- region "Notifications (F8)":
  - list
```

# Test source

```ts
  1  | /**
  2  |  * E2E: the browser no longer hosts the authenticated Tower lobby.
  3  |  *
  4  |  * Gameplay bookmarks intentionally share the same native-client handoff for
  5  |  * signed-in and signed-out visitors. Authenticated Tower reception remains
  6  |  * native-client territory; this check prevents the retired React lobby from
  7  |  * quietly returning.
  8  |  */
  9  | 
  10 | import { test, expect } from "@playwright/test";
  11 | 
  12 | test("authenticated Tower bookmarks use the desktop client handoff", async ({ page }) => {
  13 |   await page.goto("/tower");
  14 | 
> 15 |   await expect(page).toHaveURL(/\/desktop(?:$|[?#])/);
     |                      ^ Error: expect(page).toHaveURL(expected) failed
  16 |   await expect(
  17 |     page.getByRole("heading", { name: "Run the office where you work." }),
  18 |   ).toBeVisible();
  19 |   await expect(page.getByTestId("lobby-map")).not.toBeAttached();
  20 | });
```