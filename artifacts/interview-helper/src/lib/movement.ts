export type MovementVector = { x: number; y: number };

export const ZERO_MOVEMENT: MovementVector = { x: 0, y: 0 };

/**
 * Return a vector whose magnitude is at most one. Unlike the old 0.707
 * diagonal adjustment, this also preserves the magnitude of a real analog
 * stick so a light push remains a slow walk.
 */
export function normalizeMovementVector(x: number, y: number): MovementVector {
  const magnitude = Math.hypot(x, y);
  if (!Number.isFinite(magnitude) || magnitude < 0.0001) return { ...ZERO_MOVEMENT };
  const scale = Math.min(1, 1 / magnitude);
  return { x: x * scale, y: y * scale };
}

export function keyboardMovementVector(keys: ReadonlySet<string>): MovementVector {
  let x = 0;
  let y = 0;
  if (keys.has('arrowleft') || keys.has('a')) x -= 1;
  if (keys.has('arrowright') || keys.has('d')) x += 1;
  if (keys.has('arrowup') || keys.has('w')) y -= 1;
  if (keys.has('arrowdown') || keys.has('s')) y += 1;
  return normalizeMovementVector(x, y);
}

/**
 * Keyboard directions for the isometric office. The office is drawn with
 * north/south as the vertical screen axis, not as one of the two diagonal
 * tile axes. Convert the player's intuitive screen directions back into
 * logical tile movement before the renderer projects them.
 */
export function isometricKeyboardMovementVector(keys: ReadonlySet<string>): MovementVector {
  let screenX = 0;
  let screenY = 0;
  if (keys.has("a") || keys.has("arrowleft")) screenX -= 1;
  if (keys.has("d") || keys.has("arrowright")) screenX += 1;
  if (keys.has("w") || keys.has("arrowup")) screenY -= 1;
  if (keys.has("s") || keys.has("arrowdown")) screenY += 1;

  // Inverse of the office projection:
  // screenX = (tileX - tileY) / 2, screenY = (tileX + tileY) / 4.
  // The constants are intentionally omitted here because only direction is
  // needed; normalization below gives all directions the same walk speed.
  const logicalX = screenX + screenY;
  const logicalY = screenY - screenX;
  // Cardinal screen input always maps to a perfect 45° isometric vector.
  // Returning the platform constant also avoids tiny cross-engine drift.
  if (Math.abs(logicalX) === 1 && Math.abs(logicalY) === 1) {
    return {
      x: Math.sign(logicalX) * Math.SQRT1_2,
      y: Math.sign(logicalY) * Math.SQRT1_2,
    };
  }
  return normalizeMovementVector(logicalX, logicalY);
}

/**
 * Apply a radial deadzone while retaining the stick's remaining analog
 * magnitude. This keeps the edge of the stick at full speed in every angle.
 */
export function analogMovementVector(x: number, y: number, deadzone = 0.25): MovementVector {
  const magnitude = Math.hypot(x, y);
  if (!Number.isFinite(magnitude) || magnitude <= deadzone) return { ...ZERO_MOVEMENT };
  const usable = Math.min(1, (magnitude - deadzone) / Math.max(0.0001, 1 - deadzone));
  const direction = normalizeMovementVector(x, y);
  return { x: direction.x * usable, y: direction.y * usable };
}

function movementMagnitude(v: MovementVector): number {
  return Math.hypot(v.x, v.y);
}

/**
 * Move the current velocity toward a desired velocity using time-normalized
 * acceleration and braking. The rate scales with speed so vehicles do not
 * take an unreasonable number of frames to get moving.
 */
export function approachMovementVelocity(
  current: MovementVector,
  target: MovementVector,
  dtFactor: number,
): MovementVector {
  const dt = Math.max(0, Math.min(2.5, Number.isFinite(dtFactor) ? dtFactor : 1));
  const currentSpeed = movementMagnitude(current);
  const targetSpeed = movementMagnitude(target);
  const accelerating = targetSpeed > currentSpeed + 0.001;
  const changingDirection = currentSpeed > 0.01
    && targetSpeed > 0.01
    && current.x * target.x + current.y * target.y < currentSpeed * targetSpeed * 0.75;
  // Ease into a walk, carve through turns, and settle to rest instead of
  // snapping the sprite onto a new axis in a frame or two. Direction changes
  // get a slightly stronger brake than straight-line acceleration so the
  // character feels intentional rather than skating past corners.
  const rate = changingDirection
    ? Math.max(0.14, targetSpeed * 0.24)
    : accelerating
      ? Math.max(0.14, targetSpeed * 0.24)
      : Math.max(0.2, currentSpeed * 0.3);
  const maxDelta = rate * dt;
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= maxDelta || distance < 0.0001) return { x: target.x, y: target.y };
  return { x: current.x + (dx / distance) * maxDelta, y: current.y + (dy / distance) * maxDelta };
}

/**
 * Integrate a movement delta in small sweeps. If the full diagonal sweep is
 * blocked, each component is attempted independently, yielding natural wall
 * sliding without tunneling through thin props during a frame hitch.
 */
export function moveWithCollision(
  position: MovementVector,
  delta: MovementVector,
  collides: (x: number, y: number) => boolean,
  maxStep = 3,
): MovementVector {
  const distance = Math.hypot(delta.x, delta.y);
  if (!Number.isFinite(distance) || distance < 0.0001) return { ...position };
  const steps = Math.max(1, Math.ceil(distance / Math.max(0.5, maxStep)));
  const stepX = delta.x / steps;
  const stepY = delta.y / steps;
  let x = position.x;
  let y = position.y;

  for (let i = 0; i < steps; i++) {
    const nextX = x + stepX;
    const nextY = y + stepY;
    if (!collides(nextX, nextY)) {
      x = nextX;
      y = nextY;
      continue;
    }
    if (!collides(nextX, y)) x = nextX;
    if (!collides(x, nextY)) y = nextY;
  }
  return { x, y };
}

export function approachAngle(current: number, target: number, maxStep: number): number {
  const fullTurn = Math.PI * 2;
  let delta = (target - current) % fullTurn;
  if (delta > Math.PI) delta -= fullTurn;
  if (delta < -Math.PI) delta += fullTurn;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}