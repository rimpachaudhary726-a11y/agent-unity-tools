import { findTopLevelByType, nextId, makeVector3, makeProperty } from "../worldStateIo.mjs";

/**
 * Decorator agent: adds child decoration objects (trees, benches, lamps)
 * to an existing world object. Decorations share the generic
 * `DecorationBehaviour` MonoBehaviour -- appending to the parent's
 * `children` array in world_state.json is the scene data the
 * WorldStateLoader needs to instantiate them under the parent transform.
 */

const RING_RADIUS = 5;
const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

function parseCount(text, fallback) {
  const digitMatch = text.match(/(\d+)\s+trees?/i);
  if (digitMatch) return parseInt(digitMatch[1], 10);
  const wordMatch = text.match(/\b(one|two|three|four|five|six|seven|eight)\s+trees?/i);
  if (wordMatch) return WORD_NUMBERS[wordMatch[1].toLowerCase()];
  return fallback;
}

/** Resolve which building a command refers to: "building 3", "the middle building", "the first building", "the last building". */
export function resolveBuildingReference(doc, command) {
  const buildings = findTopLevelByType(doc, "building");
  if (buildings.length === 0) return null;

  const numberedMatch = command.match(/building\s+(\d+)/i);
  if (numberedMatch) {
    const byId = buildings.find((b) => b.id === `building-${numberedMatch[1]}`);
    if (byId) return byId;
  }

  if (/\bmiddle\b/i.test(command)) {
    return buildings[Math.floor((buildings.length - 1) / 2)];
  }
  if (/\bfirst\b/i.test(command)) {
    return buildings[0];
  }
  if (/\blast\b/i.test(command)) {
    return buildings[buildings.length - 1];
  }

  // Default: most recently created building.
  return buildings[buildings.length - 1];
}

/**
 * @param {object} doc - the in-memory world state document (mutated in place)
 * @param {string} command - the raw user chat command
 * @returns {{ targetId: string, createdIds: string[], summary: string }}
 */
export function handleDecoratorCommand(doc, command) {
  const target = resolveBuildingReference(doc, command);
  if (!target) {
    throw new Error("Decorator could not find a building to decorate -- none exist yet.");
  }

  const kind = /\bbench(es)?\b/i.test(command)
    ? "bench"
    : /\blamp(s)?\b/i.test(command)
    ? "lamp"
    : "tree";

  const count = parseCount(command, kind === "tree" ? 6 : 4);
  const createdIds = [];

  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    const id = nextId(doc, kind);
    target.children.push({
      id,
      type: kind === "tree" ? "tree" : "decoration",
      position: makeVector3(
        Math.round(Math.cos(angle) * RING_RADIUS * 100) / 100,
        0,
        Math.round(Math.sin(angle) * RING_RADIUS * 100) / 100
      ),
      scale: makeVector3(1, 1, 1),
      properties: [makeProperty("kind", kind)],
      children: [],
    });
    createdIds.push(id);
  }

  return {
    targetId: target.id,
    createdIds,
    summary: `Decorator added ${createdIds.length} ${kind}(s) around ${target.id}: ${createdIds.join(", ")}.`,
  };
}
