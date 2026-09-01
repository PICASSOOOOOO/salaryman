---
name: SALARYMAN receptionist-first onboarding
description: First-time registration, housing, and the lockdown finale all happen inside the Shadow Tower lobby.
---

New authenticated players enter a visual Shadow Tower lobby sequence immediately after
the Pablo nebula: fade in, wait behind one rendered NPC, then automatically meet reception.
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