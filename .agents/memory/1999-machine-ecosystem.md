---
name: 1999 machine ecosystem
description: User wants a balanced, expandable machine lineup beyond the FM-1.
---

The user sees SALARYMAN as a work platform for unemployed people, job seekers, creatives, and business founders. Creative workstations should be available in both the browser and game; 1999 is the music station alongside film/editing and image-editing stations.

The 1999 workstation should support Akai MPC, Korg, Boss, Roland SP-404MKII, Teenage Engineering OP-1, and similar machines, with their sounds. Switching machines should change the panel and sound engine while keeping one shared recording/programming workflow across plugin and non-plugin versions; live recording should follow OP-1-style workflows. In SALARYMAN, machine-specific rendered workstations should be purchasable and usable as desks in office studios.

The in-game 1999 experience belongs on a large, dedicated 1999 furniture terminal, not a generic music-studio screen.

**Why:** the user clarified that 1999 should be a furniture fixture and “a massive terminal system just for 1999.”

**How to apply:** keep the in-game fixture and its interaction dedicated to 1999, while sharing the existing 1999 project and audio workspace where supported.

The first 1999 sampler/tape milestone keeps the eight-lane limit and current branding, pairs an MPC-style 16-pad sample/chop/sequence workflow with an OP-1-inspired tape display for recorded layers, and stores uploaded audio in private storage with project references. USB/MIDI device access and note mappings stay browser-local, not in project data or server requests. Broad server-side codec conversion and emulator research remain later milestones. Do not fetch or extract audio from YouTube or movie URLs.

**Why:** the user chose the sampler-and-tape core first, while explicitly deferring controller connectivity and emulator research; uploaded audio must remain user-provided rather than ripped from streaming or movie sources.

**How to apply:** keep project JSON compact by storing music-library IDs, and make WAV export include assigned pad patterns and recording layers. Clearly distinguish browser-supported upload codecs from later server-side conversion coverage.

1999 is free within SALARYMAN after sign-in or onboarding. Keep it inside SALARYMAN; do not create a separate 1999 homepage or sales page. SALARYMAN's existing main homepage remains the only product homepage.

**Why:** the user explicitly clarified the product structure and that browser 1999 is free after sign-in or onboarding, not a separate paid SALARYMAN product.

**How to apply:** treat browser 1999 as a free in-app creative workstation. Do not add standalone marketing, pricing, or sales surfaces for it; the standalone VST3 is a separate use target, not a SALARYMAN paywall.

The game version must include one very expensive, placeable 1999 terminal workstation for player-owned spaces, offices, apartments, and studios. It must open an in-game beat-making and recording station, not only send the player to the browser.

**Why:** the user requested a high-cost furniture item that lets players make beats and use a complete recording station inside their game spaces.

**How to apply:** connect the furniture purchase/placement flow to a playable in-game recording interface and shared 1999 project/preset concepts; preserve the high cost and avoid replacing it with a generic free terminal.

Keep 1999 interfaces stripped and tool-focused: show controls, short labels, status, and required source/license attribution without explanatory copy.

**Why:** the user explicitly asked for 1999 to focus on tools without explanation.

**How to apply:** remove promotional, tutorial, and descriptive paragraphs from 1999 workspace surfaces; retain only concise operational feedback and required attribution.

1999 uses a black background. Keep the machine view primary, place machine/firmware selection discreetly, and use the side panel for the sequencer, recording, and mixing DAW. Use only the legacy `1999` logo, in its original green at a restrained size.

**Why:** the user explicitly requested a black 1999 interface, machine-focused layout, looper-style recording, and the old logo with no added wording; they also prefer the original green and a smaller logo.

**How to apply:** build the visual hierarchy around playable machine controls and an arrangement-focused DAW; keep the 1999 wordmark small and green, with no SALARYMAN branding or added wording.

**Why:** the user wants a shared creative-work system that can support paid work, practice, and business creation in and out of the game, with machine-specific workstation desks usable in in-game studios.

**How to apply:** make 1999 the first station on a reusable browser/game creative-workstation foundation, with shared project and asset ownership but station-specific editors. Keep machine support modular and resource-aware: each model gets an engine adapter behind one shared recorder, sequencer, transport, and project-state layer. Connect game furniture ownership/placement to the selected 1999 machine without claiming a visual prop is an emulator. Clearly distinguish hardware-firmware emulation from original recreations, sample-based instruments, and companion plugins; one model's support does not represent an entire brand.

The user wants 1999 to cover recent and classic synths and rhythm machines, including plugins and emulators found on GitHub, and wants machine furniture split into individually placeable pieces. Keep a modular registry that labels each machine as a native browser engine, firmware emulator, external DAW plugin, or companion device, with its source license and firmware/sample requirements. Do not bundle GPL code, manufacturer firmware, ROMs, or samples without checking redistribution rights. For FM-1/SMK-37, project patch state is a user-attached `.fm1save` backup with explicit export/import, not live cross-origin synchronization. For browser-to-VST3 use, route notes through a user-selected Web MIDI output; the browser does not load native VST3 binaries, and MIDI device selection stays local to the browser/device.

**Why:** The user wants a broad, modular instrument and furniture ecosystem. Open-source engines, vendor firmware, and factory sounds have different license boundaries, and browser projects cannot load native VST3 modules or read private state from a cross-origin emulator.

**How to apply:** Use explicit MIDI permission and output selection for live routing; keep project-owned controls, firmware choice, and owner-private patch-file references in Vault. Make each game workstation component separately placeable and connect it to the same machine registry.

Recorded microphone loops must remain playable after a 1999 session is saved and reloaded, with their mixer settings intact.

**Why:** The user selected verification of saved-loop synchronization as a follow-up.

**How to apply:** Cover a saved recording lane through project serialization, reload, audio retrieval, and loop playback in regression tests.

Overdubbing is non-destructive: keep the original take, add new takes as layers on the same lane, and share that lane's mute and volume controls. Match each overdub's length and tempo to the base loop. Removing an overdub removes only its project reference; its music-library take stays intact, and the base take is not removable through overdub controls.

**Why:** The user asked to overdub into an existing loop; preserving the original avoids destructive replacement, matching capture timing prevents layered takes from drifting apart, and retaining removed audio files prevents loss outside the project.

**How to apply:** Retain each audio-library reference in project data, use the stored loop bars/BPM for later overdubs, and start all layers together for playback and export. To remove a layer, update only the project reference list; never delete the underlying library track. To restore a take, reuse its existing owned, object-backed music-library ID; do not create a second upload, and offer only audio whose stored whole-second duration matches the loop.

Recorded loops follow the session BPM through playback-rate adjustment in live playback and WAV export. This changes pitch along with speed; do not imply that the current implementation preserves pitch.

**Why:** A shared playback-rate ratio keeps overdubs aligned without rewriting user-owned audio, while browser-native buffer playback does not provide pitch-preserving time stretch.

**How to apply:** Derive the rate from current session BPM divided by the lane's captured BPM; keep legacy lanes with no captured BPM at their original speed, and apply the same policy to every lane layer and WAV duration.
