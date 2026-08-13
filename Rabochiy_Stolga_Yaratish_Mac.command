#!/bin/bash
TARGET_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$HOME/Desktop"
APP_NAME="Kiosk Hisobot Adminka.app"
APP_PATH="$DESKTOP_DIR/$APP_NAME"

echo "=========================================================="
echo "Rabochiy stolga (Desktop) chiroyli Kiosk iconkasi bilan app yaratilmoqda..."
echo "=========================================================="

rm -rf "$APP_PATH"
rm -f "$DESKTOP_DIR/Kiosk Hisobot Adminka.command"

mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Resources"

cp "$TARGET_DIR/kiosk_icon.icns" "$APP_PATH/Contents/Resources/AppIcon.icns"

cat <<EOF > "$APP_PATH/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>com.uzrailways.kiosk</string>
    <key>CFBundleName</key>
    <string>Kiosk Hisobot Adminka</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
</dict>
</plist>
EOF

cat <<EOF > "$APP_PATH/Contents/MacOS/launcher"
#!/bin/bash
cd "$TARGET_DIR"
python3 app.py &
sleep 0.6
open "http://127.0.0.1:5050"
wait
EOF

chmod +x "$APP_PATH/Contents/MacOS/launcher"
touch "$APP_PATH"

echo ""
echo "MUVAFFAQIYATLI! Rabochiy stolingizda (Desktop) 'Kiosk Hisobot Adminka' dasturi chiroyli Kiosk iconkasi bilan yaratildi!"
echo "=========================================================="
