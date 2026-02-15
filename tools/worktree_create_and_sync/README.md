# worktreeCreateAndSync

Create (or reuse) a named git worktree and then run `assetSync` inside that worktree.

Default behavior:
- Worktrees root: `../bus_simulator_worktrees`
- Worktree path: `<worktrees_root>/<name>`
- Asset sync command run inside the worktree: `node tools/asset_sync/run.mjs`

## Usage

```bash
node tools/worktree_create_and_sync/run.mjs <name>
```

Example:

```bash
node tools/worktree_create_and_sync/run.mjs graphics
```

## Options

- `--root <path>`: override worktrees root directory
- `--asset-sync-args "<args>"`: forward extra args to `assetSync`
- `--dry-run`: print commands without executing
- `--help`: show usage

Example with forwarded args:

```bash
node tools/worktree_create_and_sync/run.mjs graphics --asset-sync-args "--dry-run"
```
