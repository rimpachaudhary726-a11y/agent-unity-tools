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

/** Split a compound chat message into ordered clauses ("build X, then add trees, and remove Y"). */
function splitClauses(command) {
  return command
    .split(/,?\s+\bthen\b\s+|,?\s+\band\s+(?=\w)/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

function routeClause(doc, clause, options) {
  const rule = RULES.find((r) => r.test(clause));
  if (!rule) {
    throw new Error(
      `Orchestrator could not classify command: "${clause}". Expected it to mention building/tree/interior/remove.`
    );
  }
  const result = rule.handler(doc, clause, options);
  return { agent: rule.name, clause, result };
}

/**
 * @param {object} doc - in-memory world state document, mutated in place by the chosen agent(s)
 * @param {string} command - raw user chat message, possibly compound ("build 3 buildings and add trees")
 * @param {{ compilerFeedback?: string }} [options] - real compiler errors from a previous failed
 *   attempt at this same command, for agents that generate bespoke C# to react to. Today's
 *   Builder/Decorator/Interior/Remove agents only edit world_state.json against generic,
 *   already-compiling MonoBehaviours, so they don't consume this yet -- it's threaded through
 *   as the extension point for future agents that do generate per-object C#.
 * @returns {{ agent: string, result: object }} for a single-clause command (back-compat), plus
 *   `steps` holding every clause's {agent, clause, result} in execution order.
 */
export function routeCommand(doc, command, options = {}) {
  const clauses = splitClauses(command);
  const steps = clauses.map((clause) => routeClause(doc, clause, options));
  const last = steps[steps.length - 1];
  return { agent: last.agent, result: last.result, steps };
}
