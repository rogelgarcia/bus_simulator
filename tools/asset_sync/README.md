# assetSync

Replaces worktree paths with symlinks to the main repo so all worktrees share one data source.

Default mappings:

- `../../bus_simulator/assets` -> `./assets`
- `../../bus_simulator/downloads` -> `./downloads`
- `../../bus_simulator/docs` -> `./docs`

## Run

Dry run (recommended first):

```bash
node tools/asset_sync/run.mjs --dry-run
```

Create/update all 3 symlinks:

```bash
node tools/asset_sync/run.mjs
```

Single mapping override:

```bash
node tools/asset_sync/run.mjs --from ../../bus_simulator/assets --to ./assets
```

## Options

- `--main-root <path>`: override main repo root for default 3 mappings
- `--worktree-root <path>`: override worktree root for default 3 mappings
- `--from <path>`: single source directory override (must be used with `--to`)
- `--to <path>`: single destination path override (must be used with `--from`)
- `--dry-run`: print what would happen without copying
- `--help`: show usage

## Notes

- The destination path is deleted first (`rm -rf` behavior) before creating the symlink.
- This keeps all worktrees on the same shared data for `assets`, `downloads`, and `docs`.
