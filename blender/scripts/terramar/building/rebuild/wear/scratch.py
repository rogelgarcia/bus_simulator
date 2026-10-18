# scratch.py -- a private copy of the Terra & Mar part files for trying a wear feature (2026-10-14).
#
#   blender -b --factory-startup --python blender/scripts/terramar/building/rebuild/wear/scratch.py -- name=<name>
#
# Copies terramar_part_{shell,props,site,interiors,wear}.blend and the building entry into
# blender_files/terramar/parts/scratch_<name>/ (gitignored), each re-saved with absolute image
# paths and the composition's libraries pointing at the copies (absolute too), so the copy renders like the original
# and nothing in it reaches back to the real parts. Then, in the copy only:
#   blender -b <scratch>/terramar_part_shell.blend --python <R>/layer_wear.py -- save=1        (and props, site)
#   blender -b <scratch>/terramar_building.blend --python <R>/wear.py --python <render>/render_poses.py -- \
#       wear=on poses=wear_base_front tag=<name>_on out=<dir>
# build.py refuses any file but the real parts, so the real files are never touched from a scratch session.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import os
import sys

import bpy

R = BP.script('terramar/building/rebuild')
if R not in sys.path:
    sys.path.insert(0, R)
import rb_lib as L  # noqa: E402

PARTS = ("building", "props", "site", "interiors", "wear")


def copy_file(src, dst, libraries_to=None):
    bpy.ops.wm.open_mainfile(filepath=src, load_ui=False)
    bpy.ops.file.make_paths_absolute()
    if libraries_to is not None:
        for lib in bpy.data.libraries:
            lib.filepath = os.path.join(libraries_to, os.path.basename(bpy.path.abspath(lib.filepath)))
    bpy.ops.wm.save_as_mainfile(filepath=dst, copy=True, relative_remap=True)


def main():
    opts = L.args()
    name = opts.get("name")
    assert name and name.replace("_", "").isalnum(), "give name=<letters, digits, _>"
    out = os.path.join(L.C.REBUILD_DIR, f"scratch_{name}")
    os.makedirs(out, exist_ok=False)  # preserve any earlier scratch files
    fp = bpy.context.preferences.filepaths
    fp.save_version = 0
    done = []
    for part in PARTS:
        src = L.C.REBUILD_PARTS[part]
        if os.path.exists(src):
            copy_file(src, os.path.join(out, os.path.basename(src)), libraries_to=out)
            done.append(part)
    copy_file(L.C.REBUILD_BLEND, os.path.join(out, os.path.basename(L.C.REBUILD_BLEND)), libraries_to=out)
    print("SCRATCH", out, "parts", done, "+ composition")


main()
