# Landscape development server

Run `node tools/landscape_server/run.mjs` from this worktree. It serves the viewer at
`http://127.0.0.1:8002/screens/landscape_fabrication.html`. `PORT` can select another
available port; port 8001 is reserved for other worktrees and is rejected.

This server is a development handoff tool, not an offline terrain bake command.
Terrain preparation uses the registered `landscape/coastal-import` bake leaf.
Opening a browser is separate: the server itself uses no GPU. Open the viewer only
while inspecting or testing and close it afterward.

The viewer sends `POST /api/landscape/selection` with its versioned selection JSON.
The server checks the local manifest identity/revision and finite in-bounds
coordinates, limits payloads to 32 KiB, and atomically saves the latest context to
`tests/artifacts/screens/landscape/ai576/selection.latest.json`. The AI can read
that file; `GET /api/landscape/selection` returns the same saved context. No API
can modify terrain in D1. A selection is a provisional coarse inspection sample,
not authorization to apply an exact terrain edit.

The service binds loopback only, rejects unrelated Host/Origin values, and serves
only application source, screen entries, the favicon, and retained landscape
assets. Git metadata, downloads, licensed asset trees, and arbitrary filesystem
paths are not static endpoints. Clipboard/download context still works when the
viewer is served by another static server.

For the existing headless runner, set `E2E_BASE_URL=http://127.0.0.1:8002` while
this server is running. Test browser contexts must close after verification.
