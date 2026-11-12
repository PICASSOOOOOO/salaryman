# Engine index

## Art and asset development

| Engine | Source |
| --- | --- |
| Canonical style and art prompts | `src/server/lib/salaryman-art.ts` |
| Art-family matrix and review rules | `src/server/lib/art-families.ts` |
| AI art-direction briefs | `src/server/lib/art-direction.ts` |
| Output QA and technical validation | `src/server/lib/art-qa.ts` |
| Provider interface and registry | `src/server/lib/art-providers/` |
| Art polishing and background cleanup | `src/server/lib/art-polish.ts` |
| Nano Banana, fal, Blender, Unreal adapters | `src/server/lib/art-providers/` |
| Godot render bridge | `src/server/godot-render-bridge.ts` |
| Godot 4 art review project | `godot/art-dev/` |
| Unreal render node contract | `docs/unreal-render-node-contract.md` |
| Blender render client | `src/server/lib/blender-render.ts` |
| Asset recovery and retry behavior | `src/server/lib/art-self-heal.ts` when present in the source export |

## World and simulation

| Engine | Source |
| --- | --- |
| Slow physical condition states and repair scoring | `src/server/lib/world-condition.ts` |
| Authoritative world economy and jobs | `src/server/routes/gameplay-world-economy.ts` |
| World condition API surface | `src/server/routes/world.ts` |
| World economy client loop | `src/client/pages/WorldPlay.tsx` |
| World building/interior contracts | `src/client/pages/worldInteriorData.ts` |
| Recreation and server sessions | `src/server/routes/recreation.ts`, `src/server/lib/recreation.ts` |
| Paid classic arcade shell and high scores | `src/client/pages/ArcadeGames.tsx`, `src/client/pages/RecreationFloor.tsx` |

## Office and client rendering

| Engine | Source |
| --- | --- |
| Isometric office renderer | `src/client/components/IsoOffice.tsx` |
| Legacy pixel-office renderer | `src/client/components/PixelOffice.tsx` |
| Live office simulation | `src/client/pixel-office/` |
| Office layout and furniture contracts | `src/client/components/office/`, `src/client/pixel-office/office/` |
| Art library/Godot preview client | `src/client/pages/ArtLibrary.tsx`, `src/client/components/GodotArtPreview.tsx` |

## Business, people, and platform engines

The source export also includes the complete current server library and route
layers for:

- organizations, roles, permissions, hiring, business operations, and finance;
- autopilot domains and guardrails;
- AI routing, Pablo/Mila, TTS, live context, and usage metering;
- phone, Twilio, CRM activity, messaging, chat, presence, and notifications;
- multi-broker trading, market data, risk, and paper adapters;
- object storage, safe fetch, social providers, and integration health.

Those broad modules are under `src/server/lib/`, `src/server/routes/`, and
`shared/`. Use the copy map before taking a whole subsystem.