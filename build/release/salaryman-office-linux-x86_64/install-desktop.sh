#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DATA_HOME=${XDG_DATA_HOME:-"$HOME/.local/share"}
ICON_DIR="$DATA_HOME/icons/hicolor/512x512/apps"
APPLICATION_DIR="$DATA_HOME/applications"
ICON_PATH="$ICON_DIR/salaryman-office.png"
DESKTOP_PATH="$APPLICATION_DIR/salaryman-office.desktop"

mkdir -p "$ICON_DIR" "$APPLICATION_DIR"
cp "$ROOT/branding/salaryman-office.png" "$ICON_PATH"
cat > "$DESKTOP_PATH" <<EOF
[Desktop Entry]
Type=Application
Name=SALARYMAN Office
Comment=Run the SALARYMAN desktop office
Exec="$ROOT/launch-salaryman-office.sh"
Icon=$ICON_PATH
Terminal=false
Categories=Office;Business;Finance;
EOF
chmod 0o644 "$DESKTOP_PATH"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPLICATION_DIR" >/dev/null 2>&1 || true
fi

printf 'Installed SALARYMAN Office launcher: %s
' "$DESKTOP_PATH"
printf 'Installed SALARYMAN Office icon: %s
' "$ICON_PATH"
