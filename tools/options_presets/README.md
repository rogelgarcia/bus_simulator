# Options Presets

Exports and promotes in-game Options presets to project defaults.

## Export / Import (in-game)

- Open Options (key `0`)
- Use `Export` to download a JSON preset (also attempts to copy to clipboard)
- Use `Import` to load a preset file into the current Options draft (apply + save if desired)

## Promote a preset to project defaults (dev workflow)

Dry-run (prints the updated defaults blocks for review):

```bash
node tools/options_presets/promote_to_defaults.mjs path/to/bus_sim_options_preset.json
```

Apply (writes updated defaults into source files):

```bash
node tools/options_presets/promote_to_defaults.mjs path/to/bus_sim_options_preset.json --write
```

Limit to specific groups:

```bash
node tools/options_presets/promote_to_defaults.mjs path/to/preset.json --write --only=lighting,bloom,sunFlare
```

