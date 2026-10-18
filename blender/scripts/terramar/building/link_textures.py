# link_textures.py -- point the Terra & Mar baseline's packed textures back at the game's own asset files (AI 614).
#
# Adapted COPY of authoring/BradburyBlock/link_game_textures.py (which stays untouched). Differences:
# - the candidate files are not a hardcoded material list: they are the texture URLs the export manifest
#   recorded for every exported material (map / normalMap / roughnessMap ...), resolved under assets/;
# - the V mirror is not assumed: each packed image is compared with its file both as stored and flipped
#   vertically, and only an image that matches FLIPPED gets the mirror mapping (the glTF exporter flips a
#   texture only when its flipY is set).
#
# Each packed image is matched by its own pixels, never by name: the pattern has to agree, not merely the average
# (every normal map is flat lavender). The matched image datablock is replaced by one loaded from the asset, with a
# path relative to the .blend, and the packed copy is deleted; nothing is ever written to the game's assets, which
# the size and date of every file read confirm afterwards. What the game draws at runtime and never ships as a file
# (the window shade map, the frame normal map) has no match and stays packed.
#
# As a module, on the open file:  import link_textures; link_textures.link_to_game_assets(manifest)
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import os
import bpy
import numpy as np

import tm_common as C

MATCH_CORR, MATCH_DIFF, MATCH_MARGIN = 0.9, 0.03, 0.05     # the same picture, and clearly closer than the next one


def _fingerprint(im, n=64):
    c = im.copy()
    c.colorspace_settings.name = 'Non-Color'
    c.scale(n, n)
    a = np.empty(n * n * 4, dtype=np.float32)
    c.pixels.foreach_get(a)
    bpy.data.images.remove(c)
    return a.reshape(n, n, 4)[:, :, :3]


def _unit(f):
    g = f.mean(axis=2).ravel()
    g = g - g.mean()
    n = float(np.linalg.norm(g))
    return g / n if n > 1e-6 else g


def candidate_files(manifest):
    """Every asset file the exported materials' maps came from (absolute paths, deduplicated)."""
    out = []
    for row in manifest.get("materials", []):
        for info in (row.get("maps") or {}).values():
            p = C.url_to_path(info.get("url"))
            if p and p not in out:
                out.append(p)
    return out


def _assets(paths):
    out = []
    for fp in paths:
        im = bpy.data.images.load(fp, check_existing=False)
        if im.size[0]:
            f = _fingerprint(im)
            out.append((f, False, fp, os.path.getsize(fp), os.path.getmtime(fp)))     # as stored
            out.append((f[::-1], True, fp, os.path.getsize(fp), os.path.getmtime(fp)))  # flipped vertically
        bpy.data.images.remove(im)
    return out


def _mirror_v(mat, names):
    nt = mat.node_tree
    if not nt:
        return 0
    n = 0
    for t in [x for x in nt.nodes if x.type == 'TEX_IMAGE' and x.image and x.image.name in names]:
        vec = t.inputs["Vector"]
        src = vec.links[0].from_socket if vec.is_linked else None
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.name = mp.label = "tm_v_mirror"
        mp.location = (t.location.x - 380, t.location.y)
        mp.inputs["Location"].default_value[1] = 1.0
        mp.inputs["Scale"].default_value[1] = -1.0
        if src is None:
            uv = nt.nodes.new('ShaderNodeTexCoord')
            uv.location = (t.location.x - 600, t.location.y)
            src = uv.outputs["UV"]
        nt.links.new(mp.inputs["Vector"], src)
        nt.links.new(t.inputs["Vector"], mp.outputs["Vector"])
        n += 1
    return n


def link_to_game_assets(manifest, verbose=True):
    """Replace every packed texture that is one of the manifest's asset maps by the file itself.
    Returns {"linked": {image: (relpath, corr, flipped)}, "still_packed": [...], "mirrored_nodes": n}."""
    files = candidate_files(manifest)
    assert files, "the manifest names no texture files under assets/"
    assets = _assets(files)
    linked, still_packed, flipped_names = {}, [], set()
    for im in [i for i in bpy.data.images if i.packed_file]:
        f = _fingerprint(im)
        u = _unit(f)
        scored = sorted(((float(u @ _unit(g)), float(np.abs(f - g).mean()), flip, q, z, t) for g, flip, q, z, t in assets),
                        key=lambda s: s[0], reverse=True)
        c, d, flip, fp, sz, mt = scored[0]
        c2 = next((s[0] for s in scored[1:] if s[3] != fp), -1.0)   # the best OTHER file, not the same file flipped
        if c < MATCH_CORR or d > MATCH_DIFF or c2 > c - MATCH_MARGIN:
            still_packed.append({"image": im.name, "size": list(im.size), "bytes": im.packed_file.size, "best_corr": round(c, 3)})
            continue
        rel = os.path.relpath(fp, os.path.join(BP.ROOT, 'assets')).replace("\\", "/")
        new = bpy.data.images.load(fp, check_existing=True)
        new.name = "asset_" + rel.replace("public/pbr/", "").replace("/", "_").rsplit(".", 1)[0]
        new.colorspace_settings.name = im.colorspace_settings.name
        new.alpha_mode = im.alpha_mode
        new.filepath = bpy.path.relpath(fp) if bpy.data.filepath else fp
        for mat in bpy.data.materials:
            if not mat.node_tree:
                continue
            for nd in mat.node_tree.nodes:
                if nd.type == 'TEX_IMAGE' and nd.image is im:
                    nd.image = new
        assert im.users == 0, f"{im.name} is used outside the materials"
        bpy.data.images.remove(im)
        assert os.path.getsize(fp) == sz and os.path.getmtime(fp) == mt, f"the game's asset changed: {fp}"
        linked[new.name] = (rel, round(c, 4), flip)
        if flip:
            flipped_names.add(new.name)
    n_nodes = sum(_mirror_v(m, flipped_names) for m in bpy.data.materials)
    if verbose:
        for k, (v, c, flip) in sorted(linked.items(), key=lambda kv: kv[1][0]):
            print(f"   {k:44s} -> assets/{v:52s} match {c:.4f}{'  (V mirrored)' if flip else ''}")
        print(f"textures linked to the game's assets: {len(linked)}; {n_nodes} texture nodes given the V mirror; "
              f"still packed (drawn by the game at runtime): {still_packed}")
    return {"linked": {k: {"asset": v, "corr": c, "flipped": fl} for k, (v, c, fl) in linked.items()},
            "still_packed": still_packed, "mirrored_nodes": n_nodes}
