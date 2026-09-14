# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tower.anonymous-entry.spec.ts >> anonymous /tower access lands on the desktop client surface
- Location: e2e/tower.anonymous-entry.spec.ts:7:1

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
  2  |  * E2E: legacy browser Tower bookmarks hand off to the native client.
  3  |  */
  4  | 
  5  | import { test, expect } from "@playwright/test";
  6  | 
  7  | test("anonymous /tower access lands on the desktop client surface", async ({ page }) => {
  8  |   await page.goto("/tower");
  9  | 
> 10 |   await expect(page).toHaveURL(/\/desktop(?:$|[?#])/);
     |                      ^ Error: expect(page).toHaveURL(expected) failed
  11 |   await expect(
  12 |     page.getByRole("heading", { name: "Run the office where you work." }),
  13 |   ).toBeVisible();
  14 |   await expect(page.getByTestId("tower-entry")).not.toBeAttached();
  15 |   await expect(page.getByTestId("lobby-map")).not.toBeAttached();
  16 | });
```