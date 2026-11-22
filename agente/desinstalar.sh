#!/usr/bin/env bash
# Desinstala el agente de Mi Panel de tu usuario.
#   bash agente/desinstalar.sh
# Primero lo desvincula (si puede), para que su usuario se borre en Supabase.
set -uo pipefail

DESTINO="$HOME/.local/share/mipanel-agente"
BIN="$HOME/.local/bin"
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/mipanel"
UNIDADES="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

if [ -x "$BIN/mipanel-agente" ]; then
  echo "== Desvinculando este PC"
  "$BIN/mipanel-agente" desvincular || echo "   (desvincúlalo también desde la app si no se pudo)"
fi

echo "== Parando y quitando el servicio"
systemctl --user disable --now mipanel-agente.service 2>/dev/null || true
rm -f "$UNIDADES/mipanel-agente.service"
systemctl --user daemon-reload

echo "== Borrando el agente y sus comandos"
rm -rf "$DESTINO"
rm -f "$BIN/mipanel-agente" "$BIN/mipanel-enviar"

read -r -p "¿Borrar también la configuración ($CONFIG)? [s/N] " r
if [ "${r,,}" = "s" ]; then rm -rf "$CONFIG"; echo "   Borrada."; fi
echo "Desinstalado."
