# composition_wear.py -- the Terra & Mar wear switch in the city composition (AI 651, 2026-10-17).
#
# The parts stand turned 45 degrees at the site's corner, so they are COLLECTION INSTANCES, and an instance ignores
# view-layer exclusion: the wear module's own overlay_visibility() (which excludes TM_WEAR, TM_WEAR_DEBUG and a
# feature's TM_WEAR_<name> on the view layer) cannot reach what an instance of TM_WEAR draws. So the composition
# instances each of TM_WEAR's child collections separately (TERRAMAR_WEAR: one empty per TM_WEAR_<name>, and one for
# TM_WEAR_DEBUG), and switch() renders an instance only while its collection should show: the switch on and that
# feature's strength over 0, the debug one in debug only -- the module's own rule. The materials' side of the module
# (tm_wear* scene properties, read by View Layer attributes) is set by its controls.apply() as everywhere else.
#
#   switch(S, mode="on"|"off"|"debug", strengths="name:v,..." or {name: v} or None)
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REBUILD = os.path.normpath(os.path.join(HERE, "..", "rebuild"))
if REBUILD not in sys.path:
    sys.path.insert(0, REBUILD)

WEAR_INSTANCES = "TERRAMAR_WEAR"


def sync(S, log=print):
    """Show or hide each overlay instance from the scene's tm_wear* properties."""
    import bpy
    from wear import controls
    mode, st, _ = controls.current(S)
    col = bpy.data.collections.get(WEAR_INSTANCES)
    if col is None:
        return 0
    shown = []
    for inst in col.objects:
        name = inst.instance_collection.name if inst.instance_collection else ""
        if name == controls.DEBUG:
            on = mode == "debug"
        elif name.startswith(controls.OVERLAYS + "_"):
            on = mode != "off" and float(st.get(name[len(controls.OVERLAYS) + 1:], 0.0)) > 0.0
        else:
            on = mode != "off"
        inst.hide_render = not on; inst.hide_viewport = not on
        if on:
            shown.append(name)
    log(f"TM WEAR instances: {', '.join(shown) or 'none'} shown of {len(col.objects)}")
    return len(shown)


def switch(S, mode, strengths=None, log=print):
    from wear import controls
    if isinstance(strengths, str):
        strengths = controls.parse_strengths(strengths)
    if mode == "off":
        controls.clear(S, log=log)
    else:
        controls.apply(S, mode, strengths, log=log)
    return sync(S, log=log)
