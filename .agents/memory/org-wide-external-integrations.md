---
name: Organization-wide external integrations
description: Product scope for outside apps that sync SALARYMAN organization data across browser and game clients.
---

An outside app must be authorized by the organization owner and receive organization-scoped, bidirectional access to the organization's data across SALARYMAN browser and game clients. People coming from the outside app join through an invitation to create or link a verified SALARYMAN account; invited members can have game characters.

**Why:** The user wants SALARYMAN to connect to other apps they have built, with shared organization data and members represented in the game.

**How to apply:** Authorize each external app for an organization, keep both clients on shared server-authoritative data, and route external users through verified account invitation and membership acceptance rather than app-created credentials.

The STEC counterpart currently has no API or app. Build only the provider-independent connector foundation until its real API contract exists; do not claim STEC data sync is connected or fabricate provider-specific operations.

**Why:** The user explicitly said STEC does not exist yet and both sides need to be connected before provider sync can work.

**How to apply:** Keep registration, organization approval, credential handling, and health checks generic. Add STEC-specific data routes only after the counterpart API and supported operations are available.
