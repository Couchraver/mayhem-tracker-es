// Recorre el código de la app y junta cada texto en inglés que puede terminar
// en pantalla. El resultado (strings.json) es la lista de claves que es.json
// tiene que cubrir; translate.mjs completa las que falten.
//
// Uso: node extract.mjs [carpeta-de-la-app]   (por defecto, la carpeta de arriba)
//
// Las claves usan {0}, {1}... donde el código interpola algo: el template
// `${n} games` queda como "{0} games", y <p>Backed up {count} games</p> como
// "Backed up {0} games". runtime.ts arma las mismas formas a partir del DOM.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(process.argv[2] ?? path.join(HERE, ".."));
const OUT = path.join(HERE, "strings.json");

// Atributos JSX que son configuración y nunca texto visible. Los demás sí se
// recorren: los componentes de la app reciben texto en props propias
// (subtitle, detail, sub...).
const NON_TEXT_ATTRS =
  /^(className|class|key|to|href|src|id|type|role|style|d|viewBox|fill|stroke\w*|field|name|htmlFor|target|rel|width|height|ref|value|defaultValue|tone|variant|size|color|icon|kind|mode|align|side|as|xmlns|points|transform|cx|cy|r|x\d?|y\d?|on[A-Z]\w*|data-[\w-]+|aria-(hidden|expanded|checked|controls|describedby|labelledby|current|selected|pressed|live)|tabIndex|loading|decoding|draggable|sortKey|storageKey|viewKey|scope)$/;
const SKIP_PARENTS = new Set([
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "ExportAllDeclaration",
  "TSLiteralType",
  "TSImportType",
  "TSExternalModuleReference",
]);
// Llamadas cuyo argumento nunca es texto visible.
const SKIP_CALLEES =
  /^(console\.\w+|require|import|fetch|lcuJson|lcuRequest|getSetting|setSetting|prepare|exec|querySelector\w*|getElementById|addEventListener|removeEventListener|ipcMain\.\w+|ipcRenderer\.\w+|invoke|on|send|sendToRenderer|path\.join|join|split|startsWith|endsWith|includes|replace|replaceAll|match|test|padStart|toLocale\w+String|Intl\.\w+|new URL|URL|Symbol|RegExp|new RegExp)$/;

const normalize = (s) => s.replace(/\s+/g, " ").trim();

// Heurística: ¿parece texto para humanos? Los falsos positivos no rompen nada
// (el traductor los deja igual), pero inflan el diccionario.
// `loose` es para lugares donde casi siempre hay texto visible aunque sea una
// sola palabra en minúscula: JSX ("score") y las ramas de un ternario
// (n === 1 ? "game" : "games").
function looksLikeText(s, loose = false) {
  const literal = s.replace(/\{\d+\}/g, " ").trim();
  // Con huecos alcanza una letra: "{0}W {1}L"
  if (!(/\{\d+\}/.test(s) ? /[A-Za-z]/ : /[A-Za-z]{2,}/).test(literal)) return false;
  if (/:\/\/|^\/|^\.\.?\/|\\|\.(tsx?|json|png|svg|db|exe|ico)\b/i.test(literal)) return false;
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH|PRAGMA)\b/i.test(literal)) return false;
  if (/\b(FROM|WHERE|JOIN|GROUP BY|ORDER BY|THEN)\b/.test(literal)) return false;
  if (/^#[0-9a-f]{3,8}$/i.test(literal)) return false;
  // SQL suelto, comandos de cmd y certificados
  if (
    /\s=\s|^goto |\b[a-z]+_[a-z_]+\b|\s[<>=]=?\s\?|>nul|^copy \/|^start ""|-----BEGIN/.test(literal)
  )
    return false;
  if (literal.length > 60 && !/\s/.test(literal.slice(0, 60))) return false;
  if (/^%[a-z]:/.test(literal)) return false;
  const words = literal.split(/\s+/).filter(Boolean);
  // Clases de Tailwind y similares: todas las palabras con guiones, dos puntos o corchetes
  const classy = words.filter((w) => /[-:[\]/@](?=.)/.test(w) && /^[!@a-z0-9]/.test(w)).length;
  if (classy && classy >= words.length * 0.5) return false;
  if (/^(@echo|if |set |goto |rd |del |timeout |\{"|window\[)/.test(literal)) return false;
  if (
    /^(AND|OR|ASC|DESC|GET|POST|VACUUM|NFKD|JSON|KIWI|NONE|INFO|WARN|ERROR|FATAL)( \{\d+\})?$/.test(
      literal,
    )
  )
    return false;
  if (/\bIN \(|\bdate\(|\.puuid\b|\bMAX\(/.test(literal)) return false;
  // "{0} of {1}": con huecos, una palabra suelta en minúscula también es texto
  if (words.length === 1 && !/\{\d+\}/.test(s)) {
    const w = words[0];
    // Una sola palabra solo cuenta si va con mayúscula ("Wins", "KDA"), y no es
    // un identificador (camelCase, snake_case, CONSTANTE_CON_GUIONES)
    if (!loose && !/^[A-Z]/.test(w)) return false;
    if (/_/.test(w) || /^[A-Z][a-z]+[A-Z]/.test(w)) return false;
  }
  return true;
}

const found = new Map(); // clave -> primer archivo donde aparece

function add(raw, file, loose = false) {
  const key = normalize(raw);
  if (!key || !looksLikeText(key, loose)) return;
  if (!found.has(key)) found.set(key, file);
}

function templateKey(node) {
  let out = "";
  node.quasis.forEach((q, i) => {
    out += q.value.cooked ?? q.value.raw;
    if (i < node.expressions.length) out += `{${i}}`;
  });
  return out;
}

function calleeName(node) {
  const c = node.callee;
  if (!c) return "";
  if (c.type === "Identifier") return c.name;
  if (c.type === "MemberExpression" && c.property?.type === "Identifier") {
    const obj = c.object.type === "Identifier" ? c.object.name + "." : "";
    return obj + c.property.name;
  }
  return "";
}

// Hijos de un elemento JSX que mezcla texto y expresiones ({count}), sin otros
// elementos adentro: en el DOM son nodos de texto hermanos.
function mixedChildrenKey(children) {
  let out = "";
  let n = 0;
  let hasText = false;
  for (const child of children) {
    if (child.type === "JSXText") {
      out += child.value;
      if (child.value.trim()) hasText = true;
    } else if (child.type === "JSXExpressionContainer") {
      if (child.expression.type === "JSXEmptyExpression") continue;
      out += `{${n++}}`;
    } else {
      return null;
    }
  }
  return hasText && n > 0 ? out : null;
}

function walk(node, parent, grand, file, ctx) {
  if (!node || typeof node.type !== "string") return;

  switch (node.type) {
    case "JSXAttribute": {
      const name = node.name?.name;
      if (typeof name !== "string" || NON_TEXT_ATTRS.test(name)) return;
      ctx = { ...ctx, attr: true };
      break;
    }
    case "TaggedTemplateExpression":
    case "TSTypeAnnotation":
    case "TSTypeAliasDeclaration":
    case "TSInterfaceDeclaration":
      return;
    case "CallExpression":
    case "NewExpression":
      if (SKIP_CALLEES.test(calleeName(node))) {
        walk(node.callee, node, parent, file, ctx);
        return;
      }
      break;
    case "BinaryExpression":
      // `x === "foo"` compara contra un valor interno, no muestra nada
      if (/^[=!]==?$/.test(node.operator)) return;
      break;
    case "SwitchCase":
      for (const s of node.consequent) walk(s, node, parent, file, ctx);
      return;
    case "StringLiteral":
      if (SKIP_PARENTS.has(parent?.type)) return;
      if (
        (parent?.type === "ObjectProperty" || parent?.type === "ClassProperty") &&
        parent.key === node &&
        !parent.computed
      )
        return;
      if (parent?.type === "MemberExpression" && parent.property === node) return;
      add(node.value, file, parent?.type === "ConditionalExpression" && parent.test !== node);
      return;
    case "TemplateLiteral":
      add(templateKey(node), file);
      break;
    case "JSXText":
      add(node.value, file, true);
      return;
    case "JSXElement":
    case "JSXFragment": {
      const key = mixedChildrenKey(node.children);
      if (key) add(key, file);
      break;
    }
  }

  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "start" || k === "end" || k === "extra" || k.endsWith("Comments"))
      continue;
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) walk(c, node, parent, file, ctx);
    else if (v && typeof v.type === "string") walk(v, node, parent, file, ctx);
  }
}

function filesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "i18n" || entry.name === "node_modules") continue;
      out.push(...filesUnder(p));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

// El proceso principal también arma textos que la ventana muestra (logros del
// resumen, errores, avisos de actualización), así que entra todo src/.
const files = filesUnder(path.join(APP, "src"));
for (const file of files) {
  const code = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx", "importAttributes", "decorators-legacy"],
      errorRecovery: true,
    });
  } catch (err) {
    console.warn(`No se pudo leer ${file}: ${err.message}`);
    continue;
  }
  walk(ast.program, null, null, path.relative(APP, file).replace(/\\/g, "/"), {});
}

const strings = Object.fromEntries([...found.entries()].sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(OUT, JSON.stringify(strings, null, 2) + "\n");
console.log(
  `${found.size} textos en ${files.length} archivos -> ${path.relative(process.cwd(), OUT)}`,
);
