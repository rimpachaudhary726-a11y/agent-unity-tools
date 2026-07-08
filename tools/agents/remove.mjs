import { findTopLevelByType } from "../worldStateIo.mjs";

/**
 * Remove agent: deletes a top-level object (and everything nested under
 * it -- children and interior) from world_state.json. The corresponding
 * live GameObject is removed the next time WorldStateLoader.Reconcile()
 * runs, since its id will no longer be present in the document.
 */

function resolveTargetIndex(doc, command) {
  const buildings = findTopLevelByType(doc, "building");
  if (buildings.length === 0) return -1;

  const numberedMatch = command.match(/building\s+(\d+)/i);
  if (numberedMatch) {
    const id = `building-${numberedMatch[1]}`;
    return doc.objects.findIndex((o) => o.id === id);
  }

  let building = null;
  if (/\bmiddle\b/i.test(command)) {
    building = buildings[Math.floor((buildings.length - 1) / 2)];
  } else if (/\bfirst\b/i.test(command)) {
    building = buildings[0];
  } else if (/\blast\b/i.test(command)) {
    building = buildings[buildings.length - 1];
  } else {
    building = buildings[buildings.length - 1];
  }

  return doc.objects.findIndex((o) => o.id === building.id);
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
