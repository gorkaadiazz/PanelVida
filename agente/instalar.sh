#!/usr/bin/env bash
# Instala el agente de Mi Panel para TU usuario (sin sudo).
#   bash agente/instalar.sh
# Copia el agente a ~/.local/share/mipanel-agente, crea los comandos
# mipanel-agente y mipanel-enviar en ~/.local/bin y el servicio de usuario
# de systemd. No guarda ninguna clave: eso lo hace `mipanel-agente vincular`.
set -euo pipefail

ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINO="$HOME/.local/share/mipanel-agente"
BIN="$HOME/.local/bin"
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/mipanel"
UNIDADES="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

echo "== Comprobando Node"
if ! command -v node >/dev/null; then
  echo "Falta Node.js. Instálalo con: sudo pacman -S nodejs npm"; exit 1
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>23||(a===23&&b>=6)?0:1)'; then
  echo "Hace falta Node 23.6 o más nuevo (tienes $(node -v))."; exit 1
fi

echo "== Copiando el agente a $DESTINO"
mkdir -p "$DESTINO"
rm -rf "$DESTINO/bin" "$DESTINO/src"
cp -r "$ORIGEN/bin" "$ORIGEN/src" "$ORIGEN/package.json" "$ORIGEN/package-lock.json" "$DESTINO/"
find "$DESTINO/src" -name '*.test.ts' -delete
chmod 755 "$DESTINO/bin/mipanel-agente.ts"
(cd "$DESTINO" && npm ci --omit=dev --no-audit --no-fund --silent)

echo "== Lista de fabricantes (IEEE) para el vigilante de la red"
# El servidor del IEEE es lento: hasta 10 minutos y 3 reintentos (si ya estaba, se conserva)
if curl -fsSL --retry 3 --retry-delay 5 --max-time 600 https://standards-oui.ieee.org/oui/oui.csv -o "$DESTINO/oui.csv.tmp"; then
  mv "$DESTINO/oui.csv.tmp" "$DESTINO/oui.csv"
else
  rm -f "$DESTINO/oui.csv.tmp"
  if [ -f "$DESTINO/oui.csv" ]; then
    echo "   No se ha podido actualizar: se sigue usando la que ya había."
  else
    echo "   No se ha podido descargar (sin ella, la red no enseña fabricantes). Puedes repetir la instalación más tarde."
  fi
fi

echo "== Comandos en $BIN"
mkdir -p "$BIN"
cat > "$BIN/mipanel-agente" <<SCRIPT
#!/bin/sh
exec /usr/bin/env node "$DESTINO/bin/mipanel-agente.ts" "\$@"
SCRIPT
cat > "$BIN/mipanel-enviar" <<SCRIPT
#!/bin/sh
# Manda al Puente lo que tengas en el portapapeles (asígnale un atajo en KDE)
exec /usr/bin/env node "$DESTINO/bin/mipanel-agente.ts" enviar
SCRIPT
chmod 755 "$BIN/mipanel-agente" "$BIN/mipanel-enviar"

echo "== Configuración en $CONFIG"
mkdir -p "$CONFIG"
chmod 700 "$CONFIG"
if [ ! -f "$CONFIG/config.json" ]; then
  install -m 600 "$ORIGEN/config.ejemplo.json" "$CONFIG/config.json"
  echo "   Creado config.json de ejemplo (apps que se pueden abrir y MAC del router)."
else
  echo "   config.json ya existía: no se toca."
fi

echo "== Servicio de usuario de systemd"
mkdir -p "$UNIDADES"
install -m 644 "$ORIGEN/mipanel-agente.service" "$UNIDADES/mipanel-agente.service"
systemctl --user daemon-reload
systemctl --user enable mipanel-agente.service >/dev/null

echo
echo "Instalado."
if ! command -v wl-copy >/dev/null; then
  echo "Recomendado: sudo pacman -S wl-clipboard   (portapapeles en Wayland; sin él se usa Klipper de KDE)"
fi
case ":$PATH:" in *":$BIN:"*) ;; *) echo "Añade $BIN a tu PATH para usar mipanel-agente y mipanel-enviar." ;; esac
if [ -f "$CONFIG/credenciales.json" ]; then
  # Ya vinculado: es una actualización, basta con reiniciar el servicio
  systemctl --user restart mipanel-agente.service
  echo "Este PC ya estaba vinculado: agente actualizado y reiniciado."
else
  echo "Siguiente paso: en la app, Mando del PC → Vincular un PC, y aquí:"
  echo "   mipanel-agente vincular CODIGO \"PC casa\""
fi
