import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorldState, saveWorldState } from "./worldStateIo.mjs";
import { routeCommand } from "./orchestrator.mjs";
import { runStructuralChecks, StructuralValidationError } from "./validate.mjs";
import { commitAndPush, waitForCompileCheck, fetchFailureLogs, extractCompilerErrors } from "./github.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
const MAX_RETRIES = 3;

/**
 * End-to-end handling of one chat command:
 *  1. Orchestrator routes to a specialist agent, which mutates world_state.json in memory.
 *  2. Structural checks run locally (fast, free).
 *  3. Changes are committed & pushed, then the real Unity Compile Check workflow is polled.
 *  4. On compile failure, the real compiler errors are reported back and the
 *     agent step is retried (up to MAX_RETRIES) before giving up.
 *
 * Usage: node run-command.mjs "Build a small city block with 3 buildings"
 */
async function main() {
  const command = process.argv.slice(2).join(" ").trim();
  if (!command) {
    console.error('Usage: node run-command.mjs "<chat command>"');
    process.exit(1);
  }

  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRIES) {
    attempt += 1;
    console.log(`\n=== Attempt ${attempt}/${MAX_RETRIES}: "${command}" ===`);

    const doc = await loadWorldState();
    const { agent, result } = routeCommand(doc, command);
    console.log(`Orchestrator -> ${agent} agent`);
    console.log(result.summary);

    try {
      await runStructuralChecks({ worldState: doc });
    } catch (err) {
      if (err instanceof StructuralValidationError) {
        console.error(err.message);
        lastError = err.message;
        continue; // retry: agent logic itself needs fixing, not a compile error
      }
      throw err;
    }

    await saveWorldState(doc);
    console.log(`Wrote ${path.relative(process.cwd(), await import("./worldStateIo.mjs").then((m) => m.WORLD_STATE_PATH))}`);

    const { committed, sha } = await commitAndPush({
      cwd: PROJECT_ROOT,
      message: `${agent}: ${command}`,
    });

    if (!committed) {
      console.log("No changes to commit -- nothing to validate.");
      return { agent, result, worldState: doc };
    }

    console.log(`Pushed ${sha}. Waiting for Unity Compile Check...`);
    const outcome = await waitForCompileCheck({ cwd: PROJECT_ROOT, sha });

    if (outcome.conclusion === "success") {
      console.log(`Compile check passed: ${outcome.htmlUrl}`);
      return { agent, result, worldState: doc, runUrl: outcome.htmlUrl };
    }

    console.error(`Compile check failed: ${outcome.htmlUrl}`);
    const logText = await fetchFailureLogs({ cwd: PROJECT_ROOT, runId: outcome.runId });
    const compilerErrors = extractCompilerErrors(logText);
    lastError = compilerErrors.join("\n") || "Unity Compile Check failed with no extractable compiler errors.";
    console.error("Compiler errors:\n" + lastError);
    // A real fix pass would feed `lastError` back into the responsible
    // agent (e.g. an LLM-backed rewrite of the generated C#) before retrying.
  }

  throw new Error(`Gave up after ${MAX_RETRIES} attempts. Last error:\n${lastError}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
