#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GODOT_BIN="${GODOT_BIN:-$(command -v godot || command -v godot4 || true)}"
if [[ -z "$GODOT_BIN" ]]; then
  echo "Godot 4 is required for the safe regression suite." >&2
  exit 127
fi

echo "Running browser workspace, menu, automation, and CALLL HOME tests..."
pnpm --filter @workspace/interview-helper exec vitest run \
  src/pages/Autopilot.render.test.tsx \
  src/pages/Autopilot.feedback.test.tsx \
  src/pages/Autopilot.write.test.tsx \
  src/pages/Autopilot.workflow.test.tsx \
  src/pages/Autopilot.activity.test.tsx \
  src/lib/navigation-menu.test.ts \
  src/components/WorkspaceMenuOverlay.test.tsx \
  src/pages/WorkspaceHome.test.tsx \
  src/pages/phone/CalllHomePage.test.tsx \
  src/pages/phone/CalllHomeContext.test.ts \
  src/lib/phone-system-status.test.ts

echo "Running mocked automation, phone, and API-structure tests..."
pnpm --filter @workspace/api-server exec vitest run autopilot
pnpm --filter @workspace/api-server run test:phone
pnpm --filter @workspace/api-server run test:api-structure

echo "Running Python bridge and simulation tests..."
python -m unittest discover -s tests -p 'test_*.py'

run_godot_test() {
  local test_script="$1"
  local output_file
  output_file="$(mktemp)"
  local status=0

  echo "Running Godot check: $test_script"
  "$GODOT_BIN" --headless --path godot/office-client \
    --script "res://tests/$test_script" >"$output_file" 2>&1 || status=$?
  cat "$output_file"
  if grep -Eq 'SCRIPT ERROR|ERROR: Assertion failed' "$output_file"; then
    status=1
  fi
  rm -f "$output_file"
  return "$status"
}

run_godot_test floor_travel_test.gd
run_godot_test 1999_station_smoke.gd

echo "Running workspace TypeScript checks..."
pnpm run typecheck
echo "Safe regression suite passed. No live provider health checks were run."
