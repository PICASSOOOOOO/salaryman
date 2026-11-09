---
name: 1999 machine ecosystem
description: User wants a balanced, expandable machine lineup beyond the FM-1.
---

The user sees SALARYMAN as a work platform for unemployed people, job seekers, creatives, and business founders. Creative workstations should be available in both the browser and game; 1999 is the music station alongside film/editing and image-editing stations.

The 1999 workstation should support Akai MPC, Korg, Boss, Roland SP-404MKII, Teenage Engineering OP-1, and similar machines, with their sounds. Switching machines should change the panel and sound engine while keeping one shared recording/programming workflow across plugin and non-plugin versions; live recording should follow OP-1-style workflows. In SALARYMAN, machine-specific rendered workstations should be purchasable and usable as desks in office studios.

**Why:** the user wants a shared creative-work system that can support paid work, practice, and business creation in and out of the game, with machine-specific workstation desks usable in in-game studios.

**How to apply:** make 1999 the first station on a reusable browser/game creative-workstation foundation, with shared project and asset ownership but station-specific editors. Keep machine support modular and resource-aware: each model gets an engine adapter behind one shared recorder, sequencer, transport, and project-state layer. Connect game furniture ownership/placement to the selected 1999 machine without claiming a visual prop is an emulator. Clearly distinguish hardware-firmware emulation from original recreations, sample-based instruments, and companion plugins; one model's support does not represent an entire brand.

For browser-to-VST3 use, route sequencer notes through a user-selected Web MIDI output to a desktop DAW; the browser does not load native VST3 binaries. Persist 1999-owned engine controls and emulator firmware selection, but do not claim to save a third-party emulator's internal patch when its cross-origin frame exposes no session API. Keep MIDI device selection local to the browser/device rather than in the shared project.

**Why:** Browser projects cannot load native VST3 modules, while the embedded FM-1/SMK-37 emulator does not expose its private patch/session state to the parent page.

**How to apply:** Use explicit MIDI permission and output selection for live routing; keep project-owned tone/decay and firmware-choice data in Vault, and label the emulator patch-state boundary clearly.
