# CityBuilder

A persistent Unity project that grows over time as an AI agent adds, modifies,
and removes objects (buildings, decorations, interiors) in response to chat
commands. `world_state.json` at the repo root is the single source of truth —
nothing is ever regenerated from scratch; every change is an incremental edit
reconciled into the live scene.

This is a standalone project. It has no dependency on any other codebase.

## How it fits together

- **`world_state.json`** — every object in the world: id, type
  (`building` / `tree` / `decoration`), position, scale, free-form
  properties, nested child decorations, and an optional interior room
  layout.
- **`Assets/Scripts/WorldState/WorldStateLoader.cs`** — reads
  `world_state.json` and reconciles the live scene against it (adds new
  objects, updates existing ones by id, removes objects no longer present).
- **`Assets/Scripts/Buildings|Decorations|Interiors/*.cs`** — the generic
  MonoBehaviours attached to instantiated objects.
- **`Assets/Editor/Tests/`** — EditMode tests that (a) force a full Unity
  compile and (b) sanity-check `world_state.json`. These are what
  `unity-test-runner` executes in CI.
- **`tools/`** — the Node.js agent system that turns a chat command into a
  `world_state.json` edit, validates it, and drives the GitHub Actions
  compile-check loop. See "Agent roles" below.
- **`.github/workflows/`** — the one-time license activation workflow and
  the real compile-check workflow that runs on every push.

## One-time setup

### 1. Unity Personal license activation

GitHub Actions needs a Unity license to run the Editor headlessly. This is a
manual, one-time step tied to your own Unity ID:

1. Add two repository secrets under **Settings → Secrets and variables →
   Actions**: `UNITY_EMAIL` and `UNITY_PASSWORD` (your Unity ID credentials).
2. Run the **"Request Unity Activation File"** workflow manually from the
   **Actions** tab (`workflow_dispatch`).
3. Download the `unity-activation-file` artifact it produces (a `.alf` file).
4. Go to <https://license.unity3d.com/manual>, upload the `.alf` file, choose
   **Unity Personal**, and download the resulting `.ulf` license file.
5. Add the **entire contents** of the `.ulf` file as a new repository secret
   named `UNITY_LICENSE`.

After this, every push triggers a real compile check automatically — no
further manual steps.

### 2. Push access

This repo needs a `git` remote (`origin`) pointing at your GitHub repo and
credentials the `tools/` scripts can push with. `GITHUB_TOKEN` (a personal
access token with `repo` + `actions` scope) must be available in the
environment running `tools/run-command.mjs`, so it can poll Actions run
status and fetch logs on failure.

## Agent roles

Each role is a separate, single-purpose function — not one large prompt:

| Role | File | Responsibility |
| --- | --- | --- |
| Orchestrator | `tools/orchestrator.mjs` | Reads the raw chat command, decides which specialist handles it. |
| Builder | `tools/agents/builder.mjs` | Adds new buildings to `world_state.json`. |
| Decorator | `tools/agents/decorator.mjs` | Adds child decorations (trees, benches, lamps) to an existing object. |
| Interior | `tools/agents/interior.mjs` | Generates a nested room layout under a building. |
| Remove | `tools/agents/remove.mjs` | Deletes an object (and everything nested under it). |

## Validation loop

1. **Structural checks** (`tools/validate.mjs`) run first and cost nothing:
   filename/class name match, required `using`s, banned APIs, and
   `world_state.json` shape invariants.
2. **Push + real compile check**: `tools/run-command.mjs` commits, pushes,
   then polls the `Unity Compile Check` GitHub Actions run for that commit.
3. **Retry on real failure**: if the Unity compiler fails, the actual
   `error CS####` lines are pulled from the job log and reported back to the
   responsible agent step. Up to 3 attempts before giving up.

## Running a command

```bash
cd tools
npm install    # no external deps today, but keeps this future-proof
node run-command.mjs "Build a small city block with 3 buildings"
node run-command.mjs "Add trees around the middle building"
node run-command.mjs "Remove the first building"
```

Each invocation prints which agent handled the command, the resulting
summary, and — once license activation is complete — the real GitHub
Actions compile-check result.
