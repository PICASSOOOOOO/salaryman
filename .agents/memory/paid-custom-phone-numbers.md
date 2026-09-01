---
name: Paid custom phone numbers
description: Durable billing and routing boundaries for SALARYMAN custom Twilio numbers.
---

Custom Twilio numbers cost $10 one-time and require both the separate $95/month Phone System entitlement and authorization to use the shared platform Twilio account. Browser/API requests may search inventory and create Stripe Checkout, but only a settled Stripe webhook may provision and assign a number.

**Why:** Direct provisioning before confirmed payment creates unpaid carrier costs, and duplicate webhook delivery can otherwise assign or buy a number more than once.

**How to apply:** Reserve each requested number before creating Checkout so two payable sessions cannot overlap, and release reservations on expiration/payment failure. Keep a durable per-Checkout fulfillment record; at fulfillment, re-check both current entitlement and platform-Twilio authorization. Re-check Twilio availability and never adopt an existing account number. Retry recovery may use only the exact Twilio SID already bound to that same checkout. Explicitly exclude the platform default number from purchase/release. Enforce platform-Twilio authorization inside shared send services, not only routes. Configure voice/SMS/status callbacks before persisting ownership. All outbound voice and SMS choose the user's active custom number first and fall back to the platform toll-free number.

Inbound SMS ownership must come from the dialed custom number. For the shared default DID, route a reply only when recent outbound history for the sender number identifies exactly one user; ambiguity must produce no persistence and no auto-reply.

Every outbound SMS path, including test and bulk campaign sends, must use the shared telephony service so the conversation/message history required for secure default-DID reply routing always exists.

Fulfillment claims are leased, not permanent: a retry immediately resumes when the checkout already has a bound Twilio SID, and may reclaim a SID-less processing claim only after its lease expires. Twilio acquisitions carry a stable checkout-hash marker so the create-before-SID-persist crash window can reconcile only that checkout's DID; unrelated account numbers remain non-adoptable.