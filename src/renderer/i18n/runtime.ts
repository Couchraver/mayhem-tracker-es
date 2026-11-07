// Traduce la interfaz al español directamente en el DOM: los componentes
// siguen escribiendo sus textos en inglés y este archivo los reemplaza con
// es.json. Al agregar textos nuevos, i18n/extract.mjs los encuentra e
// i18n/translate.mjs los traduce.
//
// Cada nodo de texto se compara contra el diccionario de dos formas:
//   - exacta: "Match History" -> "Historial de partidas"
//   - con huecos: "{0}d ago" -> "hace {0} d", donde {n} es lo que el código
//     interpoló (un número, un nombre...)
// Un elemento cuyos hijos son solo nodos de texto (<p>Backed up {n} games</p>
// en JSX) se prueba primero como frase entera, que es como extract.mjs la
// guardó; si no hay coincidencia, se traduce cada nodo por separado.
//
// Se guarda el texto original de cada nodo: cuando React lo cambia, se vuelve
// a traducir desde el inglés y no desde la traducción anterior.

import dictionary from "./es.json";

type Pattern = { regex: RegExp; template: string; order: number[]; literal: string };

const exact = new Map<string, string>();
const patterns: Pattern[] = [];

for (const [key, value] of Object.entries(dictionary as Record<string, string>)) {
  if (!value || value === key) continue;
  if (!/\{\d+\}/.test(key)) {
    exact.set(key, value);
    continue;
  }
  const literal = key.replace(/\{\d+\}/g, "");
  if (!/[A-Za-z]/.test(literal)) continue;
  // Con tan poco texto fijo ("{0}W"), los huecos solo aceptan números: si no,
  // "{0}L" coincidiría con cualquier palabra terminada en L
  // Con una sola palabra fija ("{0} games"), cada hueco es una sola palabra:
  // así "{0} of {1}" no se come frases enteras que no tienen traducción.
  const words = literal.match(/[A-Za-z]+/g) ?? [];
  const hole = !/[A-Za-z]{2,}/.test(literal)
    ? "([\\d.,\\s\\u00a0\\u202fº%]+)"
    : words.length === 1
      ? "(\\S+)"
      : "([\\s\\S]*?)";
  const order: number[] = [];
  const source = key
    .split(/(\{\d+\})/)
    .map((part) => {
      const m = part.match(/^\{(\d+)\}$/);
      if (m) {
        order.push(Number(m[1]));
        return hole;
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  patterns.push({ regex: new RegExp(`^${source}$`), template: value, order, literal });
}
// Los patrones con más texto fijo son más específicos: van primero
patterns.sort((a, b) => b.literal.length - a.literal.length);

function lookup(text: string): string | null {
  const hit = exact.get(text);
  if (hit !== undefined) return hit;
  if (!/[A-Za-z]/.test(text)) return null;
  for (const p of patterns) {
    const m = p.regex.exec(text);
    if (!m) continue;
    const values: Record<number, string> = {};
    p.order.forEach((n, i) => (values[n] = m[i + 1]));
    return p.template.replace(/\{(\d+)\}/g, (_, n) => {
      const v = values[Number(n)] ?? "";
      // Lo interpolado puede ser a su vez un texto traducible ("Day", "kills")
      return lookup(v.trim()) ?? v;
    });
  }
  // `${n} ${n === 1 ? "game" : "games"}` llega como "4 games": el número se
  // deja y se traduce el resto
  const counted = /^([\d.,%  ]+[kKM]?\s+)(.*[A-Za-z].*)$/.exec(text);
  if (counted) {
    const rest = lookup(counted[2]);
    if (rest !== null) return counted[1] + rest;
  }
  return null;
}

// Mantiene los espacios de los bordes: React separa "Backed up " y " games".
function translateText(original: string): string | null {
  const trimmed = original.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  const out = lookup(trimmed);
  if (out === null) return null;
  const lead = /^\s/.test(original) ? " " : "";
  const trail = /\s$/.test(original) ? " " : "";
  return lead + out + trail;
}

const originals = new WeakMap<Text, string>();
const written = new WeakMap<Text, string>();

// El texto en inglés que React puso en el nodo. Si el valor actual no es el
// que escribimos nosotros, React lo cambió y ese pasa a ser el original.
function originalOf(node: Text): string {
  const current = node.nodeValue ?? "";
  if (written.get(node) !== current) originals.set(node, current);
  return originals.get(node) ?? current;
}

function write(node: Text, value: string) {
  written.set(node, value);
  if (node.nodeValue !== value) node.nodeValue = value;
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE"]);

function skipped(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName) || e.hasAttribute("data-no-translate")) return true;
    if ((e as HTMLElement).isContentEditable) return true;
  }
  return false;
}

function translateElementText(el: Element) {
  const nodes = Array.from(el.childNodes);
  if (nodes.length < 2 || !nodes.every((n) => n.nodeType === Node.TEXT_NODE)) return false;
  const texts = nodes as Text[];
  const joined = texts.map(originalOf).join("");
  const out = translateText(joined);
  if (out === null) return false;
  write(texts[0], out);
  for (const t of texts.slice(1)) write(t, "");
  return true;
}

function translateNode(node: Text) {
  const parent = node.parentElement;
  if (!parent || skipped(parent)) return;
  if (translateElementText(parent)) return;
  const original = originalOf(node);
  const out = translateText(original);
  write(node, out ?? original);
}

const ATTRS = ["title", "placeholder", "aria-label", "alt"];
const attrOriginals = new WeakMap<Element, Map<string, string>>();
const attrWritten = new WeakMap<Element, Map<string, string>>();

function translateAttrs(el: Element) {
  for (const attr of ATTRS) {
    const current = el.getAttribute(attr);
    if (current === null) continue;
    let orig = attrOriginals.get(el);
    let done = attrWritten.get(el);
    if (!orig) attrOriginals.set(el, (orig = new Map()));
    if (!done) attrWritten.set(el, (done = new Map()));
    if (done.get(attr) !== current) orig.set(attr, current);
    const out = translateText(orig.get(attr) ?? current);
    if (out === null) continue;
    done.set(attr, out);
    if (current !== out) el.setAttribute(attr, out);
  }
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (skipped(el)) return;
  translateAttrs(el);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateNode(n as Text);
    else translateAttrs(n as Element);
  }
}

// Los cambios se juntan y se procesan en el mismo microtask, antes de que el
// navegador pinte: no se llega a ver el texto en inglés.
let pending = new Set<Node>();
let scheduled = false;

function flush() {
  scheduled = false;
  const batch = pending;
  pending = new Set();
  observer.disconnect();
  try {
    for (const node of batch) if (node.isConnected) translateTree(node);
  } finally {
    observe();
  }
}

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === "childList") m.addedNodes.forEach((n) => pending.add(n));
    else if (m.type === "characterData") pending.add(m.target);
    else if (m.type === "attributes") pending.add(m.target);
  }
  if (!scheduled && pending.size) {
    scheduled = true;
    queueMicrotask(flush);
  }
});

function observe() {
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
}

document.documentElement.lang = "es";
translateTree(document.documentElement);
observe();

// Para el título de la ventana y los diálogos nativos que el renderer abre
const nativeConfirm = window.confirm.bind(window);
window.confirm = (message?: string) =>
  nativeConfirm(message && (translateText(message) ?? message));
