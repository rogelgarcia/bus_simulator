# link_game_textures.py — point a .blend's packed textures back at the game's own PBR files.
#
# The glTF export of a building packs every texture into the .blend, tens of MB of PNG, and they are the game's own
# maps under assets/public/pbr. This finds each packed image's file and puts the file in its place, with a path
# relative to the .blend, so the file carries geometry and nothing else.
#
# Each packed image is matched by its own pixels, never by name: the pattern has to agree, not merely the average
# (every normal map is flat lavender). The matched image datablock is replaced by one loaded from the asset and the
# packed copy is deleted, so nothing is ever written to the game's assets, which the size and date of every file read
# confirm afterwards. Blender's own unpack is not used: it ignores the path you set and writes the packed pixels back
# to disk instead of reading the file.
#
# The exporter flips every image vertically (the glTF convention), so each texture node that now reads a file gets a
# mapping that mirrors V, last in its chain, after whatever tiling the importer set up: with a repeating texture that
# picks exactly the texel the flipped copy carried, and the render does not change. What the game draws at runtime and
# never ships as a file (a storefront silhouette, the window maps) has no match and stays packed.
#
# As a module, on the open file:  from link_game_textures import link_to_game_assets; link_to_game_assets(ROOT)
# On a file, saving it in place:  blender -b <file.blend> -P link_game_textures.py [-- --dry-run]
import bpy, os, sys
import numpy as np

PBR_USED = ("red_brick", "brownstone", "terracotta_smooth", "red_sandstone_block", "red_sandstone_noise",
            "rough_concrete", "painted_plaster_wall")          # the materials the Bradbury block's config names
MAPS = ("basecolor.jpg", "basecolor.png", "normal_gl.png", "arm.png")
MATCH_CORR, MATCH_DIFF, MATCH_MARGIN = 0.9, 0.03, 0.05         # the same picture, and clearly closer than the next one

def _fingerprint(im, n=64):
    c = im.copy(); c.colorspace_settings.name = 'Non-Color'; c.scale(n, n)
    a = np.empty(n * n * 4, dtype=np.float32); c.pixels.foreach_get(a); bpy.data.images.remove(c)
    return a.reshape(n, n, 4)[:, :, :3]

def _unit(f):
    g = f.mean(axis=2).ravel(); g = g - g.mean(); n = float(np.linalg.norm(g))
    return g / n if n > 1e-6 else g

def _assets(pbr_dir):
    out = []
    for folder in PBR_USED:
        for nm in MAPS:
            fp = os.path.join(pbr_dir, folder, nm)
            if not os.path.exists(fp): continue
            im = bpy.data.images.load(fp, check_existing=False)
            if im.size[0]: out.append((_fingerprint(im)[::-1], fp, os.path.getsize(fp), os.path.getmtime(fp)))
            bpy.data.images.remove(im)
    return out

def _mirror_v(mat, linked):
    nt = mat.node_tree
    if not nt: return 0
    n = 0
    for t in [x for x in nt.nodes if x.type == 'TEX_IMAGE' and x.image and x.image.name in linked]:
        vec = t.inputs["Vector"]; src = vec.links[0].from_socket if vec.is_linked else None
        mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (t.location.x - 380, t.location.y)
        mp.inputs["Location"].default_value[1] = 1.0; mp.inputs["Scale"].default_value[1] = -1.0
        if src is None:
            uv = nt.nodes.new('ShaderNodeTexCoord'); uv.location = (t.location.x - 600, t.location.y); src = uv.outputs["UV"]
        nt.links.new(mp.inputs["Vector"], src); nt.links.new(t.inputs["Vector"], mp.outputs["Vector"]); n += 1
    return n

def link_to_game_assets(root, verbose=True):
    """Replace every packed texture that is one of the game's PBR maps by the file itself. Returns (linked, packed, nodes)."""
    pbr_dir = os.path.join(root, "assets", "public", "pbr")
    assets = _assets(pbr_dir)
    assert assets, f"no PBR maps under {pbr_dir}"
    linked, still_packed = {}, []
    for im in [i for i in bpy.data.images if i.packed_file]:
        f = _fingerprint(im); u = _unit(f)
        scored = sorted(((float(u @ _unit(g)), float(np.abs(f - g).mean()), q, z, t) for g, q, z, t in assets), reverse=True)
        (c, d, fp, sz, mt), c2 = scored[0], scored[1][0]
        if c < MATCH_CORR or d > MATCH_DIFF or c2 > c - MATCH_MARGIN:
            still_packed.append((im.name, tuple(im.size), im.packed_file.size, round(c, 3))); continue
        rel = os.path.relpath(fp, pbr_dir).replace("\\", "/")
        new = bpy.data.images.load(fp, check_existing=True)       # the asset file itself, in place of the packed copy
        new.name = "pbr_" + rel.replace("/", "_").rsplit(".", 1)[0]
        new.colorspace_settings.name = im.colorspace_settings.name; new.alpha_mode = im.alpha_mode
        new.filepath = bpy.path.relpath(fp)
        for mat in bpy.data.materials:
            if not mat.node_tree: continue
            for nd in mat.node_tree.nodes:
                if nd.type == 'TEX_IMAGE' and nd.image is im: nd.image = new
        assert im.users == 0, f"{im.name} is used outside the materials"
        bpy.data.images.remove(im)
        assert os.path.getsize(fp) == sz and os.path.getmtime(fp) == mt, f"the game's asset changed: {fp}"
        linked[new.name] = (rel, round(c, 4))
    n_nodes = sum(_mirror_v(m, linked) for m in bpy.data.materials)
    if verbose:
        for k, (v, c) in sorted(linked.items(), key=lambda kv: kv[1][0]):
            print(f"   {k:36s} -> assets/public/pbr/{v:38s} match {c:.4f}")
        print(f"textures linked to the game's assets: {len(linked)} images from {len(set(v.split('/')[0] for v, c in linked.values()))} "
              f"materials, {n_nodes} texture nodes given the V mirror; still packed (drawn by the game at runtime): {still_packed}")
    return linked, still_packed, n_nodes

if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    HERE = os.path.dirname(os.path.abspath(__file__))
    ROOT = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
    path = bpy.data.filepath
    assert path, "open a .blend first: blender -b <file.blend> -P link_game_textures.py"
    before = os.path.getsize(path)
    link_to_game_assets(ROOT)
    if "--dry-run" in argv:
        print(f"dry run: {os.path.basename(path)} left at {before / 1048576:.2f} MB")
    else:
        bpy.ops.wm.save_mainfile(filepath=path, compress=True)
        print(f"{os.path.basename(path)}: {before / 1048576:.2f} MB -> {os.path.getsize(path) / 1048576:.2f} MB")
