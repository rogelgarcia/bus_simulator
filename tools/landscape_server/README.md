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
coordinates, limits request bodies to 64 KiB, and atomically saves the latest context to
`tests/artifacts/screens/landscape/ai576/selection.latest.json`. The AI can read
that file; `GET /api/landscape/selection` returns the same saved context and
`DELETE /api/landscape/selection` clears it. A click is provisional until native
acquisition succeeds. The AI must use context with `editingReady: true` and its
matching `sourceRevision`.

D2 adds the shared persistent authoring store, also available through
`tools/landscape_authoring/run.mjs`:

| Endpoint | Contract |
| --- | --- |
| `GET /api/landscape/state` | Current revision, revert availability, and bounded authoring limits. |
| `POST /api/landscape/query` | Exact selection from `{x,z,selectionId,expectedRevision,radius?,camera?}`; acquires at most four native chunks and releases them after producing context. |
| `POST /api/landscape/report` | Read-only `{expectedRevision,shape,sampleSpacingMeters,maxSamples?,constraints?}` footprint/corridor survey; one native chunk at a time, explicit sampled resolution and unknown coverage. |
| `POST /api/landscape/apply` | Validated `landscape-edit-batch` JSON; saves immutable payloads/snapshots before atomically switching the manifest. |
| `POST /api/landscape/revert` | `{expectedRevision,batchId?}`; restores the last applied batch's source state as a new revision and retains duplicate-batch protection. |

Mutations require JSON and the local origin; stale, duplicate, invalid, or
over-budget work is rejected with a diagnostic. There is no manual sculpting
toolbar. The AI uses the documented batch format/CLI and the user reloads the
viewer without losing its camera pose. See `specs/landscape/LANDSCAPE_EDITING.md`.
Reports use the same single-working-set admission as edits/queries and cancel
when their request closes. The current manifest is checked again before returning
results. See `specs/landscape/LANDSCAPE_PLANNING_REPORTS.md` for report geometry,
sampling, reservation overlaps, and dependency validation.

Tests can supply `createLandscapeServer({root,landscapeDirectory})` to serve an
isolated copy through the same canonical asset URL. This directory is a trusted
startup option, never a request parameter. Browser tests retain their edited
fixtures and receipts under the prompt's gitignored screenshot artifact folder.

The service binds loopback only, rejects unrelated Host/Origin values, and serves
only application source, screen entries, the favicon, and retained landscape
assets. Git metadata, downloads, licensed asset trees, and arbitrary filesystem
paths are not static endpoints. Clipboard/download context still works when the
viewer is served by another static server.

For the existing headless runner, set `E2E_BASE_URL=http://127.0.0.1:8002` while
this server is running. Test browser contexts must close after verification.
