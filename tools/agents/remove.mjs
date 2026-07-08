import { findTopLevelByType } from "../worldStateIo.mjs";

/**
 * Remove agent: deletes a top-level object (and everything nested under
 * it -- children and interior) from world_state.json. The corresponding
 * live GameObject is removed the next time WorldStateLoader.Reconcile()
 * runs, since its id will no longer be present in the document.
 *
 * Resolves against whichever top-level type the command names (building,
 * tree, decoration) rather than assuming "building" -- a bare "remove the
 * first one" with no type mentioned falls back to buildings since that's
 * the most common top-level object.
 */

const TYPE_KEYWORDS = [
  { type: "tree", pattern: /\btrees?\b/i },
  { type: "decoration", pattern: /\bdecorations?|benches?|lamps?\b/i },
  { type: "building", pattern: /\bbuildings?\b/i },
];

function resolveType(command) {
  const match = TYPE_KEYWORDS.find((k) => k.pattern.test(command));
  return match ? match.type : "building";
}

function resolveTargetIndex(doc, command) {
  const type = resolveType(command);
  const candidates = findTopLevelByType(doc, type);
  if (candidates.length === 0) return -1;

  const numberedMatch = command.match(new RegExp(`${type}\\s+(\\d+)`, "i"));
  if (numberedMatch) {
    const id = `${type}-${numberedMatch[1]}`;
    return doc.objects.findIndex((o) => o.id === id);
  }

  let target = null;
  if (/\bmiddle\b/i.test(command)) {
    target = candidates[Math.floor((candidates.length - 1) / 2)];
  } else if (/\bfirst\b/i.test(command)) {
    target = candidates[0];
  } else if (/\blast\b/i.test(command)) {
    target = candidates[candidates.length - 1];
  } else {
    target = candidates[candidates.length - 1];
  }

  return doc.objects.findIndex((o) => o.id === target.id);
}

/**
 * @param {object} doc - the in-memory world state document (mutated in place)
 * @param {string} command - the raw user chat command
 * @returns {{ removedId: string, summary: string }}
 */
export function handleRemoveCommand(doc, command) {
  const index = resolveTargetIndex(doc, command);
  if (index === -1) {
    throw new Error("Remove agent could not resolve which object to remove.");
  }

  const [removed] = doc.objects.splice(index, 1);

  return {
    removedId: removed.id,
    summary: `Remove agent deleted ${removed.id} (and ${removed.children?.length ?? 0} nested child object(s)).`,
  };
}
