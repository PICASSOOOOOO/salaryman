---
name: Twilio toll-free resubmission
description: How to correct rejected Twilio toll-free SMS verification records and prepare opt-in evidence
---

Use `editExpiration` as well as `editAllowed` when correcting a rejected toll-free verification. Twilio's edit window is seven days. Once it expires, the request loses priority; if the API no longer allows editing, submit corrected information as a new verification and preserve the rejected record.

Before submission, verify that the business website resolves and is publicly reachable, policy URLs are separately accessible, `optInImageUrls` points to a public image (not the HTML page), and the `optInType` matches the real consent action. For text-keyword opt-in, the keyword and public example should both show the SMS-based flow.

Check DNS for the exact submitted hostname: `www.salaryman.io` did not resolve while `salaryman.io` did. The existing submission also used the HTML opt-in route as its image evidence, which Twilio rejected.

**Why:** Twilio's 30437 guidance says an expired edit window requires a standard-queue resubmission, and invalid website or incomplete opt-in evidence can independently reject the registration.

**How to apply:** Fetch the current record, compare the current time to `editExpiration`, and select update versus new-request flow before writing. Keep existing business details intact and do not delete the old record merely to replace it.
