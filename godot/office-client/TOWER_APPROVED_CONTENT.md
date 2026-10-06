# Tower approved content

This is the initial in-game allowlist. New art, characters, and placed devices
should be added only after their art, interaction, camera behavior, and data
source are agreed. In-game interfaces are rendered by the game; they do not
embed or open the browser's React pages.

## Approved assets

- Godot Tower kit: `desk-terminal.png`, `atm.png`, and `vending.png`.
- Godot actor/furniture: `character-male-a.glb`, `chair_A.gltf`, and
  `table_medium.gltf`.
- Pygame actor sheets: `char_0.png` through `char_5.png`.
- Pygame workstation props: front-facing desk, cushioned/wooden chairs, and
  the three existing PC front sprites.
- Pay phone, reception counter/character, and the 1970s systems terminal use
  the currently approved procedural game-side models/drawings.

## Approved characters

- The player avatar.
- Starting office staff: Mara Voss, Ivo Chen, and Nia Okafor.
- Recruitable staff: Devin Wright, Clara Oswald, Marcus Vance, Sarah Connor,
  Ada Lovelace, and Alan Turing (visible only after hiring).
- Automation coworkers: PIP, LEDGER, ECHO, KITE, MUSE, and SCOUT.
- The floor receptionist/secretary is an approved visual role; it is not an
  interactive service object.

## Approved interactive objects

- Lobby: elevator, stairs, reception desk, ATM, vending machine, pay phone.
- Recreation hallway: elevator, stairs, four office doors, four arcade cabinets,
  and the repeated pay phone.
- Work areas: desks, chairs, windows, office telephones, vending machines,
  ATMs where installed, and the workstation CRTs. A CRT opens only from its
  matching occupied chair.
- Camera-focus devices: pay phones, CRT systems terminals, ATMs, vending
  machines, office telephones, and arcade cabinets.
- Static set dressing (including floor signs and desk lamps) is not interactive.

Radios, copiers, fax machines, satellite phones, TVs/CCTV sets are not installed
in the default floor; their purchase/placement path remains separate and is not
implied by this allowlist.

## Interaction scope

- Pay phones expose only CALLL HOME and COMMS.
- Systems terminals open the game-native read-only workspace view.
- Approved focus devices smoothly bring the game camera toward the object and
  zoom in while its native panel is open.
- This first pass is read-only: it does not initiate calls, send messages, or
  transfer money.

The interface uses the existing readable SALARYMAN game UI. Retro styling stays
on physical hardware; no CRT filters or scanlines are applied to UI panels.
