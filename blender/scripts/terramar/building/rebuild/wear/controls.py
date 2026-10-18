# The wear module's controls, as the rendering scene holds them (custom properties; absent = off):
#   tm_wear              0 off, 1 on, 2 debug (clay with each feature's mask in its colour)
#   tm_wear_<feature>    the feature's strength: 1.0 its calibrated look, 0 that feature off, anything else scales it
#   tm_wear_signal       debug only: k > 0 shows the k-th signal of the debug list (nodes.debug_signals) as a ramp
# and the wear part's overlay collection: TM_WEAR (linked into the composition) is excluded from every view layer while
# the switch is off, its debug-only child TM_WEAR_DEBUG unless in debug, and a feature's own TM_WEAR_<name> while that
# feature's strength is 0 (so strength 0 is exact for an overlay feature too: no decal left for the camera rays to
# cross). View-layer exclusion is the composition's own setting, so it works on the linked (read-only) collections too.
# Every apply() sets EVERY registered feature's strength: the ones given, the others their DEFAULT_STRENGTH (never a
# value left in the scene by an earlier run), so a switch run is reproducible from its own arguments.
from . import nodes, registry

PROP = "tm_wear"
MODES = {"off": 0.0, "on": 1.0, "debug": 2.0}
SIGNAL = "tm_wear_signal"
OVERLAYS = "TM_WEAR"
DEBUG = "TM_WEAR_DEBUG"


def strength_prop(name):
    return f"{PROP}_{name}"


def defaults():
    return {f.NAME: float(getattr(f, "DEFAULT_STRENGTH", 1.0)) for f in registry.features()}


def parse_strengths(text):
    """'splash_zone:0.6,glass_film:0' -> {name: value}; 'all:<v>' sets every feature first, so 'all:0,cavity_soot:1'
    isolates one feature; unknown names fail."""
    known = defaults()
    out = {}
    items = [s.partition(":") for s in (text or "").split(",") if s.strip()]
    for name, _, value in sorted(items, key=lambda it: it[0].strip() != "all"):
        name = name.strip()
        if name == "all":
            out.update({k: float(value) for k in known})
            continue
        assert name in known, f"wear: no feature {name!r} (have {', '.join(sorted(known))})"
        out[name] = float(value)
    return out


def current(scene):
    """(mode, {feature: strength}, signal index) a scene holds; absent properties read as off / 0."""
    inv = {v: k for k, v in MODES.items()}
    mode = inv.get(float(scene.get(PROP, 0.0)), "off")
    return mode, {k: float(scene.get(strength_prop(k), 0.0)) for k in defaults()}, int(scene.get(SIGNAL, 0))


def _layer_collections(lc):
    yield lc
    for c in lc.children:
        yield from _layer_collections(c)


def overlay_visibility(scene, mode, strengths=None):
    """Exclude TM_WEAR from every view layer while off, TM_WEAR_DEBUG unless in debug, TM_WEAR_<name> while that
    feature's strength is 0 (strengths {name: value}; absent = 0). The tree is walked parent first, so a child's own
    setting is made after its parent's (which Blender propagates down). Returns how many were set."""
    st = strengths or {}
    n = 0
    for vl in scene.view_layers:
        for lc in _layer_collections(vl.layer_collection):
            name = lc.collection.name
            if name == OVERLAYS:
                lc.exclude = mode == "off"
            elif name == DEBUG:
                lc.exclude = mode != "debug"
            elif name.startswith(OVERLAYS + "_"):
                lc.exclude = mode == "off" or float(st.get(name[len(OVERLAYS) + 1:], 0.0)) <= 0.0
            else:
                continue
            n += 1
    return n


def apply(scene, mode, strengths=None, signal=None, log=print):
    """Set the switch: mode off | on | debug; strengths {feature: value} for the features given, every other
    registered feature its DEFAULT_STRENGTH; signal a debug-list name (debug mode) or None / "none"."""
    assert mode in MODES, f"wear: off | on | debug, not {mode!r}"
    st = defaults()
    unknown = sorted(set(strengths or {}) - set(st))
    assert not unknown, f"wear: no feature(s) {unknown} (have {', '.join(sorted(st))})"
    st.update({k: float(v) for k, v in (strengths or {}).items()})
    scene[PROP] = MODES[mode]
    for k, v in st.items():
        scene[strength_prop(k)] = float(v)
    sigs = [n for n, _ in nodes.debug_signals(registry.features())]
    if signal in (None, "", "none"):
        scene[SIGNAL] = 0.0
    else:
        assert signal in sigs, f"wear: no signal {signal!r} (have {', '.join(sigs)})"
        scene[SIGNAL] = float(sigs.index(signal) + 1)
    n = overlay_visibility(scene, mode, st)
    log(f"wear {mode}: " + ", ".join(f"{k} {v:g}" for k, v in st.items())
        + (f"; signal {signal}" if scene[SIGNAL] else "") + f"; overlay collections set: {n}")
    return st


def clear(scene, log=print):
    """Remove every tm_wear* property (absent reads 0: off) and exclude the overlays."""
    gone = [k for k in list(scene.keys()) if k == PROP or k.startswith(PROP + "_")]
    for k in gone:
        del scene[k]
    overlay_visibility(scene, "off")
    log(f"wear cleared: removed {', '.join(gone) or 'nothing'}")
    return gone
