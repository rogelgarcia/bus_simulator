# assetSync

Copies the full `assets/` folder between your main project and the current worktree.

Default source and destination:

- Default mode:
  - Source: `../../bus_simulator/assets`
  - Destination: `./assets`
- Reverse mode (`--reverse`):
  - Source: `./assets`
  - Destination: `../../bus_simulator/assets`

## Run

Dry run (recommended first):

```bash
node tools/asset_sync/run.mjs --dry-run
```

Copy full `assets/` contents:

```bash
node tools/asset_sync/run.mjs
```

Reverse copy (worktree -> main):

```bash
node tools/asset_sync/run.mjs --reverse
```

## Options

- `--from <path>`: override source assets directory
- `--to <path>`: override destination assets directory
- `--reverse`: swap defaults to copy from this worktree into main worktree
- `--dry-run`: print what would happen without copying
- `--help`: show usage
