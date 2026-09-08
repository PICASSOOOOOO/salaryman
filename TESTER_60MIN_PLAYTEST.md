# SALARYMAN — 60-MINUTE TESTER PLAY-TEST SCRIPT

**Goal:** In one hour, touch every major system once, on purpose, and report anything that
breaks, confuses, or feels wrong. Don't speed-run — play like a real new arrival, but keep
moving through the blocks so we cover everything.

**Before you start:**
- Use a desktop browser for the main run. If you can, repeat Blocks 1–3 on your phone afterward.
- Keep this page open in a second tab so you can tick the checklist.
- When ANYTHING goes wrong, stop and report it on the spot (see **HOW TO REPORT** at the bottom),
  then continue.
- Note the time on your clock when a bug happens — it helps us match logs.

**What we care about most (tag every report with one):**
- 🔴 **BLOCKER** — can't continue, hard crash, stuck screen, lost progress.
- 🟠 **BROKEN** — feature doesn't do what it says, wrong data, visual glitch that hurts use.
- 🟡 **CONFUSING** — you didn't know what to do next, label unclear, felt slow/janky.
- 🟢 **POLISH** — minor visual/copy nit, "would be nice".

---

## BLOCK 0 — SETUP & FIRST IMPRESSION (0:00–0:02)
1. Open the game with a FRESH account (or ask us for a clean test login).
2. Log in.
3. **Report:** How long until something interactive appeared? Anything blank, flashing, or broken on first load?

---

## BLOCK 1 — IMMIGRATION / ONBOARDING (0:02–0:12)
You should land in the **wake-up** scene ("late for work").
1. Click **CLOCK IN**.
2. In Pablo's **intake**, fill in: Name, Contact Email, choose **Business** (so you get a company),
   pick an Industry, pick an Office Tier.
3. On the **stamping** screen, read the fees, then click **ENTER CITY ▸**.
4. Watch the intro cinematic. Follow the tutorial prompt: walk to the computer and press **E** to enter the terminal.
5. Let it carry you through to your **office**.

**Verify / Report:**
- Did every step accept your input and advance? Try leaving a required field blank — does it warn you clearly?
- Did the fees/numbers make sense?
- 🟡 Was it ever unclear what to click or where to go next?
- 🔴 Did onboarding ever loop, freeze, or dump you somewhere unexpected?

---

## BLOCK 2 — OFFICE & PABLO (0:12–0:20)
1. You're now in **MY OFFICE**. Confirm the nav tab shows **your company name** (not the generic label).
2. Talk to **Pablo** (the PABLO tab / your assistant). Ask him 2–3 things — a normal question and a weird one.
3. Test voice if offered: does Pablo **speak** the reply out loud? Try once with voice mode and once with plain text.
4. Open a few **MORE ▾** menu items quickly (CONSOLE, INTEL, MARKETING) and come back.

**Verify / Report:**
- 🟠 Does Pablo reply in a reasonable time? Any errors, blank replies, or replies with no sound when sound was expected?
- Do the dropdown menus open ON TOP of everything (not hidden behind panels)?
- Does your office actually reflect the tier/choices you made?

---

## BLOCK 3 — THE CITY / WORLD (0:20–0:32)
1. Enter the city world (walk out / use the world entry). Move with **WASD**, hold **Shift** to run.
2. Walk to the edge of the safe zone until you hit the **gas/fog**. Confirm it warns/affects you, then retreat to safety.
3. Find an **escort / hazmat** option and use it to cross gas (if available).
4. Use the **subway / manhole** to fast-travel somewhere, then come back.
5. Enter at least **2 building interiors** (e.g., the **Bank**, the **Arcade**). Walk in, look around, walk out.

**Verify / Report:**
- 🔴 Does movement feel responsive, or does it stutter/teleport/stick?
- Does the gas actually hurt/drain you and recover when safe? Did you ever get stuck or "die" unexpectedly?
- Do doors, subway, and interiors load correctly (no blank rooms, no trapped-inside)?
- 🟡 Was it clear where you were allowed to go vs. not?

---

## BLOCK 4 — STORY MODE: SCENE 1 (0:32–0:42)
1. Go to the central plaza and find the **MX-75 UPLINK BEACON**. Press **E** to **Make Contact** / start the story.
   (You need a job or business to be eligible — you chose Business in Block 1, so you're good.)
2. Play **Scene 1 ("AND IT ALL FALLS DOWN")**: the Shadow Tower escape cinematic, then
   make your way to the **BACK ALLEY**, then to the **UNDERGROUND CAMP**.
3. **Claim** the reward at the camp — you should receive the **MX-75 device** and meet **Mila**.

**Verify / Report:**
- 🔴 Did the story start, run, and finish without getting stuck? Try **reloading the page mid-scene** — does it resume correctly, or lose your place?
- Did the cinematics play and end cleanly (no stuck black screen)?
- After the scene, did your assistant hand off **Pablo → Mila** as promised, and is Mila usable?

---

## BLOCK 5 — BUSINESS / ORG & BANKING (0:42–0:50)
1. Open **BUSINESS** (the Business Hub). Confirm you have **one** company and you can't accidentally create duplicates.
2. Poke the management tabs: **TEAM**, **HIRING**, **PAYROLL**. Open each once.
3. Go to the **BANK (Banco Ombra)**. Use an **ATM** to **deposit** and **withdraw**. Check your ƒ (Florins) / Gold update correctly.
4. If you see a loan / debt option, read it (don't feel obligated to take on debt — just confirm the numbers are sensible).

**Verify / Report:**
- 🟠 Do balances change correctly after deposit/withdraw? Any wrong totals or money appearing/vanishing?
- Could you create a SECOND company? (You shouldn't be able to — report if you can.)
- Did the management tabs load real data?

---

## BLOCK 6 — COMMS, PHONE & PAYWALL (0:50–0:57)
1. Open **COMMS** (`MORE ▾ → COMMS`). Send a message in **Global**, and start a **private/DM** thread if you can.
2. **IMPORTANT (the thing we just fixed):** When you have an unread COMMS badge, **open the chat** —
   confirm the **badge clears** once you've seen it and **stays cleared** (doesn't pop back on its own).
3. Try the **PHONE** (dialer). As a free user you should be sent to **UPGRADE / PRICING**.
   Confirm the paywall appears AND that you can **back out / decline** (it should send you home, not trap you).

**Verify / Report:**
- 🟠 Does the COMMS unread badge clear after you read messages and stay cleared?
- Does the paywall always give you a way OUT? 🔴 Report if any pay screen traps you with no escape.
- Any chat messages that don't send, duplicate, or arrive out of order?

---

## BLOCK 7 — WRAP-UP & BUG REPORT (0:57–1:00)
1. Reload the whole game one last time. Confirm you land back in your **office** with your progress intact.
2. File a short **overall impressions** note (see below): biggest highlight, biggest frustration, would-you-keep-playing.

---

## HOW TO REPORT (use this throughout, not just at the end)
- Click the **Bug icon / "Report an issue"** in the top strip to file a **bug** (these go straight to the dev queue).
- Use the **"Feedback"** link for general notes/ideas.
- For every report, include:
  1. **Tag**: 🔴 / 🟠 / 🟡 / 🟢
  2. **Where**: which block + screen/route (e.g., "Block 3 — city world").
  3. **What you did** → **what you expected** → **what actually happened**.
  4. **Time on your clock** + desktop or mobile.
  5. A screenshot if you can.

---

## QUICK CHECKLIST (tick as you go)
- [ ] Logged in fresh
- [ ] Finished immigration → reached office
- [ ] Office shows my company name
- [ ] Talked to Pablo (text + voice)
- [ ] Dropdown menus overlay correctly
- [ ] Moved around the city (run, gas, escort)
- [ ] Used subway + entered 2 interiors
- [ ] Started + finished Story Scene 1
- [ ] Reload-mid-scene resumed correctly
- [ ] Got MX-75 + met Mila
- [ ] Checked Business hub (no duplicate company)
- [ ] TEAM / HIRING / PAYROLL opened
- [ ] Bank deposit + withdraw worked
- [ ] COMMS message sent (global + DM)
- [ ] COMMS unread badge cleared and stayed cleared
- [ ] Phone paywall appeared AND let me back out
- [ ] Final reload kept my progress
- [ ] Filed overall impressions
