#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="${BUILD_DIR:-$REPO_ROOT/generated-artifacts/1999-vst3-build}"
BUILD_JOBS="${BUILD_JOBS:-2}"

if [[ -d /nix/store ]]; then
  target_triple="$(gcc -dumpmachine)"
  pkg_config_dirs="$(find /nix/store -maxdepth 4 -type d -path '*/lib/pkgconfig' -print 2>/dev/null | paste -sd: -)"
  export "PKG_CONFIG_PATH_${target_triple//-/_}=$pkg_config_dirs"
  export "PKG_CONFIG_PATH=$pkg_config_dirs${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"

  x11_include_dirs="$(find /nix/store -maxdepth 3 -type d \
    \( -path '/nix/store/*-libX*-dev/include' \
       -o -path '/nix/store/*-libxcb-*-dev/include' \
       -o -path '/nix/store/*-xorgproto-*/include' \
       -o -path '/nix/store/*-libxkbcommon-*-dev/include' \) \
    -print 2>/dev/null | paste -sd: -)"
  export "CPATH=$x11_include_dirs${CPATH:+:$CPATH}"
fi

cmake -S "$SCRIPT_DIR" -B "$BUILD_DIR" -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build "$BUILD_DIR" --target SALARYMAN1999_VST3 1999_native_smoke --parallel "$BUILD_JOBS"
ctest --test-dir "$BUILD_DIR" --output-on-failure
