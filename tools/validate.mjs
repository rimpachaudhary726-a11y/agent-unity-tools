import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Structural pre-flight checks, run before spending a GitHub Actions run.
 * These catch the class of errors that don't need a real Unity compile to
 * detect: filename/class name mismatches, missing required usings, and
 * calls to APIs we've deliberately banned for this project.
 */

const BANNED_APIS = [
  { pattern: /\bFindObjectsOfType\b/, reason: "Deprecated; use FindObjectsByType with a sort mode instead." },
  { pattern: /\bApplication\.LoadLevel\b/, reason: "Obsolete API removed from modern Unity; use SceneManager.LoadScene." },
  { pattern: /\bSystem\.IO\.File\.Delete\s*\(\s*Application\.dataPath/, reason: "Never delete files under Assets/ from generated code." },
];

const REQUIRED_USING_BY_BASE_TYPE = {
  MonoBehaviour: "using UnityEngine;",
};

/** Validate a single generated/updated C# file's structural conventions. */
export async function validateCSharpFile(filePath) {
  const errors = [];
  const source = await readFile(filePath, "utf-8");
  const fileBaseName = path.basename(filePath, ".cs");

  // Filename must match the public class/struct name declared inside it.
  const classMatch = source.match(/\b(?:public|internal)\s+(?:sealed\s+|abstract\s+)?class\s+(\w+)/);
  if (!classMatch) {
    errors.push(`No public/internal class declaration found in ${filePath}.`);
  } else if (classMatch[1] !== fileBaseName) {
    errors.push(
      `Class name "${classMatch[1]}" does not match filename "${fileBaseName}.cs". Unity requires them to match for MonoBehaviours.`
    );
  }

  // Required usings for any MonoBehaviour subclass.
  for (const [baseType, requiredUsing] of Object.entries(REQUIRED_USING_BY_BASE_TYPE)) {
    if (source.includes(`: ${baseType}`) && !source.includes(requiredUsing)) {
      errors.push(`File extends ${baseType} but is missing "${requiredUsing}".`);
    }
  }

  // Banned APIs.
  for (const { pattern, reason } of BANNED_APIS) {
    if (pattern.test(source)) {
      errors.push(`Banned API used (${pattern}): ${reason}`);
    }
  }

  return errors;
}

/** Validate world_state.json against the lightweight schema invariants (not full JSON Schema -- keeps this dependency-free). */
export function validateWorldStateDocument(doc) {
  const errors = [];
  const ALLOWED_TYPES = new Set(["building", "tree", "decoration"]);

  const seenIds = new Set();
  const visit = (obj, pathLabel) => {
    if (!obj.id) errors.push(`${pathLabel}: missing id`);
    if (seenIds.has(obj.id)) errors.push(`${pathLabel}: duplicate id "${obj.id}"`);
    seenIds.add(obj.id);
    if (!ALLOWED_TYPES.has(obj.type)) errors.push(`${pathLabel}: unknown type "${obj.type}"`);
    if (!obj.position || typeof obj.position.x !== "number") errors.push(`${pathLabel}: invalid position`);
    if (!obj.scale || typeof obj.scale.x !== "number") errors.push(`${pathLabel}: invalid scale`);
    for (const child of obj.children ?? []) {
      visit(child, `${pathLabel} > ${child.id ?? "?"}`);
    }
  };

  for (const obj of doc.objects) {
    visit(obj, obj.id ?? "?");
  }

  return errors;
}

/** Run all structural checks for a batch of changed C# files + the world state document. Throws with a combined message if anything fails. */
export async function runStructuralChecks({ changedCSharpFiles = [], worldState }) {
  const errors = [];

  for (const filePath of changedCSharpFiles) {
    errors.push(...(await validateCSharpFile(filePath)));
  }

  if (worldState) {
    errors.push(...validateWorldStateDocument(worldState));
  }

  if (errors.length > 0) {
    throw new StructuralValidationError(errors);
  }
}

export class StructuralValidationError extends Error {
  constructor(errors) {
    super(`Structural validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "StructuralValidationError";
    this.errors = errors;
  }
}
