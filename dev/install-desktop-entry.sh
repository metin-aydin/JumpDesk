#!/bin/sh
# Geliştirme sürümü (npm run dev) için masaüstü kaydı kurar: uygulama menüsünden başlatılabilir, rıhtımda sabitlenebilir.
# Geliştirme sürümünün masaüstü adı jumpdesk-dev.desktop (X11 WM_CLASS jumpdesk-dev); kurulu paketin jumpdesk.desktop
# kaydıyla karışmaz. Simge build/icon.png'nin içeriğine göre adlandırılmış kopyasıdır (~/.local/share/jumpdesk-dev):
# GNOME Shell simgeyi dosya yoluna göre önbelleğe aldığından logo değişince yol da değişir. Logo değiştikten sonra
# betik yeniden çalıştırılır.
# Kaldırmak için: sh dev/install-desktop-entry.sh --remove
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor"
ICON_DIR="$HOME/.local/share/jumpdesk-dev"
if [ "$1" = "--remove" ]; then
  rm -f "$APPS/jumpdesk-dev.desktop" "$APPS/jumpdesk.desktop" "$ICONS"/*/apps/jumpdesk.png
  rm -rf "$ICON_DIR"
  # Önbellek silinen ikonları listelemeye devam ederse kabuk kurulu paketin ikonunu bulamaz; yeniden üretilir.
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1 || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -f -t "$ICONS" >/dev/null 2>&1 || true
  echo "JumpDesk geliştirme masaüstü kaydı kaldırıldı."
  exit 0
fi
mkdir -p "$APPS" "$ICON_DIR"
HASH="$(sha256sum "$ROOT/build/icon.png" | cut -c1-12)"
ICON="$ICON_DIR/icon-$HASH.png"
find "$ICON_DIR" -name 'icon-*.png' ! -name "icon-$HASH.png" -delete
cp "$ROOT/build/icon.png" "$ICON"
cat > "$APPS/jumpdesk-dev.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=JumpDesk (Geliştirme)
Comment=JumpServer masaüstü istemcisi (geliştirme)
Exec=sh -c "cd '$ROOT' && npm run dev"
Icon=$ICON
Terminal=false
Categories=Network;RemoteAccess;
StartupWMClass=jumpdesk-dev
DESKTOP
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1 || true
echo "Kuruldu: $APPS/jumpdesk-dev.desktop"
