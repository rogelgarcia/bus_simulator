# The Bradbury block's WEAR LAYER (AI 563): a post-pass over the built block that the wear features (AI 564-573) plug
# into. It never touches what it reads. assemble_building.py keeps writing bradbury_block.blend and the pieces keep
# writing bradbury_portal.blend; this reads both and writes worn copies beside them, in portal_project/wear/:
#
#   masks/<feature>.png        each feature's mask: the five facades unrolled side by side in (s, z) metres
#   wear_nodes.blend           the WEAR_layer node group (and its frame and feature groups) with the mask images
#   bradbury_portal_worn.blend the portal with WEAR_layer in its materials (the ornaments' own, as object-level copies)
#   bradbury_block_worn.blend  the block with WEAR_layer in its materials, linking the worn portal, plus the debug view's
#                              source markers and whatever geometry a feature adds
#   wear_manifest.json         what was built from what: the source files' hashes, the atlas, per feature its sources,
#                              marks, mask and default strength; build_scene.py reads it
#   cache/                     per feature its sources, marks, fields and apply data, for a partial rebuild
#
# build_scene.py then links the worn block (wear=on, the default, or wear=debug) or the untouched one (wear=off).
#
#   blender -b -P wear_layer.py --                        every feature
#   blender -b -P wear_layer.py -- features=probe         rebuild these features' masks, the rest from the cache
#   blender -b -P wear_layer.py -- elevations=1           also draw each face square on, coloured by material, with
#                                                         every feature's mask over it (screens/bradbury_wear/elevations/)
#
# About five seconds, plus whatever the features' own ray casting takes; no render. The masks come from the model's own
# geometry alone, so a rebuild reproduces them exactly (the manifest records each mask's sha256).
import bpy, os, sys, time, json, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
from wear import paths, geometry as geo, nodes, controls, registry, classes, elevation, edges
from wear.apply import ApplyContext, build_markers

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = dict(a.split("=", 1) for a in argv if "=" in a)
ONLY = set(filter(None, args.get("features", "").split(",")))
ELEVATIONS = args.get("elevations", "0") not in ("0", "", "no", "off")
T0 = time.time()


def log(msg):
    print(f"[wear {time.time() - T0:6.1f}s] {msg}", flush=True)


def save_as(path, **kw):
    # no .blend1 backups beside the worn files; set before every save, since read_factory_settings resets it
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=path, **kw)


specs = registry.features()
names = [s.NAME for s in specs]
assert not (ONLY - set(names)), f"features= names no feature: {sorted(ONLY - set(names))} (have {names})"
for p in (paths.BLOCK, paths.PORTAL): assert os.path.isfile(p), f"missing: {p}"
for d in (paths.WEAR_DIR, paths.MASKS, paths.CACHE): os.makedirs(d, exist_ok=True)
for d, ext in ((paths.MASKS, ".png"), (paths.CACHE, ".pkl")):       # a feature taken out of the registry leaves nothing
    for fn in os.listdir(d):
        if fn.endswith(ext) and fn[:-len(ext)] not in names: os.remove(os.path.join(d, fn))
src_hash = {"block": geo.sha256_file(paths.BLOCK), "portal": geo.sha256_file(paths.PORTAL)}
for fn in sorted(os.listdir(paths.ORNAMENTS)):
    if fn.endswith(".blend"): src_hash["ornaments/" + fn] = geo.sha256_file(os.path.join(paths.ORNAMENTS, fn))

# ------------------------------------------------------------------------ 1. measure the built block, build the features
bpy.ops.wm.open_mainfile(filepath=paths.BLOCK)
block = geo.Block(log=log)
mat_report = block.materials_report()
results, mask_paths, stats, canvases = {}, {}, {}, {}
for spec in registry.build_order():                      # every feature after the ones whose fields it NEEDS
    cached = geo.Result.load(paths.CACHE, spec.NAME) if (ONLY and spec.NAME not in ONLY) else None
    mp = os.path.join(paths.MASKS, spec.NAME + ".png")
    if cached is not None and (not cached.mask or os.path.isfile(mp)):
        results[spec.NAME] = cached
        if cached.mask: mask_paths[spec.NAME] = mp
        stats[spec.NAME] = dict(cached=True)
        log(f"{spec.NAME}: taken from the cache")
        continue
    t = time.time()
    log(f"{spec.NAME} (AI {spec.AI}): building")
    ctx = geo.FeatureContext(block, spec, results, log=log)
    spec.build(ctx)
    res = ctx.finish()
    st = dict(cached=False, seconds=round(time.time() - t, 1))
    if res.mask:
        res.mask_sha = geo.write_png(mp, res.canvas, res.mask["bits"])
        mask_paths[spec.NAME] = mp
        nz = res.canvas.max(axis=2) > 0.0
        st.update(texels=int(nz.sum()), area_m2=round(float(nz.sum()) * res.mask["res"] ** 2, 3),
                  max=round(float(res.canvas.max()), 4))
    if res.mask and ELEVATIONS: canvases[spec.NAME] = res.canvas
    res.canvas = None
    res.save(paths.CACHE)
    results[spec.NAME] = res; stats[spec.NAME] = st
if ELEVATIONS:
    for spec in specs:
        if spec.NAME in mask_paths and spec.NAME not in canvases:
            canvases[spec.NAME] = elevation.read_mask(mask_paths[spec.NAME])
    elevation.write(block, specs, results, canvases, os.path.join(paths.SCREENS, "elevations"), log=log)
    canvases = {}

print("\nWEAR FEATURES (chain order)")
print(f"  {'feature':<22} {'AI':>4} {'sources':>8} {'marks':>7} {'paths':>6} {'mask m2':>9}  default  label")
for spec in specs:
    r, st = results[spec.NAME], stats[spec.NAME]
    area = f"{st['area_m2']:9.2f}" if "area_m2" in st else ("   cached" if st.get("cached") else "        -")
    print(f"  {spec.NAME:<22} {spec.AI:>4} {len(r.sources):>8} {len(r.marks):>7} {len(r.paths):>6} {area}  "
          f"{spec.DEFAULT_STRENGTH:7.2f}  {spec.LABEL}")
print()

# ------------------------------------------------------------------------ 2. the node library
bpy.ops.wm.read_factory_settings(use_empty=True)
save_as(paths.NODES)          # a path first, so the images can be made relative to it
nodes.build_library(specs, results, mask_paths, log=log)
bpy.ops.file.make_paths_relative()
save_as(paths.NODES, relative_remap=True, compress=True)
log(f"saved {os.path.relpath(paths.NODES, paths.ART)}")


def wear_objects(objs, layer, copy_linked):
    """WEAR_layer into every material these objects render with. A local material is worn in place. A linked one (the
    portal's ornaments link theirs from ornaments/*.blend) is worn as a local copy given to the object's own slot when
    copy_linked, and left alone otherwise (in the block, the portal's linked materials come worn from the worn portal)."""
    done, skipped, copies = {}, {}, {}
    for o in objs:
        for slot in getattr(o, "material_slots", []):
            m = slot.material
            if m is None: continue
            cls, why = classes.classify(m)
            if cls == classes.NONE:
                skipped.setdefault(m.name_full, why); continue
            if m.library is None:
                if m.name_full not in done:
                    ok, how = nodes.wear_material(m, cls, layer); done[m.name_full] = (classes.NAMES[cls], ok, how)
            elif copy_linked:
                if m.name_full not in copies:
                    c = m.copy(); ok, how = nodes.wear_material(c, cls, layer)
                    copies[m.name_full] = c; done[c.name_full + " (copy of " + m.name_full + ")"] = (classes.NAMES[cls], ok, how)
                slot.link = 'OBJECT'; slot.material = copies[m.name_full]
    return done, skipped


def print_materials(title, done, skipped):
    print(f"\n{title}: {sum(1 for v in done.values() if v[1])} material(s) worn")
    for k in sorted(done): print(f"   {done[k][0]:<10} {'worn' if done[k][1] else 'NOT worn'} {k}  [{done[k][2]}]")
    for k in sorted(skipped): print(f"   {'none':<10} left   {k}  [{skipped[k]}]")


def print_edges(title, done):
    print(f"\n{title}: {sum(1 for v in done.values() if v[1])} material(s) with rounded edges (AI 576, wear/edges.py)")
    for k in sorted(done): print(f"   {done[k][0]:<10} {'rounded' if done[k][1] else 'left   '} {k}  [{done[k][2]}]")


# ------------------------------------------------------------------------ 3. the worn portal
bpy.ops.wm.open_mainfile(filepath=paths.PORTAL)
layer = nodes.link_layer(paths.NODES)
portal = bpy.data.collections["PORTAL"]
done, skipped = wear_objects(list(portal.all_objects), layer, copy_linked=True)
print_materials("the worn portal", done, skipped)
portal_edges = edges.round_objects(list(portal.all_objects), classes.classify, classes.NAMES)
print_edges("the worn portal", portal_edges)
portal_worn = {k: v for k, v in done.items()}
for spec in specs:
    if hasattr(spec, "apply_portal"): spec.apply_portal(ApplyContext(spec, results[spec.NAME], log=log))
bpy.ops.file.make_paths_relative()
save_as(paths.WORN_PORTAL, relative_remap=True, compress=True)
log(f"saved {os.path.relpath(paths.WORN_PORTAL, paths.ART)}")

# ------------------------------------------------------------------------ 4. the worn block
bpy.ops.wm.open_mainfile(filepath=paths.BLOCK)
n_local0 = sum(1 for o in bpy.data.objects if o.library is None)
lib = next(l for l in bpy.data.libraries if os.path.basename(bpy.path.abspath(l.filepath)) == os.path.basename(paths.PORTAL))
lib.filepath = paths.WORN_PORTAL
lib.reload()
pc = bpy.data.collections.get("PORTAL")
assert pc is not None and pc.library is lib, "the portal collection did not come back from the worn portal"
log(f"the portal now links from {os.path.basename(paths.WORN_PORTAL)}: {len(pc.all_objects)} objects in PORTAL")
layer = nodes.link_layer(paths.NODES)
done, skipped = wear_objects([o for o in bpy.data.objects if o.library is None], layer, copy_linked=False)
print_materials("the worn block", done, skipped)
block_edges = edges.round_objects([o for o in bpy.data.objects if o.library is None], classes.classify, classes.NAMES)
print_edges("the worn block", block_edges)
block_worn = {k: v for k, v in done.items()}
for spec in specs:
    if hasattr(spec, "apply"): spec.apply(ApplyContext(spec, results[spec.NAME], log=log))
markers = build_markers(specs, results, log=log)
defaults = {s.NAME: float(s.DEFAULT_STRENGTH) for s in specs}
defaults.update({f"{s.NAME}_{k}": float(v) for s in specs for k, v in getattr(s, "CONTROLS", {}).items()})
controls.apply(bpy.context.scene, "on", defaults, log=log)
bpy.ops.file.make_paths_relative()
save_as(paths.WORN_BLOCK, relative_remap=True, compress=True)
log(f"saved {os.path.relpath(paths.WORN_BLOCK, paths.ART)}")

# ------------------------------------------------------------------------ 5. verify what was written
bpy.ops.wm.open_mainfile(filepath=paths.WORN_BLOCK)
art = os.path.normcase(os.path.normpath(paths.ART)); assets = os.path.normcase(os.path.join(paths.ROOT, "assets"))
bad = []
for l in bpy.data.libraries:
    p = os.path.normcase(os.path.normpath(bpy.path.abspath(l.filepath)))   # loaded, even an indirect one is main-file relative
    if not l.filepath.startswith("//"): bad.append(f"library {l.name} not relative: {l.filepath}")
    if not os.path.isfile(p): bad.append(f"library {l.name} missing: {p}")
    if not p.startswith(art): bad.append(f"library {l.name} outside portal_project: {p}")
for im in bpy.data.images:
    if im.source != 'FILE' or im.packed_file is not None: continue
    try: p = bpy.path.abspath(im.filepath, library=im.library)
    except TypeError: p = bpy.path.abspath(im.filepath)
    p = os.path.normcase(os.path.normpath(p))
    if not os.path.isfile(p): bad.append(f"image {im.name_full} missing: {p}")
    elif not (p.startswith(art) or p.startswith(assets)): bad.append(f"image {im.name_full} outside portal_project and assets: {p}")
pc = bpy.data.collections["PORTAL"]
rendered = {}                                   # the materials objects actually render with (object-level slots win)
for o in [o for o in bpy.data.objects if o.library is None] + list(pc.all_objects):
    for slot in o.material_slots:
        if slot.material is not None: rendered[slot.material.name_full] = slot.material
unworn = []
for m in rendered.values():
    cls, _ = classes.classify(m)
    if cls == classes.NONE: continue
    if not any(n.type == 'GROUP' and n.node_tree and n.node_tree.name == nodes.LAYER for n in m.node_tree.nodes):
        unworn.append(m.name_full)
n_local = sum(1 for o in bpy.data.objects if o.library is None)
inst = [o for o in bpy.data.objects if o.instance_type == 'COLLECTION' and o.instance_collection is pc]
print(f"\nVERIFY {os.path.relpath(paths.WORN_BLOCK, paths.ART)}: {n_local} local objects ({n_local0} in the block + "
      f"{n_local - n_local0} of the layer), {len(inst)} portal instance(s) of {len(pc.all_objects)} objects, "
      f"{len(bpy.data.libraries)} libraries: " + ", ".join(sorted(l.filepath for l in bpy.data.libraries)))
for b in bad: print("  PROBLEM", b)
for u in unworn: print("  PROBLEM material in use without WEAR_layer:", u)
assert not bad and not unworn, "the worn files are not self-consistent (see PROBLEM lines)"
assert n_local == n_local0 + len(markers) + sum(len(c.objects) for c in bpy.data.collections if c.name.startswith(controls.GEO)), \
    "the worn block has objects the layer does not account for"

# ------------------------------------------------------------------------ 6. the manifest
man = dict(
    version=1, built_at=datetime.datetime.now().isoformat(timespec="seconds"), blender=bpy.app.version_string,
    source={k: dict(file=("../" + k), sha256=v) for k, v in
            [("bradbury_block.blend", src_hash["block"]), ("bradbury_portal.blend", src_hash["portal"])]
            + [(k, v) for k, v in src_hash.items() if k.startswith("ornaments/")]},
    files=dict(worn_block=os.path.basename(paths.WORN_BLOCK), worn_portal=os.path.basename(paths.WORN_PORTAL),
               nodes=os.path.basename(paths.NODES)),
    atlas=geo.ATLAS.to_dict(), z_ground=geo.Z_GROUND,
    features=[dict(name=s.NAME, ai=s.AI, label=s.LABEL, order=s.ORDER, default_strength=float(s.DEFAULT_STRENGTH),
                   controls={k: float(v) for k, v in getattr(s, "CONTROLS", {}).items()},
                   debug_color=list(s.DEBUG_COLOR), sources=len(results[s.NAME].sources), marks=len(results[s.NAME].marks),
                   paths=len(results[s.NAME].paths),
                   source_kinds=sorted({x["kind"] for x in results[s.NAME].sources}),
                   mask=(dict(file="masks/" + s.NAME + ".png", sha256=results[s.NAME].mask_sha, **results[s.NAME].mask)
                         if results[s.NAME].mask else None),
                   build=stats[s.NAME])
              for s in specs],
    edges=dict(radius_m=edges.RADIUS, override=[[rx, r] for rx, r in edges.OVERRIDE], samples=edges.SAMPLES,
               block={k: list(v) for k, v in block_edges.items()}, portal={k: list(v) for k, v in portal_edges.items()}),
    materials=dict(block={k: list(v) for k, v in block_worn.items()}, portal={k: list(v) for k, v in portal_worn.items()},
                   measured=[dict(cls=r[0], name=r[1], reason=r[2], objects=r[3]) for r in mat_report]),
    objects=dict(block_local=n_local0, worn_block_local=n_local, markers=markers))
with open(paths.MANIFEST, "w", encoding="utf-8") as fh: json.dump(man, fh, indent=1)
log(f"manifest {os.path.relpath(paths.MANIFEST, paths.ART)}")
print("WEAR DONE")
