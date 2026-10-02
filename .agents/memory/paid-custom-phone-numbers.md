---
name: Paid custom phone numbers
description: Durable billing and routing boundaries for SALARYMAN custom Twilio numbers.
---

Custom Twilio numbers cost $10 one-time and require both the separate $95/month Phone System entitlement and authorization to use the shared platform Twilio account. Browser/API requests may search inventory and create Stripe Checkout, but only a settled Stripe webhook may provision and assign a number.

The product name is exactly “CALLL HOME”. Internal employee voice uses existing Twilio client identities; internal SMS uses an already assigned organization office line. Never provision another Twilio number just for employee communication, and changing an office-line assignee must not transfer purchase ownership.

**Why:** The user fixed the product name and wants employee communication without adding carrier numbers or changing who purchased an existing line.

**How to apply:** Route internal voice to eligible employee identities, route SMS through the existing telephony service, and keep organization line assignment separate from purchase records.

**Why:** Direct provisioning before confirmed payment creates unpaid carrier costs, and duplicate webhook delivery can otherwise assign or buy a number more than once.

**How to apply:** Reserve each requested number before creating Checkout so two payable sessions cannot overlap, and release reservations on expiration/payment failure. Keep a durable per-Checkout fulfillment record; at fulfillment, re-check both current entitlement and platform-Twilio authorization. Re-check Twilio availability and never adopt an existing account number. Retry recovery may use only the exact Twilio SID already bound to that same checkout. Explicitly exclude the platform default number from purchase/release. Configure voice/SMS/status callbacks before persisting ownership. Purchases attach to the buyer's active org and cost $10 one-time.

**Sender rule:** Active org/personal numbers are used first. The shared platform number is a test line only for owners/admins, approved alpha moderators, and designated platform orgs. Ordinary orgs without a number must fail with the $10 purchase requirement—never silently fall back.

Inbound SMS ownership must come from the dialed custom number. For the shared default DID, route a reply only when recent outbound history for the sender number identifies exactly one user; ambiguity must produce no persistence and no auto-reply.

Every outbound SMS path, including test and bulk campaign sends, must use the shared telephony service so the conversation/message history required for secure default-DID reply routing always exists.

Fulfillment claims are leased, not permanent: a retry immediately resumes when the checkout already has a bound Twilio SID, and may reclaim a SID-less processing claim only after its lease expires. Twilio acquisitions carry a stable checkout-hash marker so the create-before-SID-persist crash window can reconcile only that checkout's DID; unrelated account numbers remain non-adoptable.