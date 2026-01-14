# Redirect Export Detector

Identifies JavaScript modules that act as **redirect re-export shims** (files that only re-export from other modules).

This is useful for auditing and cleaning up temporary re-export modules that accumulate during refactors.

## Run

```bash
node tools/redirect_export_detector/run.mjs
```

By default it scans `src/**/*.js`.

## Inputs

- Optional positional arguments: one or more root paths to scan instead of `src`.
  - Each path can be a directory or a single `.js` file.

## Output

Default output is human-readable:

- The shim file path
- The `from` targets it re-exports
- A short reason string

For machine-readable output, use:

```bash
node tools/redirect_export_detector/run.mjs --json
```

## Example usage

Scan default roots:

```bash
node tools/redirect_export_detector/run.mjs
```

Scan multiple roots:

```bash
node tools/redirect_export_detector/run.mjs src tests
```

JSON output:

```bash
node tools/redirect_export_detector/run.mjs --json src
```

