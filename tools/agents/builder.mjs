import { findTopLevelByType, nextId, makeVector3, makeProperty } from "../worldStateIo.mjs";

/**
 * Builder agent: creates new buildings. Buildings share the generic
 * `BuildingBehaviour` MonoBehaviour (Assets/Scripts/Buildings/BuildingBehaviour.cs)
 * -- appending an entry to world_state.json IS the "scene data" the
 * WorldStateLoader reconciler needs to instantiate it, so no new C# file
 * is required for a standard building. If a request names a style with no
 * existing behaviour, this agent is the extension point for generating a
 * dedicated MonoBehaviour subclass later.
 */

const GRID_SPACING = 6;

/** Parse "add a building at 10,5" / "build ... at (x, y)" -> {x,y} or null. */
function parseExplicitPosition(text) {
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return { x: parseFloat(match[1]), z: parseFloat(match[2]) };
}

/** Parse a leading count like "3 buildings" / "three buildings". Defaults to 1. */
const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
function parseCount(text) {
  const digitMatch = text.match(/(\d+)\s+buildings?/i);
  if (digitMatch) return parseInt(digitMatch[1], 10);
  const wordMatch = text.match(/\b(one|two|three|four|five|six)\s+buildings?/i);
  if (wordMatch) return WORD_NUMBERS[wordMatch[1].toLowerCase()];
  return 1;
}

function nextGridPosition(existingBuildingCount, index) {
  const slot = existingBuildingCount + index;
  return makeVector3(slot * GRID_SPACING, 0, 0);
}

/**
 * @param {object} doc - the in-memory world state document (mutated in place)
 * @param {string} command - the raw user chat command
 * @returns {{ createdIds: string[], summary: string }}
 */
export function handleBuilderCommand(doc, command) {
  const explicitPosition = parseExplicitPosition(command);
  const count = parseCount(command);
  const existingBuildings = findTopLevelByType(doc, "building");
  const createdIds = [];

  for (let i = 0; i < count; i++) {
    const id = nextId(doc, "building");
    const position = explicitPosition && count === 1
      ? makeVector3(explicitPosition.x, 0, explicitPosition.z)
      : nextGridPosition(existingBuildings.length, i);

    doc.objects.push({
      id,
      type: "building",
      position,
      scale: makeVector3(4, 6, 4),
      properties: [makeProperty("style", "default")],
      children: [],
      interior: undefined,
    });
    createdIds.push(id);
  }

  return {
    createdIds,
    summary: `Builder added ${createdIds.length} building(s): ${createdIds.join(", ")}.`,
  };
}
