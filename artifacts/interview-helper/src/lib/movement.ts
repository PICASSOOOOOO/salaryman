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
  const rate = accelerating
    ? Math.max(0.18, targetSpeed * 0.24)
    : Math.max(0.24, currentSpeed * 0.32);
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
  maxStep = 4,
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