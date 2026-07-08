import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Thin wrapper around git + the GitHub REST API for the validation loop:
 * commit & push the current changes, then poll the real
 * "Unity Compile Check" Actions run for this commit until it finishes.
 *
 * Requires a GitHub token with repo + actions scope in GITHUB_TOKEN (or a
 * `gh` CLI already authenticated) and `origin` pointing at the project's
 * dedicated Unity repo.
 */

async function run(cmd, args, opts = {}) {
  return execFileAsync(cmd, args, { cwd: opts.cwd, env: process.env });
}

/** Push using GITHUB_TOKEN embedded in the remote URL only for the duration of the push, then restore the clean URL so the token never lingers in git config. */
async function pushWithToken(cwd) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is not set. It's required to push (and to poll Actions runs) for this repo.");
  }
  const { stdout: originUrl } = await run("git", ["remote", "get-url", "origin"], { cwd });
  const cleanUrl = originUrl.trim();
  const match = cleanUrl.match(/^https:\/\/(.+)$/);
  if (!match) {
    throw new Error(`Only HTTPS remotes are supported for token-based push. Got: ${cleanUrl}`);
  }
  const authedUrl = `https://x-access-token:${token}@${match[1]}`;
  try {
    await run("git", ["remote", "set-url", "origin", authedUrl], { cwd });
    await run("git", ["push", "origin", "HEAD"], { cwd });
  } finally {
    await run("git", ["remote", "set-url", "origin", cleanUrl], { cwd });
  }
}

export async function commitAndPush({ cwd, message }) {
  await run("git", ["add", "-A"], { cwd });
  const { stdout: statusOut } = await run("git", ["status", "--porcelain"], { cwd });
  if (!statusOut.trim()) {
    return { committed: false, sha: (await run("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim() };
  }
  await run("git", ["commit", "-m", message], { cwd });
  await pushWithToken(cwd);
  const { stdout: sha } = await run("git", ["rev-parse", "HEAD"], { cwd });
  return { committed: true, sha: sha.trim() };
}

function parseOwnerRepo(remoteUrl) {
  const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
  if (!match) throw new Error(`Could not parse owner/repo from remote URL: ${remoteUrl}`);
  return { owner: match[1], repo: match[2] };
}

export async function getOwnerRepo(cwd) {
  const { stdout } = await run("git", ["remote", "get-url", "origin"], { cwd });
  return parseOwnerRepo(stdout.trim());
}

async function githubApi(pathname, { owner, repo }) {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${pathname} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

const WORKFLOW_FILE = "unity-compile-check.yml";

/** Poll until the workflow run for the given commit SHA completes, or timeoutMs elapses. */
export async function waitForCompileCheck({ cwd, sha, timeoutMs = 20 * 60 * 1000, pollIntervalMs = 15000 }) {
  const ownerRepo = await getOwnerRepo(cwd);
  const deadline = Date.now() + timeoutMs;

  let run;
  while (Date.now() < deadline) {
    const runsResponse = await githubApi(`/actions/workflows/${WORKFLOW_FILE}/runs?head_sha=${sha}`, ownerRepo);
    run = runsResponse.workflow_runs?.[0];
    if (run) {
      if (run.status === "completed") {
        return { conclusion: run.conclusion, runId: run.id, htmlUrl: run.html_url };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timed out waiting for Unity Compile Check on commit ${sha}`);
}

/** Fetch the raw job logs for a failed run, for feeding compiler errors back to the responsible agent. */
export async function fetchFailureLogs({ cwd, runId }) {
  const ownerRepo = await getOwnerRepo(cwd);
  const jobs = await githubApi(`/actions/runs/${runId}/jobs`, ownerRepo);
  const failedJob = jobs.jobs.find((j) => j.conclusion === "failure") ?? jobs.jobs[0];
  if (!failedJob) return "";

  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(
    `https://api.github.com/repos/${ownerRepo.owner}/${ownerRepo.repo}/actions/jobs/${failedJob.id}/logs`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  return res.text();
}

/** Pull just the "error CS..." compiler lines out of a raw log blob. */
export function extractCompilerErrors(logText) {
  return logText
    .split("\n")
    .filter((line) => /error CS\d+|Compilation failed/.test(line))
    .map((line) => line.trim());
}
