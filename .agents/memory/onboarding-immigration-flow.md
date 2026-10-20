---
name: SALARYMAN receptionist-first onboarding
description: First-time registration, housing, and the lockdown finale all happen inside the Shadow Tower lobby.
---

New players enter through the visual Shadow Tower lobby itself. There is no Pablo front
door in the onboarding funnel: fade in to a busy lobby, wait behind another rendered
visitor in the reception line, then automatically meet reception.
Reception is the onboarding authority and runs the full character and business intake in
lobby dialogue boxes. It assigns a free hostel bed on the player's chosen hostel floor and
free access to the Floor 2 Computer Cafe terminal.

**Why:** The intended first experience is being processed as a person inside the building,
not being sent straight into an immigration form. The first-time sequence ends with a loud
red-alert lockdown: the exterior doors seal and the player remains in the Tower until further
notice, with reception available for questions.

**How to apply:** Route uncleared authenticated players to Tower reception. Keep reception
visual. Do not mention visas or immigration anywhere in this sequence, and do not cut away
to another room for the intake. Keep the lobby visible beneath the character/business form,
housing choice, history briefing, and lockdown alert. Lobby people and interactable objects
should use rendered art assets rather than generic placeholder shapes where an asset exists.

The registration request made at reception must remain server-authoritative and create the
onboarding-complete row before setting the local tutorial flag. This keeps returning-device
hydration consistent.

Fresh-start reconciliation must fail closed: protected routes and lobby access stay held until
the server returns a successful, well-formed save list. Network, non-OK, or malformed responses
must never trust stale local completion flags or clear local state.

**Why:** Development/world resets can leave old browser onboarding flags behind; allowing those
flags through when the authoritative read fails lets a reset account bypass reception.

**How to apply:** Only a verified empty save list may clear local tutorial/building progress, and
only a verified save-list response may release protected-route or lobby reconciliation gates.

Everyone must register with reception before exploring beyond the lobby,
including people who are unemployed. Unregistered entrants are stopped by
security or kept out by locked doors; registration is a building-security gate,
not an employment requirement.

**Why:** the user wants all building access to begin with receptionist
registration for security purposes, regardless of employment status.

**How to apply:** enforce registration on access paths beyond the lobby. Use
security or locked doors to deny unregistered entry, with server-authoritative
checks rather than relying only on visible door state.