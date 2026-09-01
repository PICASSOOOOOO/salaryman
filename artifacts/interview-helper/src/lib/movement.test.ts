import { describe, expect, it } from "vitest";
import {
  analogMovementVector,
  approachAngle,
  approachMovementVelocity,
  isometricKeyboardMovementVector,
  keyboardMovementVector,
  moveWithCollision,
} from "./movement";

describe("movement vectors", () => {
  it("keeps cardinal and diagonal input at the same full speed", () => {
    const east = keyboardMovementVector(new Set(["d"]));
    const northeast = keyboardMovementVector(new Set(["d", "w"]));

    expect(Math.hypot(east.x, east.y)).toBeCloseTo(1);
    expect(Math.hypot(northeast.x, northeast.y)).toBeCloseTo(1);
    expect(northeast.x).toBeCloseTo(Math.SQRT1_2);
    expect(northeast.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it("keeps office controls aligned to screen north/south", () => {
    expect(isometricKeyboardMovementVector(new Set(["w"]))).toEqual({
      x: -Math.SQRT1_2,
      y: -Math.SQRT1_2,
    });
    expect(isometricKeyboardMovementVector(new Set(["s"]))).toEqual({
      x: Math.SQRT1_2,
      y: Math.SQRT1_2,
    });
    expect(isometricKeyboardMovementVector(new Set(["a"]))).toEqual({
      x: -Math.SQRT1_2,
      y: Math.SQRT1_2,
    });
    expect(isometricKeyboardMovementVector(new Set(["d"]))).toEqual({
      x: Math.SQRT1_2,
      y: -Math.SQRT1_2,
    });
  });

  it("preserves analog magnitude after the deadzone", () => {
    const light = analogMovementVector(0.5, 0);
    const full = analogMovementVector(1, 0);

    expect(light.x).toBeGreaterThan(0);
    expect(light.x).toBeLessThan(1);
    expect(full).toEqual({ x: 1, y: 0 });
  });

  it("accelerates, turns, and brakes without snapping", () => {
    const started = approachMovementVelocity({ x: 0, y: 0 }, { x: 0.7, y: 0 }, 1);
    const turned = approachMovementVelocity(started, { x: 0, y: -0.7 }, 1);
    const stopped = approachMovementVelocity(turned, { x: 0, y: 0 }, 1);

    expect(started.x).toBeGreaterThan(0);
    expect(started.x).toBeLessThan(0.7);
    expect(turned.y).toBeLessThan(0);
    expect(Math.hypot(stopped.x, stopped.y)).toBeLessThan(Math.hypot(turned.x, turned.y));
  });

  it("slides around a blocking corner in sub-stepped sweeps", () => {
    const result = moveWithCollision(
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      (x, y) => x > 4 && y > 4,
      2,
    );

    expect(Math.max(result.x, result.y)).toBeCloseTo(10);
    expect(Math.min(result.x, result.y)).toBeLessThanOrEqual(4);
  });

  it("takes the shortest smooth route across the angle wrap", () => {
    const current = Math.PI - 0.1;
    const target = -Math.PI + 0.1;
    const result = approachAngle(current, target, 0.15);

    expect(result - current).toBeCloseTo(0.15);
    expect(Math.abs(result - target)).toBeGreaterThan(6);
  });
});