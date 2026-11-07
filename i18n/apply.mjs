// Convierte una copia del código original en la versión en español, justo antes
// de compilar. Los cambios se hacen sobre la copia de trabajo y nunca se
// commitean: el repo solo guarda esta carpeta i18n/, así que traer una versión
// nueva del autor nunca genera conflictos.
//
// Uso: node apply.mjs [carpeta-de-la-app] [--no-augments]
//
// Cada reemplazo es "obligatorio" u "opcional". Si el autor cambió una línea
// obligatoria (la URL del actualizador, por ejemplo), el script falla en vez de
// compilar en silencio una versión que se actualizaría a la inglesa.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const APP = path.resolve(args.find((a) => !a.startsWith("--")) ?? path.join(HERE, ".."));
const SKIP_AUGMENTS = args.includes("--no-augments");

const UPSTREAM_REPO = "Yhprum/mayhem-tracker";
// GITHUB_REPOSITORY lo define GitHub Actions; en local, el fork de siempre
const FORK_REPO = process.env.GITHUB_REPOSITORY || "Couchraver/mayhem-tracker-es";
const LOCALE_DDRAGON = "es_MX";
const LOCALE_CDRAGON = "es_mx";

const dictionary = JSON.parse(fs.readFileSync(path.join(HERE, "es.json"), "utf8"));
const problems = [];

function patch(rel, edits) {
  const file = path.join(APP, rel);
  let text = fs.readFileSync(file, "utf8");
  for (const { find, replace, optional, all } of edits) {
    const hits = typeof find === "string" ? text.split(find).length - 1 : (text.match(find) ?? []).length;
    if (hits === 0) {
      if (optional) console.warn(`  (opcional) no se encontró en ${rel}: ${find}`);
      else problems.push(`${rel}: no se encontró ${find}`);
      continue;
    }
    if (typeof find === "string") text = all ? text.split(find).join(replace) : text.replace(find, replace);
    else text = text.replace(find, replace);
  }
  fs.writeFileSync(file, text);
  console.log(`  ${rel}`);
}

console.log(`Aplicando la versión en español sobre ${APP}`);

// 1. Traductor de la interfaz
const i18nDir = path.join(APP, "src", "renderer", "i18n");
fs.mkdirSync(i18nDir, { recursive: true });
fs.copyFileSync(path.join(HERE, "runtime.ts"), path.join(i18nDir, "runtime.ts"));
fs.copyFileSync(path.join(HERE, "es.json"), path.join(i18nDir, "es.json"));
patch("src/renderer/main.tsx", [
  // Primero que todo, para que el observador esté antes del primer render
  { find: /^/, replace: 'import "./i18n/runtime";\n' },
]);

// 2. Datos del juego (campeones, objetos, aumentos, hechizos) en español
patch("src/main/dragon.ts", [
  { find: "/data/en_US/champion.json", replace: `/data/${LOCALE_DDRAGON}/champion.json` },
  {
    find: "rcp-be-lol-game-data/global/default/",
    replace: `rcp-be-lol-game-data/global/${LOCALE_CDRAGON}/`,
    all: true,
  },
]);
patch("src/shared/cdragon.ts", [
  {
    find: "rcp-be-lol-game-data/global/default/",
    replace: `rcp-be-lol-game-data/global/${LOCALE_CDRAGON}/`,
    all: true,
  },
]);

// 3. El actualizador busca versiones en este fork, no en el original: si no,
//    la primera actualización reemplazaría la app por la versión en inglés
patch("src/main/updater.ts", [
  { find: `repos/${UPSTREAM_REPO}/releases`, replace: `repos/${FORK_REPO}/releases` },
  { find: `https://github.com/${UPSTREAM_REPO}/`, replace: `https://github.com/${FORK_REPO}/` },
]);
patch("src/renderer/components/Sidebar.tsx", [
  { find: `https://github.com/${UPSTREAM_REPO}/`, replace: `https://github.com/${FORK_REPO}/`, optional: true },
]);

// 4. Ordinales: "1st" -> "1.º"
patch("src/shared/text.ts", [
  {
    find: /export function ordinal\(n: number, locale: string \| undefined\): string \{[\s\S]*?\n\}\n/,
    replace:
      "export function ordinal(n: number, locale: string | undefined): string {\n" +
      "  return `${n.toLocaleString(locale)}.º`;\n}\n",
    optional: true,
  },
]);

// 5. Textos del proceso principal que no pasan por la ventana: menú de la
//    bandeja y títulos de los diálogos de guardar/abrir
const quoted = (s) => JSON.stringify(s);
const mainTexts = ["Show Window", "Quit", "Export Mayhem Data", "Import Mayhem Data", "Export Game Image", "Export Season Recap", "PNG Image"];
for (const rel of ["src/main/index.ts", "src/main/ipc-handlers.ts", "src/main/export-image.ts"]) {
  patch(
    rel,
    mainTexts
      .filter((key) => dictionary[key])
      .map((key) => ({ find: quoted(key), replace: quoted(dictionary[key]), optional: true, all: true })),
  );
}

// 6. Chromium con sus propios textos en español (menú contextual, etc.)
{
  const file = path.join(APP, "package.json");
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.description = "Historial de partidas de ARAM: Caos (versión en español)";
  pkg.build.electronLanguages = [...new Set([...(pkg.build.electronLanguages ?? []), "es-419", "es"])];
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  console.log("  package.json");
}

if (problems.length) {
  console.error("\nEl código original cambió y estos reemplazos ya no aplican:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("Hay que actualizar i18n/apply.mjs antes de compilar.");
  process.exit(1);
}

// 7. Descripciones de aumentos en español: el generador del autor, apuntado a
//    los textos es_mx del juego. Baja ~50MB por parche, por eso se puede saltear.
if (!SKIP_AUGMENTS) {
  const original = path.join(APP, "scripts", "generate-augment-descriptions.mjs");
  const localized = path.join(APP, "scripts", "generate-augment-descriptions.es.mjs");
  let script = fs.readFileSync(original, "utf8");
  const swaps = [
    ["/latest/game/en_us/data/menu/en_us/lol.stringtable.json", "/latest/game/es_mx/data/menu/en_us/lol.stringtable.json"],
    // Solo la lista de aumentos: los íconos de texto no existen por idioma
    ["global/default/v1/cherry-augments.json", `global/${LOCALE_CDRAGON}/v1/cherry-augments.json`],
    ['" bonus"', '" adicional"'],
    ["`1 per ${", "`1 cada ${"],
  ];
  for (const [from, to] of swaps) {
    if (!script.includes(from)) console.warn(`  (opcional) el generador ya no contiene: ${from}`);
    script = script.split(from).join(to);
  }
  fs.writeFileSync(localized, script);
  // El generador también reescribe los íconos y las descripciones; si algo
  // sale mal se vuelve a las del autor, que siempre funcionan
  const keep = ["src/main/augment-descriptions.json", "src/renderer/texticons.json"].map((rel) => {
    const file = path.join(APP, rel);
    return { file, text: fs.readFileSync(file, "utf8") };
  });
  const restore = (entry) => fs.writeFileSync(entry.file, entry.text);
  console.log("\nGenerando descripciones de aumentos en español...");
  try {
    execFileSync(process.execPath, [localized], { cwd: APP, stdio: "inherit" });
    const descriptions = JSON.parse(fs.readFileSync(keep[0].file, "utf8")).descriptions ?? {};
    const before = Object.keys(JSON.parse(keep[0].text).descriptions ?? {}).length;
    if (Object.keys(descriptions).length < before * 0.9) {
      console.warn("Salieron muchas menos descripciones que en inglés; se usan las del autor.");
      restore(keep[0]);
    }
    if (Object.keys(JSON.parse(fs.readFileSync(keep[1].file, "utf8"))).length < Object.keys(JSON.parse(keep[1].text)).length)
      restore(keep[1]);
  } catch {
    // Si CommunityDragon falla, quedan las descripciones en inglés del autor:
    // mejor eso que no publicar la versión
    console.warn("No se pudieron generar; se usan las descripciones en inglés.");
    keep.forEach(restore);
  } finally {
    fs.rmSync(localized, { force: true });
  }
}

console.log("\nListo.");
