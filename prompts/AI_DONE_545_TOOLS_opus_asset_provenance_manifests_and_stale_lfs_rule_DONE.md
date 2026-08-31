DONE

# Problem

The tree pack ships with no licence, readme, attribution or provenance file, and its origin is only recoverable by reading FBX binary internals. Meanwhile `.gitattributes` still carries an LFS rule that matches zero files and implies a public/private boundary that no longer exists.

**Missing provenance.** `assets/trees/` contains only `Models/` and `Textures/`. Nothing in the repo's `LICENSE` (MIT, "Copyright (c) 2026 Rogel Garcia"), `README.md`, `docs/`, `specs/` or source names the tree vendor. The pack's identity had to be extracted from the FBX files themselves:

- `DocumentUrl` / `SrcDocumentUrl` in all 30 files: `E:\Fab\Realistics\Real 9\Game\Realistic_Tree_9\Meshes\Desktop\SM_H_Tree_N.FBX` (Desktop) and `E:\Fab\Realistics\Real 9\Models\Mobile\Game\Realistic_Tree_9\Meshes\Mobile\SM_M_Tree_N.FBX` (Mobile). "Fab" is Epic's marketplace; the UE content folder is `Realistic_Tree_9`.
- Exporter metadata: Title "Unreal FBX Exporter", `Original|ApplicationVendor` = "Epic Games", `Original|ApplicationName` = "Unreal Engine", `Original|ApplicationVersion` = "4.26.2-15973114+++UE4+Release-4.26". Creator "FBX SDK/FBX Plugins version 2020.1.1".
- Texture records leak the original artist's machine paths: `D:\Tree Source\Next Spring\Realistic 9\Textures\T_Trunk.png` and `C:\Users\tehran\Music\Update Unreal pictures\NX_Realistic9\`.
- `Author`, `Keywords`, `Revision` and `Comment` are all empty strings in all 30 files. Creation timestamps: Desktop 2024-12-27 14:36:38-39, Mobile 14:37:49.
- Neither `Downloads/assets.zip` (96 entries) nor the project's `assets.zip` (826 entries) contains any licence, readme, eula, txt, pdf, rtf or doc entry near the tree files. All 34 tree entries are byte-identical by CRC and size across both archives.

The project already meets a higher standard elsewhere: `assets/public/pbr/grass_low_cut_maintained_v2/asset.manifest.json` records `"license": "CC0 1.0"`, and `specs/grass/LOW_CUT_GRASS_MATERIAL_V2.md:168` describes writing source/licence provenance. The trees fail a standard the project set for itself. Note that manifests *do* exist under `assets/public/` (`pbr/_manifest.json`, both grass manifests, `pbr/red_brick/README.md`) — the gap is specifically that no private asset folder has one.

**Stale LFS rule.** `.gitattributes:12` reads `assets/public/** filter=lfs diff=lfs merge=lfs -text`, but `.gitignore:2` is `/assets`, a blanket ignore of the whole tree. `git lfs ls-files` returns empty. The rule matches nothing. Reading `.gitattributes` alone gives the false impression that `assets/public` is committed via LFS and therefore that the public/private split is git-enforced, when in fact neither public nor private assets are tracked at all. Commit `b49f8ad` (2026-02-17) untracked all of `assets/public` and replaced the older `assets/*` ignore with `/assets`; the real negation (`!assets/public/`) had already been removed earlier, around `782ca71`.

For accuracy, the distribution posture itself is sound and should not be "fixed": `git log --all -- assets/trees` returns nothing, and every one of the 29 asset paths ever committed on any branch is under `assets/public/`. No private asset folder has ever existed in any tree object in history. `package.json` is `"private": true` with no build, bundle or publish script.

# Request

Write provenance manifests for the private asset folders following the existing grass-material precedent, and delete the vestigial LFS rule from `.gitattributes`.

## Motivation and relevance

The driving motivation for this batch is **increasing tree fullness and correcting colour**. Other issues were captured incidentally during the same investigation and are tracked in their own AI documents.

**Relevance of this document: INCIDENTAL — documentation and licensing hygiene, zero visual effect.** It came out of establishing what the tree assets actually are, which was needed to reason about them but produces no rendering change. Its practical value is that the pack's origin currently exists nowhere except inside binary files, so it would be lost entirely if anyone needed to answer a licensing question, re-purchase the pack, or check redistribution terms. Independent of every other document in the batch.

Tasks:

- Write `asset.manifest.json` for `assets/trees/`, modelled on `assets/public/pbr/grass_low_cut_maintained_v2/asset.manifest.json`. Record at minimum: pack identity (`Realistic_Tree_9`), source marketplace, exporter and engine version, export date, file inventory with sizes and hashes, and licence status.
- Set the licence field honestly. The terms are **not known** — no licence file was found in any archive or beside the files. Record it as unknown/unverified with the evidence trail, rather than guessing a licence. Flag it as an open item for the project owner to resolve against their purchase records.
- Record the FBX-internal evidence in the manifest or an adjacent note, so the provenance chain does not have to be re-derived from binaries. Include the artist machine paths as identifying strings while noting they are incidental leakage, not a formal vendor declaration.
- Extend the same treatment to the other private asset folders — `city_bus`, `coach_bus`, `double_decker_bus`, `signs`, `ornaments` — or explicitly scope this document to trees and file the rest as follow-up. State which.
- Delete `assets/public/** filter=lfs diff=lfs merge=lfs -text` from `.gitattributes`, and confirm with `git lfs ls-files` and `git check-attr` that nothing depended on it.
- Do **not** change `.gitignore` or attempt to re-track assets. The current distribution posture is correct and deliberate; this document is about documenting it, not altering it. Say so in the summary so a later reader does not mistake the stale-rule deletion for a loosening of the boundary.
- Consider adding a short note to `ai_rules/PROJECT_CODING_RULES.md` or the asset rules stating that private asset folders require a provenance manifest, so the standard is written down rather than implied by the grass precedent.

## Visual evidence (mandatory)

Capture exactly four screenshots at 4K (3840x2160), all sharing the same city, seed, time of day, weather and graphics settings:

1. **Far** — trees at roughly 70-150 m, with enough of them in frame to judge canopy density across distance.
2. **Medium A** — trees at roughly 25-40 m, pose A.
3. **Medium B** — trees at roughly 25-40 m, a clearly different pose and heading from A.
4. **Close** — a single tree at roughly 8-15 m, filling most of the frame.

This change touches only documentation and git configuration, so before/after pairing is **not applicable**. The four shots are mandatory anyway as no-regression evidence, confirming that adding manifest files into asset folders and editing `.gitattributes` did not disturb asset loading — a manifest dropped into a directory that is scanned or globbed at load time can cause real breakage.

Record for every capture: resolution, camera pose, city and seed, resolved `treeQuality`, AA mode, AO mode, colour-grading preset, and any localStorage overrides in effect.

Acceptance requirements:

- `assets/trees/asset.manifest.json` exists, follows the grass-manifest shape, and records the full provenance chain.
- The licence field states unknown/unverified with its evidence, and does not assert terms that were not found.
- The stale `.gitattributes` LFS rule is gone, with `git lfs ls-files` and `git check-attr` output showing nothing depended on it.
- `.gitignore` is unchanged and the summary states explicitly that the distribution posture was deliberately left alone.
- Scope for the other private asset folders is either covered or explicitly deferred.
- The four screenshots confirm no asset-loading regression from the added manifest files.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_545_TOOLS_opus_asset_provenance_manifests_and_stale_lfs_rule_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the four screenshots, the written manifests, the licence-status open item for the project owner, the `git lfs ls-files` and `git check-attr` verification, and the scope decision for the remaining private asset folders.


# Closure notes

**Final disposition: CLOSED AS OUT OF SCOPE WITHOUT IMPLEMENTATION.** Provenance manifests and stale LFS configuration have no effect on tree fullness or colour. No manifests, asset-rule changes, `.gitattributes` edits, LFS verification, or screenshots were produced. The tree pack's licence/provenance remains unknown and unverified, and the vestigial LFS rule remains in place; both may be reopened as asset-governance work. `.gitignore` and all asset files remain unchanged.
