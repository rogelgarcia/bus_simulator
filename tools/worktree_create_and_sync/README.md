# worktreeCreateAndSync

Create (or reuse) a named git worktree and then run `assetSync` inside that worktree.

Default behavior:
- Worktrees root: `../bus_simulator_worktrees`
- Worktree path: `<worktrees_root>/<name>`
- Shared-path sync command run inside the worktree: `node tools/asset_sync/run.mjs`
- Default synced paths:
  - `assets`
  - `downloads`
  - `docs`

## Usage

```bash
bash tools/worktree_create_and_sync/run.sh <name>
```

Example:

```bash
bash tools/worktree_create_and_sync/run.sh graphics
```

## Options

- `--root <path>`: override worktrees root directory
- `--dry-run`: print commands without executing
- `--help`: show usage

Dry run:

```bash
bash tools/worktree_create_and_sync/run.sh graphics --dry-run
```

Notes:
- The shell script attempts `node tools/asset_sync/run.mjs` inside the target worktree.
- If `node` is not available in the runtime environment, it falls back to shell symlink creation for `assets/`, `downloads/`, and `docs/`.
