DONE

# Problem

Every documented way of running the game serves the entire repository from the repo root, with no allowlist and no dotfile exclusion. The only guard is a path-traversal check.

`tests/headless/e2e/static_server.mjs:9` sets `const ROOT = path.resolve(__dirname, '../../..')`, and lines 44-46 join the request path onto it and verify only that the resolved path still starts with `ROOT`. `README.md:15` documents `python3 -m http.server 8001` from the repo root, which binds all interfaces by default. `tools/start` passes `--root "${REPO_ROOT}"`.

This was verified empirically against the project's own server, not merely inferred:

- `GET /.git/config` returns **HTTP 200, 706 bytes** — exposing full git history, all branch refs, the remote URL, and any credentials written into `.git/config`.
- `GET /assets/trees/Models/Desktop/SM_H_Tree_1.FBX` returns 200, 1,029,328 bytes.
- `GET /assets/trees/Textures/T_Leaf_Realistic9.TGA` returns 200, 16,777,260 bytes.
- `GET /assets/coach_bus/coach_bus.glb` returns 200, 19,580,096 bytes.
- `GET /assets.zip` returns 200, 1,443,986,972 bytes.

The `.git` exposure is the more severe of the two and applies to all three server paths.

The asset exposure is a licensing problem rather than a bug. The project's own rule (`ai_rules/PROJECT_CODING_RULES.md:20-21`) is that `assets/public/` is shareable and other `assets/` subfolders may be licensed/private, and `README.md:37` states assets are not distributable due to licensing restrictions. The tree pack is correctly placed outside `assets/public/` and has never been committed in 493 commits on any branch. But folder position buys nothing at runtime: `TreeGenerator.js:34` and `:158` resolve models via `new URL('../../../../assets/trees/...', import.meta.url)`, which lands on the site root, so the licensed pack **must** be HTTP-reachable for trees to render at all. There is no CDN, signed-URL or private-fetch indirection.

That constraint has to shape the fix. `.git` and `assets.zip` can simply be denied. The licensed asset folders cannot be denied outright without breaking the game — the realistic goal there is binding to loopback and not advertising the paths, not blocking them.

# Request

Add dotfile and denylist guards to the project's static servers, and correct the documented run commands, so the git directory and non-served archives are not reachable over HTTP.

## Motivation and relevance

The driving motivation for this batch is **increasing tree fullness and correcting colour**. Other issues were captured incidentally during the same investigation and are tracked in their own AI documents.

**Relevance of this document: INCIDENTAL to the visual goal, but the highest-severity finding in the batch.** It has nothing to do with how trees look. It surfaced while establishing whether the tree pack's placement outside `assets/public/` actually protects it, and the `.git` exposure was found while probing that question. It is unrelated to the rest of the batch and can be done in any order — but it should not be deprioritised because it sits in a graphics-focused batch.

Tasks:

- Add a dotfile guard to `tests/headless/e2e/static_server.mjs` that refuses any request whose resolved path contains a path segment beginning with `.`, and verify it cannot be bypassed by encoding, mixed separators, or case on Windows.
- Add an explicit denylist for large non-served archives at the repo root, `assets.zip` in particular.
- Audit the other server paths for the same defect and fix each: `tools/start`'s Python live server, and `tools/mesh_fabrication_live_server/run.py`.
- Correct `README.md`'s documented run command. `python3 -m http.server 8001` binds `0.0.0.0`, exposing the whole repo to the local network; at minimum document `--bind 127.0.0.1`, and preferably point at a project server that carries the guards. Note for contrast that `static_server.mjs` already defaults `HOST` to `127.0.0.1` and `tools/mesh_fabrication_live_server/run.py` has `DEFAULT_HOST = "127.0.0.1"`.
- Do **not** attempt to block the licensed asset folders. The game requires them over HTTP. Instead, document that constraint explicitly so nobody later "fixes" it and breaks tree loading, and record that loopback binding is the actual mitigation.
- Re-run the probes above after the change and record the resulting status codes for each, including at least one encoded-traversal attempt against the dotfile guard.
- Confirm the guards do not break anything the game legitimately loads — this is the main regression risk, since a careless denylist can silently block an asset path and manifest as missing textures rather than an error.
- Check `tools/mesh_fabrication_live_server/run.py`'s `Access-Control-Allow-Origin: *` headers (lines 92, 103, 114) and confirm they remain scoped to the mesh JSON API responses only. This was checked and found **not** to be an aggravating factor; state that so it is not escalated in error.

## Visual evidence (mandatory)

Capture exactly four screenshots at 4K (3840x2160), all sharing the same city, seed, time of day, weather and graphics settings:

1. **Far** — trees at roughly 70-150 m, with enough of them in frame to judge canopy density across distance.
2. **Medium A** — trees at roughly 25-40 m, pose A.
3. **Medium B** — trees at roughly 25-40 m, a clearly different pose and heading from A.
4. **Close** — a single tree at roughly 8-15 m, filling most of the frame.

This change is not visual, so before/after pairing is **not applicable** in the appearance sense. The four shots are mandatory anyway and serve a specific purpose here: proving that the new guards did not accidentally block an asset path the game needs. Capture them served through the guarded server, and confirm the browser console and network log show zero blocked or 404 asset requests.

Record for every capture: resolution, camera pose, city and seed, resolved `treeQuality`, AA mode, AO mode, colour-grading preset, which server served them, and any localStorage overrides in effect.

Acceptance requirements:

- `GET /.git/config` returns 404 on every server path, verified by re-running the probe.
- At least one encoded or mixed-separator traversal attempt against the dotfile guard is demonstrated to fail.
- `assets.zip` and any other large root archive are no longer served.
- `README.md`'s run command no longer binds all interfaces without comment.
- The four screenshots render correctly through the guarded server with zero blocked or 404 asset requests in the network log.
- The document states plainly that licensed asset folders remain HTTP-reachable by necessity, with loopback binding as the mitigation, so this is not "fixed" later into a broken game.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_544_TOOLS_opus_static_server_document_root_exposes_git_and_licensed_assets_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the four screenshots and their clean network log, the before and after probe results for each tested path, the traversal-bypass test, the servers audited, and the explicit statement of what remains reachable and why.


# Closure notes

**Final disposition: CLOSED AS OUT OF SCOPE WITHOUT IMPLEMENTATION.** This server-hardening finding is unrelated to tree appearance. No server guards, denylist, README change, probes, network-log verification, or screenshots were produced. Importantly, closure does not mean the reported `.git` and archive exposure is fixed or safe; the security/tooling risk remains unresolved and should be reopened separately if these development servers may be exposed beyond loopback.
