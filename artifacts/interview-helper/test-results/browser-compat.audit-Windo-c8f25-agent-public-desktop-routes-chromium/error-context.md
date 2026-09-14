# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: browser-compat.audit.spec.ts >> Windows Edge user agent public desktop routes
- Location: e2e/browser-compat.audit.spec.ts:23:3

# Error details

```
Error: {"browser":"Windows Edge user agent","errors":["console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()"],"failedResponses":[]}
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - button "SALARYMAN home" [ref=e6]:
        - generic [ref=e7]: SALARYMAN
        - generic [ref=e8]: ALPHA v.24.0.2495
      - navigation "Main navigation" [ref=e9]:
        - button "MORE" [ref=e11]:
          - img [ref=e12]
          - text: MORE
          - img [ref=e13]
        - button "PABLO AI" [ref=e15]:
          - img [ref=e16]
          - text: PABLO AI
        - button "CALLL HOME" [ref=e19]
        - button "APP DOWNLOAD" [ref=e20]:
          - img [ref=e21]
          - text: APP DOWNLOAD
  - main [ref=e25]:
    - generic [ref=e26]:
      - generic [ref=e27]:
        - paragraph [ref=e28]: NATIVE 2.5D OFFICE / WINDOWS · MACOS · LINUX
        - heading "Your remote team. In the room." [level=1] [ref=e29]:
          - text: Your remote team.
          - emphasis [ref=e30]: In the room.
        - paragraph [ref=e31]: Move through a shared office, communicate with remote teammates interactively, and keep the work connected without living inside browser tabs.
        - button "Desktop downloads" [ref=e33] [cursor=pointer]:
          - img [ref=e34]
          - text: Desktop downloads
          - img [ref=e37]
        - paragraph [ref=e39]: Desktop alpha · approved testers
      - figure "36-SECOND FAST CUT / LIVE GAMEPLAY / CALL HOME SOUNDTRACK" [ref=e40]:
        - generic "Current SALARYMAN desktop client preview" [ref=e41]
        - generic: DESKTOP PROMO
        - generic [ref=e42]: 36-SECOND FAST CUT / LIVE GAMEPLAY / CALL HOME SOUNDTRACK
    - region "Not another chat window. A shared place to work." [ref=e43]:
      - generic [ref=e44]:
        - paragraph [ref=e45]: REMOTE WORK SHOULD FEEL PRESENT
        - heading "Not another chat window. A shared place to work." [level=2] [ref=e46]:
          - text: Not another chat window.
          - text: A shared place to work.
        - paragraph [ref=e47]: The web workspace organizes the business. The desktop client turns your remote team into an interactive office you can move through, communicate inside, and return to each day.
      - generic [ref=e48]:
        - figure "01 MOVE TOGETHER Navigate the same 2.5D office instead of disappearing into separate tabs." [ref=e49]:
          - generic "SALARYMAN shared office desktop preview" [ref=e50]
          - generic [ref=e51]:
            - generic [ref=e52]: "01"
            - strong [ref=e53]: MOVE TOGETHER
            - generic [ref=e54]: Navigate the same 2.5D office instead of disappearing into separate tabs.
        - article [ref=e55]:
          - generic [ref=e56]: LIVE TEAM SIGNAL
          - strong [ref=e57]:
            - text: SEE WHO IS THERE.
            - text: TALK WHERE THE WORK HAPPENS.
          - paragraph [ref=e58]: Presence, communication, and the office environment become one continuous team experience.
          - generic [ref=e59]:
            - generic [ref=e60]: YOU
            - generic [ref=e62]: TEAM
            - generic [ref=e64]: PABLO
    - region "The web runs the company. Desktop brings the team to life." [ref=e65]:
      - generic [ref=e66]:
        - paragraph [ref=e67]: WHY DESKTOP
        - heading "The web runs the company. Desktop brings the team to life." [level=2] [ref=e68]:
          - text: The web runs the company.
          - text: Desktop brings the team to life.
      - generic [ref=e69]:
        - article [ref=e70]:
          - text: WEB WORKSPACE
          - heading "Operate the business." [level=3] [ref=e71]
          - paragraph [ref=e72]: Manage customers, calls, files, settings, and structured workflows from any browser.
          - link "START WORK" [ref=e73] [cursor=pointer]:
            - /url: /business
            - text: START WORK
            - img [ref=e74]
        - article [ref=e76]:
          - text: 2.5D DESKTOP CLIENT
          - heading "Operate as a team." [level=3] [ref=e77]
          - paragraph [ref=e78]: Share an interactive office with remote teammates, communicate in context, and experience the company as a place—not a stack of pages.
          - button "CHOOSE YOUR BUILD" [ref=e79] [cursor=pointer]:
            - text: CHOOSE YOUR BUILD
            - img [ref=e80]
    - region "Every main feature. One connected company." [ref=e82]:
      - generic [ref=e83]:
        - paragraph [ref=e84]: THE WHOLE SALARYMAN SYSTEM
        - heading "Every main feature. One connected company." [level=2] [ref=e85]:
          - text: Every main feature.
          - text: One connected company.
        - paragraph [ref=e86]: Start in the browser, continue through the interactive desktop office, and keep the same business systems within reach.
      - generic [ref=e87]:
        - link "01 PABLO PRIME / PABLO AI Plan, decide, and move work forward with one assistant. OPEN" [ref=e88] [cursor=pointer]:
          - /url: /pablo
          - generic [ref=e89]: "01"
          - img [ref=e90]
          - heading "PABLO PRIME / PABLO AI" [level=3] [ref=e93]
          - paragraph [ref=e94]: Plan, decide, and move work forward with one assistant.
          - generic [ref=e95]:
            - text: OPEN
            - img [ref=e96]
        - link "02 CALLL HOME Calls, shared numbers, routing, and remote conversations. OPEN" [ref=e98] [cursor=pointer]:
          - /url: /phone
          - generic [ref=e99]: "02"
          - heading "CALLL HOME" [level=3] [ref=e100]
          - paragraph [ref=e101]: Calls, shared numbers, routing, and remote conversations.
          - generic [ref=e102]:
            - text: OPEN
            - img [ref=e103]
        - link "03 CRM & SALES Keep customers, leads, and every relationship moving. OPEN" [ref=e105] [cursor=pointer]:
          - /url: /business/contacts
          - generic [ref=e106]: "03"
          - img [ref=e107]
          - heading "CRM & SALES" [level=3] [ref=e112]
          - paragraph [ref=e113]: Keep customers, leads, and every relationship moving.
          - generic [ref=e114]:
            - text: OPEN
            - img [ref=e115]
        - link "04 AGENTS Put repeatable work into motion with automation. OPEN" [ref=e117] [cursor=pointer]:
          - /url: /bots
          - generic [ref=e118]: "04"
          - img [ref=e119]
          - heading "AGENTS" [level=3] [ref=e122]
          - paragraph [ref=e123]: Put repeatable work into motion with automation.
          - generic [ref=e124]:
            - text: OPEN
            - img [ref=e125]
        - link "05 BUSINESS Run daily operations, teams, and company workflows. OPEN" [ref=e127] [cursor=pointer]:
          - /url: /business
          - generic [ref=e128]: "05"
          - img [ref=e129]
          - heading "BUSINESS" [level=3] [ref=e133]
          - paragraph [ref=e134]: Run daily operations, teams, and company workflows.
          - generic [ref=e135]:
            - text: OPEN
            - img [ref=e136]
        - link "06 KNOWLEDGE Keep working files and company context in one place. OPEN" [ref=e138] [cursor=pointer]:
          - /url: /console/vault
          - generic [ref=e139]: "06"
          - img [ref=e140]
          - heading "KNOWLEDGE" [level=3] [ref=e143]
          - paragraph [ref=e144]: Keep working files and company context in one place.
          - generic [ref=e145]:
            - text: OPEN
            - img [ref=e146]
        - link "07 ECONOMY See the financial systems connected to the company. OPEN" [ref=e148] [cursor=pointer]:
          - /url: /business/accounts
          - generic [ref=e149]: "07"
          - img [ref=e150]
          - heading "ECONOMY" [level=3] [ref=e153]
          - paragraph [ref=e154]: See the financial systems connected to the company.
          - generic [ref=e155]:
            - text: OPEN
            - img [ref=e156]
        - link "08 SETTINGS Control identity, devices, audio, and desktop preferences. OPEN" [ref=e158] [cursor=pointer]:
          - /url: /settings
          - generic [ref=e159]: "08"
          - img [ref=e160]
          - heading "SETTINGS" [level=3] [ref=e163]
          - paragraph [ref=e164]: Control identity, devices, audio, and desktop preferences.
          - generic [ref=e165]:
            - text: OPEN
            - img [ref=e166]
    - generic [ref=e168]:
      - generic [ref=e169]:
        - paragraph [ref=e170]: THE OFFICE IS OPEN
        - heading "Bring your remote team inside." [level=2] [ref=e171]
      - button "DESKTOP DOWNLOADS" [ref=e172] [cursor=pointer]:
        - img [ref=e173]
        - text: DESKTOP DOWNLOADS
        - img [ref=e176]
    - generic [ref=e178]:
      - generic [ref=e179]: SALARYMAN / PICASSO AI LLC
      - link "BACK TO SALARYMAN" [ref=e180] [cursor=pointer]:
        - /url: /
  - region "Notifications (F8)":
    - list
```

# Test source

```ts
  1  | import { test } from "@playwright/test";
  2  | 
  3  | const browserCases = [
  4  |   {
  5  |     name: "macOS Safari user agent",
  6  |     userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  7  |   },
  8  |   {
  9  |     name: "macOS Chrome user agent",
  10 |     userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  11 |   },
  12 |   {
  13 |     name: "Windows Edge user agent",
  14 |     userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  15 |   },
  16 |   {
  17 |     name: "Windows Chrome user agent",
  18 |     userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  19 |   },
  20 | ] as const;
  21 | 
  22 | for (const browserCase of browserCases) {
  23 |   test(`${browserCase.name} public desktop routes`, async ({ browser }) => {
  24 |     const context = await browser.newContext({
  25 |       userAgent: browserCase.userAgent,
  26 |       viewport: { width: 1440, height: 900 },
  27 |       locale: "en-US",
  28 |     });
  29 |     const page = await context.newPage();
  30 |     const errors: string[] = [];
  31 |     const failedResponses: string[] = [];
  32 |     page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  33 |     page.on("console", (message) => {
  34 |       if (message.type() === "error") errors.push(`console: ${message.text()}`);
  35 |     });
  36 |     page.on("response", (response) => {
  37 |       if (response.status() >= 500) failedResponses.push(`${response.status()} ${response.url()}`);
  38 |     });
  39 | 
  40 |     const routes = ["/", "/desktop", "/pablo", "/phone", "/legal", "/business/accounts"];
  41 |     for (const route of routes) {
  42 |       await page.goto(route, { waitUntil: "domcontentloaded" });
  43 |       await page.waitForTimeout(350);
  44 |       const text = await page.locator("body").innerText();
  45 |       const finalPath = new URL(page.url()).pathname;
  46 |       console.log(JSON.stringify({ browser: browserCase.name, route, finalPath, title: await page.title(), hasNotFound: /page not found|not found/i.test(text) }));
  47 |     }
  48 | 
  49 |     await page.goto("/desktop", { waitUntil: "domcontentloaded" });
  50 |     await page.waitForTimeout(350);
  51 |     const hrefs = await page.locator("a").evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).getAttribute("href")));
  52 |     if (!hrefs.includes("/business/accounts")) errors.push("desktop feature links do not include /business/accounts");
  53 |     if (errors.length || failedResponses.length) {
> 54 |       throw new Error(JSON.stringify({ browser: browserCase.name, errors, failedResponses }));
     |             ^ Error: {"browser":"Windows Edge user agent","errors":["console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: net::ERR_FAILED","console: Failed to load resource: the server responded with a status of 401 ()","console: Failed to load resource: the server responded with a status of 401 ()"],"failedResponses":[]}
  55 |     }
  56 |     await context.close();
  57 |   });
  58 | }
  59 | 
```