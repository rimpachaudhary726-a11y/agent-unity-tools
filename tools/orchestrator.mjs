import { handleBuilderCommand } from "./agents/builder.mjs";
import { handleDecoratorCommand } from "./agents/decorator.mjs";
import { handleInteriorCommand } from "./agents/interior.mjs";
import { handleRemoveCommand } from "./agents/remove.mjs";

/**
 * Orchestrator: the only piece that reads the raw chat message. It does not
 * itself mutate world_state.json -- it decides which specialist agent (or
 * ordered sequence of agents) should handle the request, then delegates.
 * Keeping routing separate from execution means each specialist stays a
 * small, single-purpose function that's easy to retry/fix independently.
 */

const RULES = [
  { name: "remove", test: (c) => /\b(remove|delete|demolish)\b/i.test(c), handler: handleRemoveCommand },
  { name: "interior", test: (c) => /\binterior|room(s)?\b/i.test(c), handler: handleInteriorCommand },
  { name: "decorator", test: (c) => /\btree(s)?|decorat|bench|lamp\b/i.test(c), handler: handleDecoratorCommand },
  { name: "builder", test: (c) => /\bbuild|building(s)?|block\b/i.test(c), handler: handleBuilderCommand },
];

/**
 * @param {object} doc - in-memory world state document, mutated in place by the chosen agent
 * @param {string} command - raw user chat message
 * @returns {{ agent: string, result: object }}
 */
export function routeCommand(doc, command) {
  const rule = RULES.find((r) => r.test(command));
  if (!rule) {
    throw new Error(
      `Orchestrator could not classify command: "${command}". Expected it to mention building/tree/interior/remove.`
    );
  }
  const result = rule.handler(doc, command);
  return { agent: rule.name, result };
}
