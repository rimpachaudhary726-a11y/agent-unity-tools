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
async function run(cmd, args, cwd) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  return promisify(execFile)(cmd, args, { cwd });
}

/** Undo a failed attempt entirely (local commit + remote push) so the next retry starts from the same clean base instead of piling more changes on top. */
async function rollbackToBaseline(cwd, baselineSha) {
  await run("git", ["reset", "--hard", baselineSha], cwd);
  const token = process.env.GITHUB_TOKEN;
  if (!token) return; // nothing was pushed remotely without a token
  const { stdout: originUrl } = await run("git", ["remote", "get-url", "origin"], cwd);
  const cleanUrl = originUrl.trim();
  const match = cleanUrl.match(/^https:\/\/(.+)$/);
  if (!match) return;
  const authedUrl = `https://x-access-token:${token}@${match[1]}`;
  try {
    await run("git", ["remote", "set-url", "origin", authedUrl], cwd);
    await run("git", ["push", "--force", "origin", "HEAD"], cwd);
  } finally {
    await run("git", ["remote", "set-url", "origin", cleanUrl], cwd);
  }
}

async function main() {
  const command = process.argv.slice(2).join(" ").trim();
  if (!command) {
    console.error('Usage: node run-command.mjs "<chat command>"');
    process.exit(1);
  }

  const { stdout: baselineShaRaw } = await run("git", ["rev-parse", "HEAD"], PROJECT_ROOT);
  const baselineSha = baselineShaRaw.trim();

  let attempt = 0;
  let lastError = null;
  let compilerFeedback = null; // set from a failed attempt's real compiler output; passed to the agent on retry

  while (attempt < MAX_RETRIES) {
    attempt += 1;
    console.log(`\n=== Attempt ${attempt}/${MAX_RETRIES}: "${command}" ===`);

    const doc = await loadWorldState();
    const { agent, result, steps } = routeCommand(doc, command, { compilerFeedback });
    for (const step of steps) {
      console.log(`Orchestrator -> ${step.agent} agent ("${step.clause}")`);
      console.log(step.result.summary);
    }

    try {
      await runStructuralChecks({ worldState: doc });
    } catch (err) {
      if (err instanceof StructuralValidationError) {
        console.error(err.message);
        lastError = err.message;
        continue; // agent logic itself needs fixing, not a compile error -- nothing was written or pushed yet
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

    if (compilerErrors.length === 0) {
      // Nothing our agents could act on (e.g. missing UNITY_LICENSE, runner
      // infra issue) -- retrying would just duplicate work for no benefit.
      await rollbackToBaseline(PROJECT_ROOT, baselineSha);
      throw new Error(
        `Unity Compile Check failed with no extractable compiler errors (likely a CI/license setup issue, not a code problem). See ${outcome.htmlUrl}. Rolled back to keep world_state.json clean.`
      );
    }

    lastError = compilerErrors.join("\n");
    console.error("Compiler errors:\n" + lastError);
    compilerFeedback = lastError;

    // Undo this attempt's commit/push before the responsible agent retries
    // from a clean base with the real compiler errors as feedback.
    await rollbackToBaseline(PROJECT_ROOT, baselineSha);
  }

  throw new Error(`Gave up after ${MAX_RETRIES} attempts. Last compiler errors:\n${lastError}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
