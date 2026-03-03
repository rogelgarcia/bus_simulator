# Mesh Fabrication Live Server

Serve the mesh fabrication screen and expose a conditional mesh endpoint with `ETag` / `Last-Modified` support.

## Run

```bash
python3 tools/mesh_fabrication_live_server/run.py
```

Defaults:
- Host: `127.0.0.1`
- Port: `8765`
- Static root: repo root
- Mesh file: `assets/public/mesh_fabrication/handoff/mesh.live.v1.json`

Useful URLs:
- Screen: `http://127.0.0.1:8765/screens/mesh_fabrication.html`
- Mesh API: `http://127.0.0.1:8765/api/mesh/current`

## Endpoint contract

- `GET /api/mesh/current`
  - `200 OK` with JSON body when mesh changed or first request.
  - `304 Not Modified` when request validators match current mesh.
- Response headers:
  - `ETag`
  - `Last-Modified`
  - `Cache-Control: no-cache, no-store, must-revalidate`
- Request validators honored:
  - `If-None-Match`
  - `If-Modified-Since`

## Optional args

```bash
python3 tools/mesh_fabrication_live_server/run.py --host 0.0.0.0 --port 8877 --root . --mesh-file assets/public/mesh_fabrication/handoff/mesh.live.v1.json
```

## Handoff JSON formatter

Format the mesh handoff JSON deterministically and inline small arrays (for example `position` / `rotation` / `scale`) on one line.

```bash
node tools/mesh_fabrication_live_server/format_handoff_json.mjs --file assets/public/mesh_fabrication/handoff/mesh.live.v1.json
```

Check-only mode:

```bash
node tools/mesh_fabrication_live_server/format_handoff_json.mjs --check
```
