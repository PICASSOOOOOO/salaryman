# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: immigration.city-picker.spec.ts >> Legacy immigration route >> hands the legacy route to the desktop client surface
- Location: e2e/immigration.city-picker.spec.ts:12:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/desktop(?:$|[?#])/
Received string:  "https://4cd4455d-8664-45df-88b0-61c0445e96ff-00-1ddsloe07rpc5.kirk.replit.dev/immigration"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    14 × unexpected value "https://4cd4455d-8664-45df-88b0-61c0445e96ff-00-1ddsloe07rpc5.kirk.replit.dev/immigration"

```

```yaml
- region "Notifications (F8)":
  - list
```

# Test source

```ts
  1  | /**
  2  |  * E2E: retired browser onboarding routes hand off to the native client.
  3  |  *
  4  |  * Immigration used to expose the browser city-picker. The current product
  5  |  * contract starts onboarding through the desktop client, so the legacy route
  6  |  * must not render a partial intake or leave a dead end on small screens.
  7  |  */
  8  | 
  9  | import { test, expect } from "@playwright/test";
  10 | 
  11 | test.describe("Legacy immigration route", () => {
  12 |   test("hands the legacy route to the desktop client surface", async ({ page }) => {
  13 |     await page.goto("/immigration");
  14 | 
> 15 |     await expect(page).toHaveURL(/\/desktop(?:$|[?#])/);
     |                        ^ Error: expect(page).toHaveURL(expected) failed
  16 |     await expect(
  17 |       page.getByRole("heading", { name: "Run the office where you work." }),
  18 |     ).toBeVisible();
  19 |     await expect(page.getByRole("link", { name: "Connect a desktop" })).toBeVisible();
  20 |     await expect(page.getByTestId("audio-control-toggle")).not.toBeAttached();
  21 |   });
  22 | });
```