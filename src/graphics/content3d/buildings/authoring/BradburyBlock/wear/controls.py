# The wear layer's controls, as the render scene holds them. One switch, `wear`: off | on | debug, and one strength per
# feature, `wear_<name>` (1.0 = the feature's calibrated look, 0 = that feature off, anything else scales it), plus any
# extra control a feature declares in its CONTROLS, `wear_<name>_<control>` (off by default when so declared). apply()
# sets them all at once on a scene: the scene's custom properties, which every worn material reads (see nodes.py), and
# the visibility of the scene's wear-only collections:
#   WEAR_SOURCES        the debug view's source markers, rendered in debug only, one child WEAR_SRC_<name> per
#                       feature, rendered while that feature is on (a feature at 0 shows neither marks nor sources)
#   WEAR_GEO_<name>     objects a geometry feature adds or substitutes (chips, worn copies), rendered when that
#                       feature is on
#   WEAR_ORIG_<name>    the originals those substitutes replace, rendered when that feature is off
# build_scene.py calls it when it builds the scene; render_wear.py calls it on a saved scene before a render.
import json, os
from . import paths

MODES = {"off": 0.0, "on": 1.0, "debug": 2.0}
SOURCES = "WEAR_SOURCES"
SRC, GEO, ORIG = "WEAR_SRC_", "WEAR_GEO_", "WEAR_ORIG_"


def read_manifest(path=paths.MANIFEST):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def defaults(manifest):
    # every control the built layer has, by its scene property's name less the `wear_`: each feature's strength and
    # each feature's extra controls (<feature>_<control>)
    out = {}
    for f in manifest["features"]:
        out[f["name"]] = float(f["default_strength"])
        for k, v in f.get("controls", {}).items(): out[f"{f['name']}_{k}"] = float(v)
    return out


def parse(args, manifest, base=None, mode_default="on"):
    """(mode, strengths) from key=value args: wear=off|on|debug and wear_<name>=<strength>. Strengths not given keep
    `base` (a saved scene's own) where it has them, else the manifest's defaults."""
    mode = args.get("wear", mode_default).lower()
    assert mode in MODES, f"wear: off | on | debug, not {mode}"
    st = defaults(manifest)
    for k in st:
        if base and k in base: st[k] = float(base[k])
    for k, v in args.items():
        if k.startswith("wear_") and k != "wear_stale":
            name = k[5:]
            assert name in st, f"no wear control called wear_{name} (have {', '.join('wear_' + k for k in st)})"
            st[name] = float(v)
    return mode, st


def organise(parent, log=print):
    """Sort the wear-only objects the scene linked from the worn block into their own child collections of `parent`:
    source markers (custom property wear_marker), geometry features' objects (wear_geometry) and the originals they
    replace (named by wear_replaces). Returns the counts."""
    import bpy
    objs = list(parent.objects)
    by_name = {o.name: o for o in objs}
    def child(name, under=parent):
        c = next((c for c in bpy.data.collections if c.name == name and c.library is None), None)
        if c is None:
            c = bpy.data.collections.new(name); under.children.link(c)
        return c
    n_src = n_geo = n_orig = 0
    for o in objs:
        f = o.get("wear_marker")
        if f:
            child(SRC + f, under=child(SOURCES)).objects.link(o); parent.objects.unlink(o); n_src += 1
    for o in objs:
        f = o.get("wear_geometry")
        if not f: continue
        child(GEO + f).objects.link(o); parent.objects.unlink(o); n_geo += 1
        rep = o.get("wear_replaces")
        if rep and rep in by_name and by_name[rep].name in parent.objects:
            child(ORIG + f).objects.link(by_name[rep]); parent.objects.unlink(by_name[rep]); n_orig += 1
    log(f"wear-only objects: {n_src} source marker(s) in {SOURCES}, {n_geo} geometry object(s), {n_orig} original(s) "
        f"they replace")
    return n_src, n_geo, n_orig


def current(scene, manifest):
    """(mode, strengths) a saved scene holds."""
    inv = {v: k for k, v in MODES.items()}
    mode = inv.get(float(scene.get("wear", 0.0)), "off")
    return mode, {k: float(scene.get("wear_" + k, v)) for k, v in defaults(manifest).items()}


def stale(manifest, art=paths.ART):
    """The source files that changed since the worn block was built from them."""
    from .geometry import sha256_file
    out = []
    for k, v in manifest["source"].items():
        p = os.path.join(art, k)
        if not os.path.isfile(p) or sha256_file(p) != v["sha256"]: out.append(k)
    return out


def apply(scene, mode, strengths, log=print):
    import bpy
    assert mode in MODES, mode
    scene["wear"] = MODES[mode]
    for name, v in strengths.items(): scene["wear_" + name] = float(v)
    for c in bpy.data.collections:
        if c.library is not None: continue
        if c.name == SOURCES:
            c.hide_render = mode != "debug"
        elif c.name.startswith(SRC):
            c.hide_render = not strengths.get(c.name[len(SRC):], 0.0) > 0.0
        elif c.name.startswith(GEO):
            f = c.name[len(GEO):]
            c.hide_render = not (mode != "off" and strengths.get(f, 0.0) > 0.0)
        elif c.name.startswith(ORIG):
            f = c.name[len(ORIG):]
            c.hide_render = mode != "off" and strengths.get(f, 0.0) > 0.0
    log(f"wear {mode}: " + (", ".join(f"{k} {v:g}" for k, v in strengths.items()) or "no features"))
