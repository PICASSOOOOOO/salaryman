---
name: 1999 machine ecosystem
description: User wants a balanced, expandable machine lineup beyond the FM-1.
---

The user sees SALARYMAN as a work platform for unemployed people, job seekers, creatives, and business founders. Creative workstations should be available in both the browser and game; 1999 is the music station alongside film/editing and image-editing stations.

The 1999 workstation should support Akai MPC, Korg, Boss, Roland SP-404MKII, Teenage Engineering OP-1, and similar machines, with their sounds. Switching machines should change the panel and sound engine while keeping one shared recording/programming workflow across plugin and non-plugin versions; live recording should follow OP-1-style workflows. In SALARYMAN, machine-specific rendered workstations should be purchasable and usable as desks in office studios.

1999 is a free app within SALARYMAN. Keep it inside SALARYMAN; do not create a separate 1999 homepage or sales page. SALARYMAN's existing main homepage remains the only product homepage.

**Why:** the user explicitly clarified the product structure and that 1999 is free, not a standalone product to sell.

**How to apply:** treat 1999 as an in-app creative workstation. Do not add standalone marketing, pricing, or sales surfaces for it.

Keep 1999 interfaces stripped and tool-focused: show controls, short labels, status, and required source/license attribution without explanatory copy.

**Why:** the user explicitly asked for 1999 to focus on tools without explanation.

**How to apply:** remove promotional, tutorial, and descriptive paragraphs from 1999 workspace surfaces; retain only concise operational feedback and required attribution.

1999 uses a black background. Keep the machine view primary, place machine/firmware selection discreetly, and use the side panel for the sequencer, recording, and mixing DAW. Use the legacy `1999` logo only.

**Why:** the user explicitly requested a black 1999 interface, machine-focused layout, looper-style recording, and the old logo with no added wording.

**How to apply:** build the visual hierarchy around playable machine controls and an arrangement-focused DAW; keep SALARYMAN branding and other labels out of the 1999 wordmark.

**Why:** the user wants a shared creative-work system that can support paid work, practice, and business creation in and out of the game, with machine-specific workstation desks usable in in-game studios.

**How to apply:** make 1999 the first station on a reusable browser/game creative-workstation foundation, with shared project and asset ownership but station-specific editors. Keep machine support modular and resource-aware: each model gets an engine adapter behind one shared recorder, sequencer, transport, and project-state layer. Connect game furniture ownership/placement to the selected 1999 machine without claiming a visual prop is an emulator. Clearly distinguish hardware-firmware emulation from original recreations, sample-based instruments, and companion plugins; one model's support does not represent an entire brand.

The user wants 1999 to cover recent and classic synths and rhythm machines, including plugins and emulators found on GitHub, and wants machine furniture split into individually placeable pieces. Keep a modular registry that labels each machine as a native browser engine, firmware emulator, external DAW plugin, or companion device, with its source license and firmware/sample requirements. Do not bundle GPL code, manufacturer firmware, ROMs, or samples without checking redistribution rights. For FM-1/SMK-37, project patch state is a user-attached `.fm1save` backup with explicit export/import, not live cross-origin synchronization. For browser-to-VST3 use, route notes through a user-selected Web MIDI output; the browser does not load native VST3 binaries, and MIDI device selection stays local to the browser/device.

**Why:** The user wants a broad, modular instrument and furniture ecosystem. Open-source engines, vendor firmware, and factory sounds have different license boundaries, and browser projects cannot load native VST3 modules or read private state from a cross-origin emulator.

**How to apply:** Use explicit MIDI permission and output selection for live routing; keep project-owned controls, firmware choice, and owner-private patch-file references in Vault. Make each game workstation component separately placeable and connect it to the same machine registry.
