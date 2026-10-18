# wear.py -- the wear switch on a saved file (2026-10-14), normally the composition (its scene drives every linked part).
#
#   blender -b blender_files/terramar/legacy/terramar_parts_composition.blend --python wear.py -- wear=off save=1
#   ... -- wear=on|off|debug [strengths=splash_zone:0.6,<feature>:0 | all:0,<feature>:1] [signal=<name>|none] [save=1]
#   ... -- wear=clear [save=1]          remove every tm_wear* property (absent reads 0: exactly the unworn shading)
#   ... -- list=1                       print the switch, the strengths and the debug signals, change nothing
#
# Without save=1 nothing is written, so it chains with a render in one session (render_poses.py ignores these keys):
#   blender -b <composition> --python wear.py --python ../render_poses.py -- wear=debug poses=wear_base_front tag=wear_debug
# Strengths not given take the features' defaults (never a value an earlier run left); debug turns every worn surface to
# clay with each feature's mask in its colour, and signal=<name> (debug only) shows a signal (ground, level, sky, panel,
# or a feature's own attribute such as splash) as a blue-green-yellow ramp. See wear/controls.py.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import importlib
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402
import wear  # noqa: E402
from wear import controls, nodes, registry  # noqa: E402

importlib.reload(L)
wear.reload_all()


def main():
    opts = L.args()
    scene = bpy.context.scene
    sigs = [n for n, _ in nodes.debug_signals(registry.features())]
    mode = opts.get("wear")
    if opts.get("list") == "1" or mode is None:
        cur = controls.current(scene)
        print(f"WEAR mode {cur[0]}, strengths {cur[1]}, signal {sigs[cur[2] - 1] if cur[2] else 'none'}; "
              f"features {[f.NAME for f in registry.features()]}; debug signals {sigs}")
        return
    if mode == "clear":
        controls.clear(scene)
    else:
        signal = opts.get("signal")
        if signal not in (None, "", "none") and mode != "debug":
            print("WEAR signal= shows in the debug view only: switching to debug")
            mode = "debug"
        controls.apply(scene, mode, controls.parse_strengths(opts.get("strengths")), signal)
    if opts.get("save") == "1":
        fp = bpy.context.preferences.filepaths
        versions, fp.save_version = fp.save_version, 0           # no .blend1 copies
        try:
            bpy.ops.wm.save_mainfile()
        finally:
            fp.save_version = versions
        print("WEAR saved", bpy.data.filepath)


if __name__ == "__main__":
    main()
