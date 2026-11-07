# Mayhem Tracker (español)

App de escritorio para registrar tu historial de **ARAM: Caos** en League of Legends. Se conecta al cliente de LoL para guardar cada partida automáticamente y mostrar estadísticas, en español.

Es una versión independiente basada en [Mayhem Tracker](https://github.com/Yhprum/mayhem-tracker) de Yhprum (licencia MIT), con la interfaz y los datos del juego en español y funciones propias.

## Funciones

- Detecta las partidas automáticamente a través del cliente de League
- Historial con el detalle de cada partida, marcador en vivo y resumen al terminar
- **Nota de maestría (S+, S, A…) de cada partida**, tuya y de tus premades
- Estadísticas de campeones, aumentos y amigos, con porcentaje de victorias
- Resúmenes de temporada y partidas exportables como imagen PNG
- Base de datos local SQLite con copias de seguridad automáticas

## Descarga

Descarga `MayhemTracker.exe` de la [última versión](https://github.com/Couchraver/mayhem-tracker-es/releases/latest) y ejecútalo. Es portable: no se instala y puede estar en cualquier carpeta. La app avisa cuando hay una versión nueva y se actualiza sola.

## Uso

1. Abre el cliente de League e inicia sesión. La app usa la API local del cliente, así que el cliente tiene que estar abierto para detectar tu cuenta, importar el historial o guardar partidas nuevas.
2. Abre Mayhem Tracker. La barra lateral muestra el estado de la conexión.
3. La primera vez que se conecta una cuenta, importa tus partidas anteriores de Mayhem. Riot solo guarda las últimas 1000 partidas de cada cuenta (de todas las colas), así que la importación llega hasta ahí.
4. Después guarda cada partida al terminarla: déjala abierta mientras juegas.

Las partidas se guardan en `%APPDATA%\mayhem-tracker\data`, con copias de seguridad automáticas al lado.

## Actualizaciones automáticas

- **Cada parche de LoL:** campeones, objetos, aumentos e íconos se descargan solos al abrir la app. Las descripciones de los aumentos vienen incluidas en la app, así que una Action ([`patch-update.yml`](.github/workflows/patch-update.yml)) revisa cada 6 horas si salió un parche nuevo. Si cambiaron, las regenera en español y publica una versión nueva.
- **Versiones a mano:** `npm version patch` (o `minor`) y `git push --follow-tags`. La Action [`release.yml`](.github/workflows/release.yml) compila y publica.

## Traducción

Los componentes escriben sus textos en inglés y [`src/renderer/i18n/runtime.ts`](src/renderer/i18n/runtime.ts) los reemplaza en pantalla con [`es.json`](src/renderer/i18n/es.json). Al agregar textos nuevos:

```bash
cd i18n && npm ci
node extract.mjs                          # junta los textos del código en strings.json
ANTHROPIC_API_KEY=... node translate.mjs  # traduce con Claude los que falten en es.json
```

También se pueden agregar a mano en `es.json`.

## Desarrollo

```bash
npm ci --ignore-scripts
node node_modules/electron/install.js
npm run dev
```

Antes de publicar (la Action también lo revisa):

```bash
npm run typecheck
npm run lint
npm run format
```

Para compilar el ejecutable portable de Windows: `npm run dist`.

## Aviso

Mayhem Tracker se creó bajo la política "Legal Jibber Jabber" de Riot Games usando recursos de Riot Games. Riot Games no respalda ni patrocina este proyecto.
