# Mayhem Tracker en español

Fork de [Yhprum/mayhem-tracker](https://github.com/Yhprum/mayhem-tracker) con la interfaz y los datos del juego en español. Las versiones se publican solas: **descarga `MayhemTracker.exe` de [Releases](https://github.com/Couchraver/mayhem-tracker-es/releases)** y después la app se actualiza sola desde ahí.

## Cómo funciona

El código del autor no se modifica en el repo. Todo lo propio está en esta carpeta, y los cambios se aplican sobre una copia del código original justo antes de compilar. Por eso traer una versión nueva del autor nunca genera conflictos.

| Archivo | Qué hace |
| --- | --- |
| `runtime.ts` | Traduce la interfaz en pantalla usando `es.json`. |
| `es.json` | El diccionario inglés → español. Se puede corregir a mano. |
| `extract.mjs` | Junta en `strings.json` todos los textos en inglés del código. |
| `translate.mjs` | Traduce con Claude los textos de `strings.json` que todavía no están en `es.json`. |
| `apply.mjs` | Prepara la copia para compilar: agrega el traductor, pide los datos del juego en `es_MX`, genera las descripciones de aumentos en español y hace que el actualizador use las releases de este fork. |

La Action [`es-release.yml`](../.github/workflows/es-release.yml) revisa cada 6 horas si el autor publicó una versión. Si hay una nueva, busca textos nuevos, los traduce, compila y publica la release.

## Configuración

- **Traducción automática:** agrega el secreto `ANTHROPIC_API_KEY` en *Settings → Secrets and variables → Actions*. Sin la clave, la versión se publica igual y los textos nuevos quedan en inglés hasta que alguien los traduzca en `es.json`. El resumen de la Action dice cuáles faltan.
- **Corregir una traducción:** edita `es.json` y ejecuta la Action a mano (*Actions → Versión en español → Run workflow*, con "Recompilar" activado).

## Compilar en tu PC

```bash
cd i18n && npm ci && cd ..
npm ci --ignore-scripts
node node_modules/electron/install.js
# en una copia del repo, no en este checkout:
node i18n/apply.mjs <carpeta-de-la-copia>
cd <carpeta-de-la-copia> && npm run dist
```
