# The wear features, in ORDER. Plugging a feature in is one module in features/ and one entry in MODULES.
#
# A feature module (the contract; the README's "Wear and weathering" section has the long form):
#   NAME = "splash_zone"            lowercase identifier; also its strength property tm_wear_<NAME> (1.0 = calibrated)
#   ORDER = 100                     chain order: 0-99 tone and fabric changes, 100-199 deposits (splash, dust),
#                                   200-299 streaks and runoff, 300-399 glass; a later feature sees the earlier ones
#   CLASSES = ("stone", "paving")   the classes.NAMES it acts on (its materials get the layer and the sockets it writes)
#   SIGNALS = ("ground",)           the framework signals it reads (signals.SIGNALS), computed on its classes' meshes
#   DEBUG_RGB = (r, g, b)           its false colour in the debug view
#   def shader(b, ins) -> dict      build the group body with the expression builder b (nodes.Builder); ins = the
#                                   group's inputs (the state sockets, Class, Strength); return the worn state for the
#                                   sockets it changes ("Color", "Roughness", ...) and "Mask" (0..1, where it acts, for
#                                   the debug view). Strength 0 passes everything through exactly (the framework wraps
#                                   it), and a strength above 1 should scale the amplitude, not a clamped factor.
# Optional:
#   LABEL = "..."                   one line for the logs and the README
#   DEFAULT_STRENGTH = 1.0          the strength compose.py and wear.py give it unless told otherwise
#   ATTRIBUTES = {"splash": 1.0}    its own tm_wear_<name> attributes, with their full scale for the debug ramp
#   def attributes(ctx) -> dict     write those attributes on the part's meshes (context.WearContext); runs in every
#                                   exterior part after the signals; returns a summary for the build log
#   def overlays(ctx) -> dict       build overlay objects into the wear part (overlays.OverlayContext; collection
#                                   TM_WEAR_<NAME>); returns a summary
import importlib
import os
import re

from .features import (cavity_soot, fabric_fade, glass_film, joint_dirt, ledge_dust, metal_chalk, runoff_streaks,
                       splash_zone, teak_weather)

# in ORDER (features() sorts by it anyway): tone and fabric changes, then deposits, then streaks, then the glass
MODULES = [teak_weather,        # 20   outdoor teak greying toward silver where sun and rain reach it
           fabric_fade,         # 30   cafe umbrella canvas: sun-faded tops, a dust line along the hems
           metal_chalk,         # 50   black powder coat (frames, rails, louvres, canopies) chalking under the sky
           splash_zone,         # 100  street splash band at the foot of the walls
           ledge_dust,          # 110  dust on the up-facing ledges and floors, rinsed where open, drifted into the lee
           cavity_soot,         # 120  soot in the inside corners and junctions (render-time occlusion)
           joint_dirt,          # 130  dirt in the stone and paving joints, more in sheltered horizontal runs
           runoff_streaks,      # 220  rain-runoff streaks below drip points (overlay decals in the wear part)
           glass_film]          # 300  even dust and salt film on the exterior glazing, per pane
# Features still in development register only in the process that asks for them: TM_WEAR_EXTRA=name_a,name_b (modules
# in features/) adds them after MODULES, so a feature can be tried in a scratch copy without touching this list.
MODULES += [importlib.import_module(f"{__package__}.features.{n.strip()}")
            for n in os.environ.get("TM_WEAR_EXTRA", "").split(",") if n.strip() and n.strip() not in {m.NAME for m in MODULES}]
# TM_WEAR_SKIP=name_a,name_b drops registered features in that process only: a scratch copy worn without them is the
# reference that proves their strength 0 exact. Never set it for the real parts (the build log lists the features).
SKIPPED = sorted({n.strip() for n in os.environ.get("TM_WEAR_SKIP", "").split(",") if n.strip()})
MODULES = [m for m in MODULES if m.NAME not in SKIPPED]

REQUIRED = ("NAME", "ORDER", "CLASSES", "SIGNALS", "DEBUG_RGB", "shader")
_IDENT = re.compile(r"[a-z][a-z0-9_]*")
RESERVED = ("exposed", "seed", "signal")         # tm_wear_<x> names the framework itself uses


def features():
    from . import classes, signals
    names, attrs = set(), {}
    for m in MODULES:
        missing = [a for a in REQUIRED if not hasattr(m, a)]
        assert not missing, f"wear feature {m.__name__} lacks {missing}"
        assert _IDENT.fullmatch(m.NAME), f"wear feature name {m.NAME!r}: a lowercase identifier"
        assert m.NAME not in names and m.NAME not in RESERVED, f"wear feature name {m.NAME!r} is taken"
        assert len(m.DEBUG_RGB) == 3, f"{m.NAME}: DEBUG_RGB is (r, g, b)"
        bad = [c for c in m.CLASSES if c not in classes.ID or c == "none"]
        assert not bad, f"{m.NAME}: unknown classes {bad} (classes.NAMES)"
        bad = [s for s in m.SIGNALS if s not in signals.SIGNALS]
        assert not bad, f"{m.NAME}: unknown signals {bad} (signals.SIGNALS)"
        for a in getattr(m, "ATTRIBUTES", {}):
            assert _IDENT.fullmatch(a) and a not in signals.SIGNALS and a not in RESERVED, f"{m.NAME}: attribute {a!r}"
            assert a not in attrs, f"{m.NAME}: attribute {a!r} is {attrs.get(a)}'s too (one tm_wear_{a} per mesh)"
            attrs[a] = m.NAME
        names.add(m.NAME)
    return sorted(MODULES, key=lambda m: (m.ORDER, m.NAME))


def acting_on(feats, cls_name):
    return [f for f in feats if cls_name in f.CLASSES]
