#!/bin/bash
TARGET_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$TARGET_DIR"

# Rabochiy stolga avtomatik iconka yaratish
DESKTOP_SHORTCUT="$HOME/Desktop/Kiosk Hisobot Adminka.command"
if [ ! -f "$DESKTOP_SHORTCUT" ]; then
    cat <<EOF > "$DESKTOP_SHORTCUT"
#!/bin/bash
cd "$TARGET_DIR"
python3 app.py
EOF
    chmod +x "$DESKTOP_SHORTCUT"
fi

python3 app.py
