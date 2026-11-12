---
name: Desktop office camera
description: Approved camera and floor direction for the authoritative Pygame office client.
---

The desktop Pygame office must use a straight top-down/orthogonal camera with square commercial office carpet tiles and rectangular work zones. Do not use diagonal diamond tiles, an isometric camera, or perspective lines converging toward a horizon.

The building should still have depth through real vertical layers: basement, lobby, and upper office floors connected by authoritative elevators and stairs. Wall thickness, ceiling lights, shadows, and elevation cues must use horizontal/vertical geometry; a visual stack must never substitute for functional floors.

Shadow Tower has 67 floors, each a 100,000,000 × 100,000,000-pixel navigable world. Render only the camera-visible tile window; never allocate a floor-sized surface.

Each floor base has one elevator lobby connected to one continuous hallway serving four separate offices. Each office comfortably supports up to 100 desks; users needing more capacity must acquire another office. Do not merge capacity across offices.

Floor slabs and circulation surfaces are concrete, heavily layered with distinct Persian rugs. Rug motifs must remain rectangular/orthogonal so they do not reintroduce diagonal geometry.

**Why:** The owner explicitly rejected both the straight-ahead vanishing-point corridor and the later diagonal isometric treatment. They selected “Square grid viewed straight ahead/top-down — no diagonal floor.”

**How to apply:** Keep desktop-client rendering, screenshots, promo copy, and replacement footage consistent with the square top-down office. “2.5D” must not be translated into an isometric diamond floor. When adding building levels, scope rooms and objects to a real floor and make elevator/stair travel update the same authoritative floor state used by the bridge and alternate renderer.