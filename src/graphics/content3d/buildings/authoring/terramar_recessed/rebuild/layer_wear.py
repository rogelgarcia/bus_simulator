# layer_wear.py -- the wear finishing pass of the Terra & Mar rebuild (2026-10-14), and the wear part's overlay layer.
#
# Run through build.py, which appends it after the materials pass in the building, props and site parts (the materials
# pass rebuilds the node trees the wear sits in, so the wear follows it every time; layers=wear alone re-applies it;
# wear=0 strips it, and the part comes out as it was before the wear module). It owns no collection and changes no
# geometry and no material's own nodes: it splices in (see wear/__init__.py for the module):
#   strip       first, always: every material's TM_WEAR splice removed (original links back), the TM_WEAR node groups,
#               the tm_wear_* mesh attributes and object flags dropped, per-object mesh copies given back their shared
#               mesh -- so a rerun starts from the unworn part and the pass is idempotent
#   groups      TM_WEAR_F_<name> per registered feature (wear/registry.py, in ORDER), then TM_WEAR_layer
#   flags       tm_wear_exposed = 1 and tm_wear_seed (seeded per object) on every exterior object of the part (the
#               building's RB_INTERIOR stays unflagged: sheltered)
#   signals     tm_wear_<signal> on the meshes that carry a class some feature acts on (that feature's SIGNALS);
#               signals=all writes every signal on every exterior mesh (for the debug view); and indoor, the layer's own
#               gate, on every worn mesh but the glass-only ones (computed in the building part only)
#   attributes  each feature's attributes(ctx)
#   insert      TM_WEAR_layer into every exterior material whose class some feature acts on, routing the sockets those
#               features write, plus the class's debug-only sockets (nodes.DEBUG_ROUTES: the glass's transmission)
#               (wear/nodes.py insert)
# The wear part (target=wear, terramar_wear.blend, root TM_WEAR) has one layer, wear_overlays: build_overlays() runs
# each feature's overlays() (wear/overlays.py).
#
# On a private scratch copy (build.py only builds the real part files):
#   blender -b <scratch>/terramar_building.blend --python layer_wear.py -- [wear=0] [signals=all] [save=1]
import importlib
import json
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402
import wear  # noqa: E402
from wear import classes, context, nodes, overlays, registry, signals  # noqa: E402

importlib.reload(L)
wear.reload_all()

LAYER = "wear"


def part_here():
    """The part being built: build.py's TM_RB_PART, else the file's own root collection."""
    part = os.environ.get("TM_RB_PART")
    if part:
        return part
    local = {c.name for c in bpy.data.collections if c.library is None}
    for part, root in (("building", "TM_BUILDING"), ("props", "TM_PROPS"), ("wear", "TM_WEAR"), ("site", "RB_SITE")):
        if root in local:
            return part
    raise SystemExit("layer_wear: no part root (TM_BUILDING, TM_PROPS, RB_SITE) in this file")


def strip(log=print):
    """Remove every trace of the wear from the open file. Returns the counts."""
    mats = sum(nodes.remove(m) for m in bpy.data.materials if m.library is None)
    groups = nodes.purge_groups()
    attrs = flags = meshes = 0
    for ob in bpy.data.objects:
        if ob.library is not None:
            continue
        shared = ob.get("tm_wear_shared_mesh")
        if shared is not None:
            own = ob.data
            if shared in bpy.data.meshes:
                ob.data = bpy.data.meshes[shared]
                if own.users == 0:
                    bpy.data.meshes.remove(own)
                meshes += 1
            del ob["tm_wear_shared_mesh"]
        for k in [k for k in ob.keys() if k.startswith("tm_wear_")]:
            del ob[k]
            flags += 1
    for me in bpy.data.meshes:
        if me.library is not None:
            continue
        for name in [a.name for a in me.attributes if a.name.startswith("tm_wear_")]:
            me.attributes.remove(me.attributes[name])
            attrs += 1
    return {"materials": mats, "node_groups": groups, "attributes": attrs, "object_flags": flags, "mesh_copies": meshes}


def build(plan):
    t0 = time.time()
    part = part_here()
    opts = L.args()
    stripped = strip()
    if opts.get("wear", "1") == "0":
        return {"layer": LAYER, "part": part, "mode": "stripped (wear=0)", "stripped": stripped,
                "seconds": round(time.time() - t0, 2)}
    feats = registry.features()
    bpy.context.view_layer.update()              # objects a fresh session just built carry stale world matrices
    ctx = context.WearContext(part, plan)
    writes = nodes.build_groups(feats)
    for ob in ctx.exterior:
        ob["tm_wear_exposed"] = 1.0
        ob["tm_wear_seed"] = ctx.seed("object", ob.name)
    acting = {c: registry.acting_on(feats, c) for c in classes.NAMES[1:]}
    need = {}
    every = opts.get("signals") == "all"
    for ob in ctx.meshes():
        sig = set(signals.SIGNALS) if every else set()
        for m in ob.data.materials:
            cid, cname = classes.classify(m) if m is not None else (0, "none")
            for f in acting[cname] if cid else ():
                sig |= set(f.SIGNALS)
            if cid and acting[cname] and cname != "glass_ext":
                sig.add("indoor")                # the layer's own gate (signals.indoor)
        if sig:
            need[ob] = sig
    written = signals.write(ctx, need)
    attrs = {f.NAME: f.attributes(ctx) for f in feats if hasattr(f, "attributes")}
    worn, skipped = {}, {}
    used = {m for ob in ctx.meshes() for m in ob.data.materials if m is not None and m.library is None}
    for m in sorted(used, key=lambda m: m.name):
        cid, cname = classes.classify(m)
        if not cid or not acting[cname]:
            continue
        routes = [s for s in nodes.STATE_NAMES if any(s in writes[f.NAME] for f in acting[cname])
                  or s in nodes.DEBUG_ROUTES.get(cname, ())]
        ok, why = nodes.insert(m, cid, routes)
        (worn if ok else skipped)[m.name] = f"{cname}: {why}"
    return {"layer": LAYER, "part": part, "mode": "on", "stripped": stripped, "features": [f.NAME for f in feats],
            "exterior_objects": len(ctx.exterior), "materials_worn": worn, "materials_skipped": skipped,
            "signals": {k: v for k, v in written.items() if v}, "attributes": attrs,
            "seconds": round(time.time() - t0, 2), "names": sorted(worn)}


def build_overlays(plan):
    """The wear part's layer (build.py PARTS["wear"]): TM_WEAR from the features' overlays()."""
    return overlays.build(plan, L)


def main():
    """Standalone, on a scratch copy of a part file: the pass, then save=1 saves it in place (no .blend1)."""
    opts = L.args()
    plan = L.load_plan()
    if part_here() == "wear":
        os.environ["TM_RB_ROOT"] = "TM_WEAR"
        importlib.reload(L)
        res = build_overlays(plan)
    else:
        res = build(plan)
    res.pop("names", None)
    print("LAYER wear", json.dumps(res))
    if opts.get("save") == "1":
        fp = bpy.context.preferences.filepaths
        versions, fp.save_version = fp.save_version, 0
        try:
            bpy.ops.wm.save_mainfile()
        finally:
            fp.save_version = versions
        print("SAVED", bpy.data.filepath)


if __name__ == "__main__":
    main()
