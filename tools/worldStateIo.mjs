import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WORLD_STATE_PATH = path.join(__dirname, "..", "world_state.json");

/** Load world_state.json. Returns a fresh empty document if it doesn't exist yet. */
export async function loadWorldState() {
  try {
    const raw = await readFile(WORLD_STATE_PATH, "utf-8");
    const doc = JSON.parse(raw);
    if (!doc.objects) doc.objects = [];
    if (!doc.version) doc.version = 1;
    return doc;
  } catch (err) {
    if (err.code === "ENOENT") {
      return { version: 1, objects: [] };
    }
    throw err;
  }
}

/** Persist the document back to world_state.json (pretty-printed, stable key order). */
export async function saveWorldState(doc) {
  const json = JSON.stringify(doc, null, 2) + "\n";
  await writeFile(WORLD_STATE_PATH, json, "utf-8");
}

/** Find all top-level objects of a given type, in document order. */
export function findTopLevelByType(doc, type) {
  return doc.objects.filter((o) => o.type === type);
}

/** Find a top-level object by exact id. */
export function findTopLevelById(doc, id) {
  return doc.objects.find((o) => o.id === id);
}

/** Compute the next sequential numeric id for a given type prefix (e.g. "building" -> "building-4"). */
export function nextId(doc, prefix) {
  let max = 0;
  const scan = (objects) => {
    for (const o of objects) {
      const match = typeof o.id === "string" && o.id.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (match) {
        max = Math.max(max, parseInt(match[1], 10));
      }
      if (o.children) scan(o.children);
    }
  };
  scan(doc.objects);
  return `${prefix}-${max + 1}`;
}

export function makeVector3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function makeProperty(key, value) {
  return { key, value: String(value) };
}
