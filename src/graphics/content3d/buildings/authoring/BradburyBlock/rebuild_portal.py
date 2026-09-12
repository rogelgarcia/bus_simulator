"""Rebuild portal pieces headlessly, in order, saving after each:

    blender -b bradbury_portal.blend -P rebuild_portal.py -- 02 06 07 08

Each argument is a piece number (or a full script name under pieces/). The
piece scripts clear their own collection, rebuild it, render their review
images and save bradbury_portal.blend, exactly as when run from the UI.
"""
import bpy, os, sys, glob, io, contextlib, logging, warnings
logging.getLogger('glTFImporter').setLevel(logging.WARNING); warnings.simplefilter("ignore")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))                                   # the pieces live next to this script (authoring); the .blend is generated into tests/artifacts
if not bpy.data.filepath: bpy.ops.wm.read_homefile(use_empty=True)                 # from scratch: start from an empty scene, not the default cube
for arg in argv:
    matches = glob.glob(os.path.join(HERE, "pieces", arg + "*.py")) if not arg.endswith(".py") else [os.path.join(HERE, "pieces", arg)]
    if not matches:
        print("NO PIECE FOR", arg); sys.exit(1)
    path = matches[0]
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exec(compile(open(path, encoding="utf-8").read(), path, "exec"), {"__name__": "__main__"})
    print("PIECE", os.path.basename(path), "->", buf.getvalue().strip().splitlines()[-1] if buf.getvalue().strip() else "done")
print("REBUILD DONE")
