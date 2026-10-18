"""Render the Bradbury block's standard set of poses, one still each, from the saved render scene.

    python render_poses.py [out=<dir>] [res=2400] [samples=128] [only=09,portal_angled_left,...] [skip=1]

Each pose is one headless Blender running render_wear.py on bradbury_scene.blend (nothing is rebuilt or saved), OptiX
alone, so a pose renders the same every time. Stills go to out= (default
tests/artifacts/screens/bradbury_poses/<date>/), named <nn>_<pose>.png; only= takes pose numbers or names; skip=1 leaves
a pose whose file is already there. A pose that fails (a CUDA error mid-render, as seen on long runs) is tried once more.

The poses (2026-10-08: the first eight; 2026-10-10: 09 to 14, the user asking for "a pose in front of the portal so we
can see inside, not perfectly straight, a bit sideways, but still possible to see inside ... add other poses as well"):
the scene's six cameras (build_scene.py's VIEWS); the ground floor from Broadway's roadway and the portal capital close
up; the portal from a standing eye 8.6 m out, 15 degrees to its right and to its left, its vestibule and doors showing
through the arch (the README's portal stills: level camera, the frame lifted by lens shift, 4:5); the 3rd Street face
with its fire escapes from the roadway, a stop over the scene's exposure since that face is in the sun's shade (as the
flyover's escapes shot); the top cornice and arched windows close from above; the chamfered corner from its pavement;
the cornice's weathered undersides on 3rd Street from below; and (2026-10-10, the user keeping a probe: "there was a
render that had a tree and the building behind it ... add to the catalog") the 3rd Street face from the far pavement,
behind a street tree, at the scene's own exposure.
"""
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import datetime, glob, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = BP.ROOT

POSES = [   # (name, render_wear.py arguments; a res= here overrides the run's width, for the 4:5 frames)
    ("reference_corner", ["view=ref_3q"]),
    ("hero_southeast", ["view=hero_3q"]),
    ("street_crossing", ["view=st_corner"]),
    ("along_broadway", ["view=st_along"]),
    ("portal_from_broadway", ["view=st_portal"]),
    ("looking_up", ["view=st_up"]),
    ("ground_floor_street", ["cam=32,-13,1.8:17,-2,3.6:35"]),
    ("portal_capital_closeup", ["cam=20.0,0.0,3.6:17.0,3.0,4.6:70"]),
    ("portal_angled_right", ["cam=25.70,3.11,1.82:17.39,0.88,1.82:40", "shift=0,0.204", "frame=4:5", "res=1800"]),
    ("portal_angled_left", ["cam=25.70,-1.35,1.82:17.39,0.88,1.82:40", "shift=0,0.204", "frame=4:5", "res=1800"]),
    ("third_street_facade", ["cam=-10,-31,1.7:-10,-18,9:20", "exposure=1"]),
    ("cornice_top_closeup", ["cam=30,-12,21:17,-4,19.5:55"]),
    ("chamfer_corner_street", ["cam=24,-24,1.7:16,-16.4,4.5:28"]),
    ("under_cornice_third_street", ["cam=6,-21.0,1.7:9,-18.2,4.6:28"]),
    ("third_street_behind_tree", ["cam=-10,-44,1.7:-10,-18,10:24"]),
]


def blender_exe():
    return BP.blender_executable()


def main(argv):
    args = dict(a.split("=", 1) for a in argv if "=" in a)
    out = os.path.abspath(args.get("out") or os.path.join(REPO, "tests", "artifacts", "screens", "bradbury_poses",
                                                          datetime.date.today().isoformat()))
    res, samples = args.get("res", "2400"), args.get("samples", "128")
    only = set(filter(None, args.get("only", "").split(",")))
    skip = args.get("skip", "0") == "1"
    os.makedirs(out, exist_ok=True)
    exe = blender_exe(); t_all = time.time(); n = 0
    print(f"{len(POSES)} poses -> {out} ({res} wide, {samples} spp)", flush=True)
    for i, (name, pose_args) in enumerate(POSES, 1):
        tag = f"{i:02d}_{name}"
        if only and not ({f"{i:02d}", str(i), name, tag} & only): continue
        fp = os.path.join(out, tag + ".png")
        if skip and os.path.isfile(fp): print(f"  {tag}: already there", flush=True); continue
        width = next((a.split("=", 1)[1] for a in pose_args if a.startswith("res=")), res)
        cmd = [exe, "-b", "--python-exit-code", "1", "-P", BP.script('bradbury/render/render_wear.py'), "--",
               *[a for a in pose_args if not a.startswith("res=")], f"res={width}", f"samples={samples}", "devices=gpu", f"out={fp}"]
        for attempt in (1, 2):
            t = time.time()
            r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True, errors="replace")
            ok = r.returncode == 0 and "RENDERED" in r.stdout and os.path.isfile(fp)
            if ok: break
            print(f"  {tag}: failed (attempt {attempt}): " + (r.stdout + r.stderr).strip().splitlines()[-1][:200], flush=True)
        if not ok: sys.exit(f"{tag} failed twice")
        n += 1
        print(f"  {tag}: {time.time() - t:.0f}s", flush=True)
    print(f"POSES DONE: {n} rendered in {time.time() - t_all:.0f}s -> {out}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
