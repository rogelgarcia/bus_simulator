"""Rebuild the portal, the block and the render scene for one stage of the pilaster capital.

    python use_capital_stage.py [1|2] [view ...] [--from STEP]

1 is the plain capital, 2 the carved one cut from the PBR atlas; without a number, portal_lib.CAPITAL_STAGE. Each step
runs in a headless Blender with BRADBURY_CAPITAL_STAGE set to the stage, in this order:

    capital  ornaments/capital.py                both stages rebuilt, the chosen one exported as one mesh per placement
                                                 (portal_lib.CAPITAL_MESHES: the carved capital's sides reach each one's wall)
    portal   rebuild_portal.py -- 02 07          the piers and the pilasters: their shafts end where the capital starts
    block    assemble_building.py --no-render    the brick columns' and narrow piers' capitals, coming down their columns
    wear     wear_layer.py                       the worn copies the scene links (it refuses stale ones)
    scene    build_scene.py [view ...]           the render scene; each view named is rendered (st_corner, st_portal,
                                                 st_along, st_up, hero_3q, ref_3q)

--from STEP starts at that step (the earlier files are taken as they are). Every capital keeps its top where it was
and the stage-2 capital, 0.053 m taller at the pilasters' scale, takes that height out of the pillar under it. Piece
08 is not rerun: it sizes the lettering on the capitals' inner edges and would re-fit it to the carved capital's wider
abacus. To make a stage the default for the single scripts too, set CAPITAL_STAGE in portal_lib.py.
"""
import glob, os, re, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, *[".."] * 6))
PORTAL_BLEND = os.path.join(REPO, "tests", "artifacts", "blender", "bradbury", "portal_project", "bradbury_portal.blend")
STEPS = ("capital", "portal", "block", "wear", "scene")


def blender_exe():
    exe = os.environ.get("BLENDER") or r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
    if os.path.exists(exe): return exe
    found = sorted(glob.glob(r"C:\Program Files\Blender Foundation\Blender*\blender.exe"))
    if found: return found[-1]
    sys.exit("Blender not found: set BLENDER to blender.exe")


def default_stage():
    for line in open(os.path.join(HERE, "portal_lib.py"), encoding="utf-8"):
        if line.startswith("CAPITAL_STAGE ="):
            m = re.search(r'"([12])"\)', line) or re.search(r"=\s*([12])\b", line)   # = int(os.environ.get(..., "2")) or = 2
            if m: return int(m.group(1))
    return 2


def main(argv):
    stage, views, start = None, [], STEPS[0]
    it = iter(argv)
    for a in it:
        if a == "--from": start = next(it)
        elif a in ("1", "2"): stage = int(a)
        else: views.append(a)
    stage = stage or default_stage()
    if start not in STEPS: sys.exit(f"--from must be one of {', '.join(STEPS)}")
    exe = blender_exe()
    py = ["--python-exit-code", "1", "-P"]                               # a Python exception ends Blender with status 1
    cmds = {
        "capital": [exe, "-b", "--factory-startup"] + py + [os.path.join(HERE, "ornaments", "capital.py")],
        "portal": [exe, "-b", PORTAL_BLEND] + py + [os.path.join(HERE, "rebuild_portal.py"), "--", "02", "07"],
        "block": [exe, "-b"] + py + [os.path.join(HERE, "assemble_building.py"), "--", "--no-render"],
        "wear": [exe, "-b"] + py + [os.path.join(HERE, "wear_layer.py"), "--"],
        "scene": [exe, "-b"] + py + [os.path.join(HERE, "build_scene.py"), "--"] + views,
    }
    env = dict(os.environ, BRADBURY_CAPITAL_STAGE=str(stage))
    logs = os.path.join(tempfile.gettempdir(), "bradbury_capital_stage")
    os.makedirs(logs, exist_ok=True)
    print(f"capital stage {stage}: {', '.join(STEPS[STEPS.index(start):])} (logs in {logs})")
    for step in STEPS[STEPS.index(start):]:
        t0 = time.time(); log = os.path.join(logs, step + ".log")
        with open(log, "w", encoding="utf-8", errors="replace") as f:
            r = subprocess.run(cmds[step], cwd=HERE, env=env, stdout=f, stderr=subprocess.STDOUT)
        tail = open(log, encoding="utf-8", errors="replace").read().splitlines()
        failed = r.returncode != 0 or any(l.startswith("Traceback") for l in tail)
        print(f"  {step:8s} {time.time() - t0:6.1f} s  {'FAILED' if failed else 'ok'}")
        if failed:
            print("\n".join(tail[-40:]))
            sys.exit(f"{step} failed: see {log}")
    print("done")


if __name__ == "__main__":
    main(sys.argv[1:])
