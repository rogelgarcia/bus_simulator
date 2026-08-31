DONE

# Problem

The `?treeQuality=` URL parameter has no independent resolution branch. `primeTreeQualityPreference()` only *writes* the parsed value into localStorage, and `getResolvedTreeQuality` then reads it back out. When localStorage is unavailable or throws — a private window, blocked site data, exhausted quota — `writeStorageQuality` swallows the error and `readStorageQuality` returns null, so the URL parameter is **silently ignored entirely** and the machine falls back to the auto heuristic.

"URL parameter wins over localStorage" is therefore true only when storage works, which is not what the parameter's existence implies.

This matters more than a normal override bug because of what the fallback does. `TREE_DEFAULTS.quality` is `'auto'`, and `computeAutoQuality()` silently selects the **Mobile** FBX set when `navigator.deviceMemory < 6`, `navigator.hardwareConcurrency <= 4`, or `connection.saveData` is set. The mobile trees are materially different assets, not just cheaper ones: `SM_M_Tree_1.FBX` is 344,960 bytes against `SM_H_Tree_1.FBX`'s 1,029,328, with 190 alpha plates versus 240 and 2,074 triangles versus 8,639 across the catalog. A developer trying to pin desktop trees to reproduce a foliage bug can silently get the mobile set instead and draw the wrong conclusion.

The persistence direction has the same problem in reverse: any past `?treeQuality=mobile` visit is written to `bus_sim.tree_quality.v1` and persists indefinitely, so a machine can stay on mobile trees long after the developer has forgotten why. A grep for that key across the repo returns exactly one hit (`TreeGenerator.js:13`) — nothing in the game, options UI, test harnesses or tools ever writes or clears it other than this path.

There is also a latent inconsistency worth closing while here: `getQuality()` (`TreeGenerator.js:144-148`), used by `getTreeEntries` and as the `loadTreeAssets` cache key, skips localStorage entirely and falls straight through to `computeAutoQuality()`. Today every caller passes an already-resolved `'desktop'` or `'mobile'` so it never diverges, but a future caller passing `'auto'` would ignore a persisted override that `getResolvedTreeQuality` honours.

# Request

Give `?treeQuality=` an independent resolution branch that does not depend on localStorage, and make the resolved tree quality observable so it cannot silently differ from what a developer believes is loaded.

## Motivation and relevance

The driving motivation for this batch is **increasing tree fullness and correcting colour**. Other issues were captured incidentally during the same investigation and are tracked in their own AI documents.

**Relevance of this document: INCIDENTAL, but methodologically important to the batch.** It does not itself make trees fuller. It was found while confirming which tree set the reported screenshots were actually rendering, and it is the reason that question could not be answered with certainty from the code alone. Every other document in this batch depends on knowing which asset set is loaded during its before/after captures — so fixing this makes the rest of the batch's evidence trustworthy. Worth doing early for that reason, despite its low direct visual value.

Tasks:

- Give the URL parameter its own branch in `getResolvedTreeQuality`, evaluated before the localStorage read and independent of whether the write succeeded. Keep the existing write-to-storage behaviour for persistence, but do not make the parameter's effect conditional on it.
- Confirm the precedence order end to end and document it: URL parameter, then persisted localStorage value, then `computeAutoQuality()`, then the `'auto'` default.
- Make the resolved quality observable at runtime. Expose it somewhere a developer can read without a debugger — a console line at city build, a field in the graphics options panel, or a value in the existing debug readout. State where it landed.
- Provide a way to clear the persisted override, since nothing currently does. A `?treeQuality=auto` that clears the key, or an explicit reset control, is sufficient; state which.
- Fix the `getQuality()` inconsistency so it honours a persisted override rather than falling straight to `computeAutoQuality()`, or document explicitly why it must not.
- Verify behaviour in a private window and with site data blocked, which is the condition that exposes the bug. Test both `?treeQuality=desktop` and `?treeQuality=mobile`.
- Confirm the mapping is still fail-safe: `getModelBaseUrl` maps anything not equal to `'desktop'` to `Mobile/`, so a corrupted stored value produces a silent downgrade rather than a broken path. Preserve that property.

## Visual evidence (mandatory)

Capture exactly four screenshots at 4K (3840x2160), all sharing the same city, seed, time of day, weather and graphics settings:

1. **Far** — trees at roughly 70-150 m, with enough of them in frame to judge canopy density across distance.
2. **Medium A** — trees at roughly 25-40 m, pose A.
3. **Medium B** — trees at roughly 25-40 m, a clearly different pose and heading from A.
4. **Close** — a single tree at roughly 8-15 m, filling most of the frame.

Before/after pairing on a normal browser is **not applicable** — where storage works, behaviour is unchanged by design. Instead, capture the four shots twice as a **desktop-versus-mobile pair with `?treeQuality=` pinned in a private window**, which is precisely the case that was broken. That pair doubles as documentation of what the two asset sets actually look like, which no other document in the batch provides.

Record for every capture: resolution, camera pose, city and seed, resolved `treeQuality` **as reported by the new observability hook**, AA mode, AO mode, colour-grading preset, storage availability, and any localStorage overrides in effect.

Acceptance requirements:

- `?treeQuality=desktop` and `?treeQuality=mobile` both take effect in a private window with site data blocked.
- The resolved quality is observable at runtime without a debugger, and the four captures record it from that hook rather than from assumption.
- The persisted override can be cleared by a documented mechanism.
- Precedence order is documented and matches the implementation.
- The `getQuality()` inconsistency is fixed or explicitly justified.
- The desktop-versus-mobile capture pair visibly shows the difference between the two asset sets.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_542_MESHES_opus_tree_quality_url_param_ignored_without_localstorage_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the desktop-versus-mobile capture pair, the documented precedence order, where the observability hook lives, the override-clearing mechanism, and the private-window verification results.


# Closure notes

**Final disposition: CLOSED AS OUT OF SCOPE WITHOUT IMPLEMENTATION.** This URL/localStorage precedence issue does not improve tree appearance. The tree-improvement captures explicitly pinned the resolved quality through working storage, so it did not block their conclusions. No resolution change, observability hook, reset mechanism, private-window verification, or new screenshots were added. The reported edge case remains unresolved and may be reopened as developer-tooling work.
