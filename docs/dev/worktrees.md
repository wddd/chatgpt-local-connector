# Coding lanes

Use a lane only when the dispatching task explicitly assigns one. Create and manage
lanes through `npm run wt`; do not improvise a runnable environment in a lane.

From the main checkout, run `npm run wt -- create <name>`. This creates `wt/<name>`
from main HEAD at `<repository-parent>/<repository-name>.wt/<name>`.
`ARC_WORKTREE_ROOT` overrides the parent directory and must stay outside the repository.
The command clones matching Node dependencies with copy-on-write or runs `npm ci`,
allocates a private Rust target, and builds the frontend resources needed by Tauri.
It prepares both root and relay-worker dependencies. Never symlink node_modules.

If main's target is a symlink, the lane target is a sibling of its resolved destination,
named `<target-name>-wt-<name>`. Otherwise it lives in the lane. Copy-on-write seeding
is optional; unsupported filesystems start cold. Create lanes while main's build is
idle so the seed is stable. Each target has its own Cargo locks and cache budget.
`wt list` reports JSON with ahead/behind main, dirty state and combined dependency/target
disk bytes. Filesystem accounting can count shared copy-on-write blocks for each lane.

The control source creates the lane before dispatching. Pass its absolute path as
`codex_create.project`, then assign the module, lane path and allowed checks in the
prompt. Keep that task in the lane for edits, builds, type checks and commits.
`npm run check` and `npm run check:native` run there. ARC records the thread directory
and turn baseline there, so `codex_changes` reads that lane's changes. `root` only
selects an existing project root; it does not attach an arbitrary external lane to
the main project. ARC's disk permissions must allow the lane directory. An unregistered
lane supplies cwd without a native projectId; ARC does not register it as a project.

Commit the lane changes, then run `npm run wt -- land <name>` from main. Both
checkouts must be clean and main must have `main` checked out. Landing rebases the
lane on main, then merges with `--ff-only`; it never pushes. If rebase conflicts,
resolve the listed files in the lane and run `git rebase --continue`, or abort with
`git rebase --abort`. Retry landing after resolving. Land one lane at a time.

Run the app, `dev`, `dev:isolated`, installs, desktop packaging, releases and all
acceptance serially in main after landing. Shared lane markers make these entry
points refuse in a lane and name main. Markers also protect the private target's
binaries and local replacement candidates. This is a development workflow guard;
keep it in place until the lane is removed.

After acceptance, run `npm run wt -- remove <name>` from main to delete the worktree,
its private target and branch. Unmerged branches and dirty worktrees are retained
unless `--force` is supplied. A failed create leaves its lane registered for repair
or removal with the same command. Do not manually delete the worktree or its target.
