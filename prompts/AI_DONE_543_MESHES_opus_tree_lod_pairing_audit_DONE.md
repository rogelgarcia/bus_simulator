DONE

# Problem

The Desktop and Mobile tree sets are treated as a quality pair — `getModelBaseUrl` selects one folder or the other from the resolved `treeQuality` — but the pairing is not actually monotonic. At least one Mobile tree is more expensive than most of the Desktop set.

A full census of all 30 FBX files (Blender 5.2 headless, per-material and per-loose-component triangle counts):

| | Desktop | Mobile |
|---|---|---|
| triangles per tree | 5,534 - 9,828 (mean 8,445) | 1,972 - 5,506 (mean 2,602) |
| trunk / branches / plates | 5.8% / 82.9% / 11.3% | 8.8% / 74.8% / 16.4% |
| alpha plates per tree | 152 - 280 (4 tris each) | 136 - 232 (mostly 2 tris) |
| catalog total | 126,679 tris | 39,042 tris |

The catalog-wide ratio is only **3.24x**, not the order of magnitude the Desktop/Mobile naming implies. And the outliers are worse than the aggregate suggests:

- **`SM_M_Tree_14` is 5,506 triangles** — heavier than 8 of the 15 Desktop trees, and 79% of its own Desktop counterpart `SM_H_Tree_14` (6,920). It is also the only Mobile tree with 4-triangle plates rather than 2, and it has *fewer* plates than its desktop pair (136 vs 152) while costing far more, so the extra cost is in branch geometry, not foliage.
- `SM_M_Tree_13` (3,906) is also well above the mobile mean of 2,602.
- On the other end, `SM_H_Tree_15` (5,534) is the cheapest Desktop tree and costs less than `SM_M_Tree_14`.

Branch geometry dominates both sets — 82.9% of the desktop budget and 74.8% of the mobile budget — while alpha plates cost 11-16%. Any future effort to reduce tree cost belongs in branch tubes, not foliage, which is worth recording since the intuition usually runs the other way.

This is upstream asset data from a third-party pack, so the fix is a mapping or re-export decision, not a code change.

# Request

Audit the Desktop-to-Mobile LOD pairing across the catalog and correct the outliers so that every Mobile tree is genuinely cheaper than its Desktop counterpart.

## Motivation and relevance

The driving motivation for this batch is **increasing tree fullness and correcting colour**. Other issues were captured incidentally during the same investigation and are tracked in their own AI documents.

**Relevance of this document: INCIDENTAL — asset hygiene and performance, not appearance.** It was found while taking the triangle census that underpins the rest of the batch. It has essentially no effect on how full or how well-coloured trees look; its value is that the mobile quality tier currently does not reliably deliver the saving it promises. Lowest priority in the batch. Do not let it block AI 537.

Tasks:

- Reproduce the census independently rather than trusting the table above. Import all 30 FBX files and record per-tree totals, per-material-slot splits, loose-component counts, and plate counts and plate triangle sizes.
- Establish what the pairing is supposed to guarantee. Decide and state the invariant — for example, every Mobile tree must be at most some fraction of its Desktop counterpart's triangle count — before deciding which trees violate it.
- Investigate `SM_M_Tree_14` specifically. Determine whether it is a mis-exported file, a mispaired index, or a genuinely different source tree. Its 4-triangle plates are anomalous for the mobile set and are a strong hint about which.
- Decide the remedy per outlier and justify it: re-export a proper low-poly version, remap the index so the pairing is correct, or accept and document the cost. Prefer a derived artifact over editing the vendor FBX in place, since the pack is third-party licensed content.
- Confirm the visual pairing is still sensible after any remap. Two trees that pair well by triangle count but look nothing alike will pop visibly when quality switches.
- Report the corrected catalog totals and the new worst-case Mobile tree.
- Record the branch-versus-foliage cost split in the summary, since it is the actionable fact for any future tree budget work.

## Visual evidence (mandatory)

Capture exactly four screenshots at 4K (3840x2160), all sharing the same city, seed, time of day, weather and graphics settings:

1. **Far** — trees at roughly 70-150 m, with enough of them in frame to judge canopy density across distance.
2. **Medium A** — trees at roughly 25-40 m, pose A.
3. **Medium B** — trees at roughly 25-40 m, a clearly different pose and heading from A.
4. **Close** — a single tree at roughly 8-15 m, filling most of the frame.

Where any tree is re-exported or remapped, capture the full set **before and after** with `?treeQuality=mobile` pinned, from byte-identical camera poses, and present them as before/after pairs — the point is to prove the cheaper asset did not become visibly worse. Where a tree is accepted and documented rather than changed, before/after pairing is not applicable and the four shots serve as a record of current state.

Additionally include a side-by-side of `SM_H_Tree_14` and `SM_M_Tree_14` at the close pose, since that specific pair is the subject of the audit.

Record for every capture: resolution, camera pose, city and seed, resolved `treeQuality`, AA mode, AO mode, colour-grading preset, and any localStorage overrides in effect.

Acceptance requirements:

- An independently reproduced census table for all 30 files is included.
- The pairing invariant is stated before the outlier list, not derived to fit it.
- Every Mobile tree satisfies the invariant, or its exception is explicitly documented with a reason.
- `SM_M_Tree_14`'s root cause is identified, not merely worked around.
- Remapped pairs are visually compatible, evidenced by the close-pose comparison.
- The vendor FBX files are not modified in place unless that choice is explicitly justified against the pack's licensing status.
- Corrected catalog totals and the branch-versus-foliage cost split are reported.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_543_MESHES_opus_tree_lod_pairing_audit_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the census table, the stated invariant, the per-outlier remedy and justification, the `SM_H_Tree_14` versus `SM_M_Tree_14` comparison, the corrected totals, and the four screenshots.


# Closure notes

**Final disposition: CLOSED AS OUT OF SCOPE WITHOUT IMPLEMENTATION.** This is a mobile asset-budget audit, not a tree-fullness or colour improvement. The census in this prompt remains investigative context; it was not independently reproduced as an AI543 deliverable. No pairing invariant, outlier root-cause determination, remap, re-export, asset modification, corrected totals, or new screenshots were produced. Current Desktop/Mobile assets remain unchanged.
