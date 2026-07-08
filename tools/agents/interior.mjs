import { resolveBuildingReference } from "./decorator.mjs";
import { makeVector3 } from "../worldStateIo.mjs";

/**
 * Interior agent: generates a nested room layout under a building's
 * `interior.rooms`. `InteriorBehaviour.cs` reads this from world_state.json
 * and materializes simple room markers under the building transform.
 */

const DEFAULT_ROOMS = [
  { name: "Lobby", size: makeVector3(3, 3, 3) },
  { name: "Hallway", size: makeVector3(1.5, 3, 4) },
  { name: "Main Room", size: makeVector3(4, 3, 4) },
];

/**
 * @param {object} doc - the in-memory world state document (mutated in place)
 * @param {string} command - the raw user chat command
 * @returns {{ targetId: string, summary: string }}
 */
export function handleInteriorCommand(doc, command) {
  const target = resolveBuildingReference(doc, command);
  if (!target) {
    throw new Error("Interior agent could not find a building to add an interior to -- none exist yet.");
  }

  const rooms = DEFAULT_ROOMS.map((room, index) => ({
    id: `${target.id}-room-${index + 1}`,
    name: room.name,
    position: makeVector3(index * 1.6, 0, 0),
    size: room.size,
  }));

  target.interior = { rooms };

  return {
    targetId: target.id,
    summary: `Interior agent generated ${rooms.length} rooms for ${target.id}: ${rooms.map((r) => r.name).join(", ")}.`,
  };
}
