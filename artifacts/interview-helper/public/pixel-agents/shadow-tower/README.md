# Shadow Tower Office Kit

Game-ready transparent PNG assets for the playable Shadow Tower office floor.
The visual language is worn 1980s corporate-surveillance hardware: amber CRTs,
physical switches, wired phones, paper output, brushed metal, fluorescent panels,
and repaired industrial finishes.

## Rules

- `public-terminal.png` is wall-mounted beside the elevator. It is never placed on a desk.
- `desk-terminal.png` is the separate private owner terminal inside the executive office.
- `directory.png` displays live company/floor data supplied by the app; the image itself intentionally contains no readable company names.
- `secretary.png` is the visual base for a uniquely named secretary NPC on each floor.
- Collision and placement dimensions are defined in `asset-manifest.json`.
- Every visible asset must be connected to matching collision and interaction behavior before appearing on a playable floor.
- `spaces/` contains the physical-space environment plates. `tower-space-art.ts`
  resolves every playable floor to one of these art families while the shared
  floor plan remains authoritative for collision and interactions.
- Keep the game UI modern and readable; the retro language belongs to the physical
  office objects, not to scanline overlays, flicker, or phosphor effects on the UI.