// Completa es.json con los textos de strings.json que todavía no tienen
// traducción, usando la API de Claude. Lo corre la Action cada vez que el
// autor publica una versión; también se puede correr a mano.
//
// Uso: ANTHROPIC_API_KEY=... node translate.mjs
//
// Sin clave no falla: avisa qué falta y esos textos quedan en inglés en la app
// hasta la próxima vez.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STRINGS = path.join(HERE, "strings.json");
const ES = path.join(HERE, "es.json");
const MODEL = process.env.TRANSLATE_MODEL || "claude-sonnet-5-5";
const BATCH = 60;

const strings = JSON.parse(fs.readFileSync(STRINGS, "utf8"));
const es = JSON.parse(fs.readFileSync(ES, "utf8"));
const missing = Object.keys(strings).filter((key) => !(key in es));

if (!missing.length) {
  console.log("es.json ya cubre todos los textos.");
  process.exit(0);
}

console.log(`${missing.length} textos sin traducir:`);
for (const key of missing) console.log(`  ${key}   (${strings[key]})`);

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log("\nSin ANTHROPIC_API_KEY: se quedan en inglés por ahora.");
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### ${missing.length} textos sin traducir\n\nAgregá el secreto \`ANTHROPIC_API_KEY\` o traducilos a mano en \`i18n/es.json\`.\n\n` +
        missing.map((k) => `- \`${k.replace(/`/g, "'")}\``).join("\n") +
        "\n",
    );
  }
  process.exit(0);
}

// Algunas traducciones existentes, para que el tono y los términos sigan igual
const examples = Object.entries(es)
  .filter(([k, v]) => k !== v && k.length < 60)
  .slice(0, 80);

const SYSTEM = `Traduces la interfaz de "Mayhem Tracker", una app de escritorio que registra partidas del modo ARAM: Caos (ARAM Mayhem) de League of Legends, del inglés al español latinoamericano neutro (tuteo, términos del cliente de LoL en español: asesinatos, aumentos, objetos, campeones, partida, súbditos, torreta, inhibidor, nexo).

Reglas:
- Conserva exactamente los marcadores {0}, {1}... (pueden cambiar de orden si el español lo pide) y los espacios al principio o al final.
- Mantén siglas de juego como KDA, MVP, ACE, CS, PNG, JSON, LCU.
- Textos breves de botones y columnas deben seguir siendo breves.
- Si un texto no es para el usuario (un identificador, una clave interna, SQL, una ruta, un comando), devuélvelo sin cambios.
- Responde solo con un objeto JSON {"original": "traducción", ...} con exactamente las claves recibidas.`;

async function translateBatch(keys) {
  const body = {
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `Ejemplos ya traducidos, para mantener el estilo:\n${JSON.stringify(Object.fromEntries(examples), null, 1)}\n\n` +
          `Traduce estos textos. Al lado de cada uno va el archivo donde aparece, como contexto:\n` +
          JSON.stringify(Object.fromEntries(keys.map((k) => [k, strings[k]])), null, 1),
      },
    ],
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.map((c) => c.text ?? "").join("") ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json);
}

const placeholders = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join();
let added = 0;
for (let i = 0; i < missing.length; i += BATCH) {
  const keys = missing.slice(i, i + BATCH);
  const result = await translateBatch(keys);
  for (const key of keys) {
    const value = result[key];
    // Una traducción que pierde o inventa un marcador mostraría basura
    if (typeof value !== "string" || placeholders(value) !== placeholders(key)) {
      console.warn(`  descartada: ${key} -> ${value}`);
      continue;
    }
    es[key] = value;
    added++;
  }
}

const sorted = Object.fromEntries(Object.entries(es).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(ES, JSON.stringify(sorted, null, 2) + "\n");
console.log(`\nSe agregaron ${added} traducciones a es.json.`);
