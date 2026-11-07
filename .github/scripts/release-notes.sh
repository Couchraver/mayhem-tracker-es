#!/usr/bin/env bash
# Notas de una release: los commits desde la etiqueta anterior, cómo pasar el
# aviso de SmartScreen (el .exe no está firmado) y el SHA256 para verificarlo.
#
# Uso: release-notes.sh <etiqueta> <exe>   (escribe en stdout)
set -euo pipefail

TAG="$1"
EXE="$2"
HASH=$(sha256sum "$EXE" | cut -d' ' -f1)
PREV=$(git describe --tags --abbrev=0 "$TAG^" 2>/dev/null || true)

echo "## Cambios"
echo
if [ -n "$PREV" ]; then
  RANGE="$PREV..$TAG"
else
  RANGE="$TAG"
fi
# Sin los commits de solo versión ("1.16.0") que crea npm version
git log --no-merges --pretty='- %s' "$RANGE" | grep -vE '^- [0-9]+\.[0-9]+\.[0-9]+$' | head -30 || true
echo

cat <<EOF
## Instalación

Descarga \`MayhemTracker.exe\` y ábrelo; no hace falta instalar nada. Si ya tienes la app, se actualiza sola.

**Si Windows muestra "Windows protegió tu PC":** es normal, el archivo no tiene firma digital. Haz clic en **Más información** y después en **Ejecutar de todas formas**. Solo pasa la primera vez.

SHA256 de \`MayhemTracker.exe\` (en PowerShell: \`Get-FileHash .\\MayhemTracker.exe\`):

\`\`\`
$HASH
\`\`\`
EOF
