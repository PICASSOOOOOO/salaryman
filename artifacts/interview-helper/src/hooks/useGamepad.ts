import { useEffect, useRef, useState } from 'react';
import { analogMovementVector, type MovementVector, ZERO_MOVEMENT } from '../lib/movement';

/**
 * Unified gamepad input bridge.
 *
 * Polls navigator.getGamepads() every animation frame. The left stick is
 * exposed as a continuous movement vector so WorldPlay can apply the same
 * acceleration/collision path as keyboard and touch input. Other buttons still
 * synthesize window KeyboardEvents that match the existing WorldPlay handler
 * (`gs.current.keys.add(e.key.toLowerCase())`). That means every
 * keyboard-driven system in the game — E to interact,
 * Space to jump, Shift to sprint, V to summon vehicle, P to park, etc.
 * — automatically works with an Xbox/PS5/generic HID controller. No
 * changes to WorldPlay's input dispatch are required.
 *
 * Mappings (Standard Gamepad layout, https://w3c.github.io/gamepad/):
 *   Left stick / D-pad       → continuous movement vector
 *   A / Cross  (button 0)    → E         (primary interact)
 *   B / Circle (button 1)    → Escape    (cancel / close menu)
 *   X / Square (button 2)    → Space     (jump)
 *   Y / Triangle (button 3)  → V         (vehicle)
 *   LB / L1 (button 4)       → Shift     (sprint, hold)
 *   RB / R1 (button 5)       → P         (park / secondary)
 *   LT / L2 (button 6)       → Shift     (alt sprint, analog → digital)
 *   RT / R2 (button 7)       → E         (alt interact)
 *   D-pad up/down/left/right (buttons 12/13/14/15) → continuous movement vector
 *
 * Deadzone is 0.30 on the left stick — tight enough to avoid drift,
 * loose enough that drift-prone controllers don't cause runaway walks.
 */

type GamepadState = {
  connected: boolean;
  label: string;
};

const DEADZONE = 0.30;

// Each entry is the lowercase key string the keyboard handler matches.
const BUTTON_TO_KEY: Record<number, string> = {
  0: 'e',          // A / Cross
  1: 'Escape',     // B / Circle (capitalised to match real KeyboardEvent.key)
  2: ' ',          // X / Square (Space)
  3: 'v',          // Y / Triangle
  4: 'shift',      // LB / L1
  5: 'p',          // RB / R1
  6: 'shift',      // LT / L2
  7: 'e',          // RT / R2
};

function dispatchKey(type: 'keydown' | 'keyup', key: string) {
  // Bubble through window so WorldPlay's listener catches it. Synthesizing
  // KeyboardEvent with `key` in lowercase matches the handler's
  // `.toLowerCase()` normalisation. We mark it isTrusted=false implicitly
  // by being a synthetic event — that's fine, the handler doesn't check.
  const ev = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
  window.dispatchEvent(ev);
}

export function useGamepad(): GamepadState & { movementRef: { current: MovementVector } } {
  const [state, setState] = useState<GamepadState>({ connected: false, label: '' });
  const movementRef = useRef<MovementVector>({ ...ZERO_MOVEMENT });

  useEffect(() => {
    // Track which "virtual keys" are currently pressed so we only
    // emit edge transitions (down once, up once). Without edge
    // detection we'd flood the keys Set with no-op .add() calls every
    // frame and (worse) never emit keyup.
    const pressed = new Set<string>();
    let raf = 0;
    let lastConnected = false;

    const tick = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let active: Gamepad | null = null;
      for (const p of pads) { if (p && p.connected) { active = p; break; } }

      if (!active) {
        if (lastConnected) {
          // Release every synthetic key we were holding.
          for (const k of pressed) dispatchKey('keyup', k);
          pressed.clear();
          lastConnected = false;
          setState({ connected: false, label: '' });
        }
        movementRef.current = { ...ZERO_MOVEMENT };
        raf = requestAnimationFrame(tick);
        return;
      }

      if (!lastConnected) {
        lastConnected = true;
        setState({ connected: true, label: active.id || 'Controller' });
      }

      // ── Left stick + D-pad → continuous movement vector ──
      const lx = active.axes[0] ?? 0;
      const ly = active.axes[1] ?? 0;
      let movement = analogMovementVector(lx, ly, DEADZONE);
      const dpadX = (active.buttons[15]?.pressed ? 1 : 0) - (active.buttons[14]?.pressed ? 1 : 0);
      const dpadY = (active.buttons[13]?.pressed ? 1 : 0) - (active.buttons[12]?.pressed ? 1 : 0);
      if (movement.x === 0 && movement.y === 0 && (dpadX !== 0 || dpadY !== 0)) {
        movement = analogMovementVector(dpadX, dpadY, 0);
      }
      movementRef.current = movement;

      // ── Buttons → mapped keys ──
      // Build the desired-pressed set for THIS frame from buttons.
      const buttonKeys: Record<string, boolean> = {};
      for (const [idxStr, key] of Object.entries(BUTTON_TO_KEY)) {
        const b = active.buttons[Number(idxStr)];
        if (!b) continue;
        // Triggers are analog (b.value 0..1); a press is value > 0.5
        // OR pressed boolean true.
        const isDown = b.pressed || (b.value ?? 0) > 0.5;
        if (isDown) buttonKeys[key] = true;
      }

      const desired: Record<string, boolean> = { ...buttonKeys };

      // Emit edge transitions.
      for (const key of Object.keys(desired)) {
        if (!pressed.has(key)) {
          dispatchKey('keydown', key);
          pressed.add(key);
        }
      }
      for (const key of Array.from(pressed)) {
        if (!desired[key]) {
          dispatchKey('keyup', key);
          pressed.delete(key);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    const onConnect = (e: GamepadEvent) => {
      setState({ connected: true, label: e.gamepad.id || 'Controller' });
    };
    const onDisconnect = () => {
      // Release all virtual keys on disconnect to avoid stuck movement.
      for (const k of pressed) dispatchKey('keyup', k);
      pressed.clear();
      movementRef.current = { ...ZERO_MOVEMENT };
      setState({ connected: false, label: '' });
    };

    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
      // Release any held keys on unmount.
      for (const k of pressed) dispatchKey('keyup', k);
      pressed.clear();
      movementRef.current = { ...ZERO_MOVEMENT };
    };
  }, []);

  return { ...state, movementRef };
}
