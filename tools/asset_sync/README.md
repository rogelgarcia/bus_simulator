# assetSync

Copies the full `assets/` folder from your main project into the current worktree.

Default source and destination:

- Source: `../../bus_simulator/assets`
- Destination: `./assets`

## Run

Dry run (recommended first):

```bash
node tools/asset_sync/run.mjs --dry-run
```

Copy full `assets/` contents:

```bash
node tools/asset_sync/run.mjs
```

## Options

- `--from <path>`: override source assets directory
- `--to <path>`: override destination assets directory
- `--dry-run`: print what would happen without copying
- `--help`: show usage
