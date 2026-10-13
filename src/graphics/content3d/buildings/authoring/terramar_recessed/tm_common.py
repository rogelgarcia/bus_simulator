# Terra & Mar (recessed balconies) authoring: shared paths and helpers (AI 614).
#
# Everything generated lives under the gitignored tests/artifacts/ tree; this folder holds the scripts only
# (src/graphics/content3d/buildings/authoring/<ConfigName>/ for configs/<ConfigName>.js). Nothing here reads
# or writes the Bradbury's files.
#
# Frame: the config's own footprint frame. three.js (x, y, z) -> Blender (x, -z, y), and the showcase build-site
# offset recorded in the export manifest is removed, so a config point (x, z) lands at Blender (x, -z) and the
# front run A faces Blender -Y. Heights are the game's: the street is z = 0, the building base z = 0.201.
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
BUILDING_ID = "terramar_recessed"
TAG = os.environ.get("TM_TAG", "before")

ART_DIR = os.path.join(ROOT, "tests", "artifacts", "blender", BUILDING_ID, TAG)
GLB = os.path.join(ART_DIR, f"{BUILDING_ID}_{TAG}.glb")
MANIFEST = os.path.join(ART_DIR, f"{BUILDING_ID}_{TAG}.json")
BASELINE = os.path.join(ART_DIR, f"{BUILDING_ID}_{TAG}.blend")
PARITY_REPORT = os.path.join(ART_DIR, f"{BUILDING_ID}_{TAG}.parity.json")
AUDIT_REPORT = os.path.join(ART_DIR, f"{BUILDING_ID}_{TAG}.audit.json")

# The editable copy (AI 615+): the only file the improvement prompts change; the baseline above stays as extracted.
EDIT_DIR = os.path.join(ROOT, "tests", "artifacts", "blender", BUILDING_ID, "edit")
EDIT_BLEND = os.path.join(EDIT_DIR, f"{BUILDING_ID}_edit.blend")
EDIT_SCREENS = os.path.join(ROOT, "tests", "artifacts", "screens", "buildings", BUILDING_ID, "edit")

# The user's AI-generated 3D models of the reference (low fidelity, an extra source of information only).
REF_MODELS_DIR = os.path.join(ROOT, "tests", "artifacts", "blender", BUILDING_ID, "reference_models")
REF_MODELS_BLEND = os.path.join(REF_MODELS_DIR, "terramar_ai_reference_models.blend")
REF_MODELS_REPORT = os.path.join(REF_MODELS_DIR, "terramar_ai_reference_models.fit.json")

SCREENS = os.path.join(ROOT, "tests", "artifacts", "screens", "buildings", BUILDING_ID, "blender_export")
SCREENS_GAME = os.path.join(SCREENS, "game")
SCREENS_BLENDER = os.path.join(SCREENS, "blender")
SCREENS_SHEETS = os.path.join(SCREENS, "sheets")
REFERENCES = os.path.join(ROOT, "tests", "artifacts", "screens", "buildings", BUILDING_ID, "references")

RIG_CAMERAS = os.path.join(HERE, "rig_cameras.json")
POSES_JSON = os.path.join(HERE, "poses.json")                       # AI 639 comparison poses
POSES_DIR = os.path.join(ROOT, "tests", "artifacts", "screens", "buildings", BUILDING_ID, "poses")
B8 = os.path.join(REFERENCES, "b8.png")

# The from-scratch rebuild (AI 642+): layered model generated from rebuild/terramar_plan.json.
REBUILD_SRC = os.path.join(HERE, "rebuild")
REBUILD_PLAN = os.path.join(REBUILD_SRC, "terramar_plan.json")
REBUILD_DIR = os.path.join(ROOT, "tests", "artifacts", "blender", BUILDING_ID, "rebuild")
REBUILD_BLEND = os.path.join(REBUILD_DIR, "terramar_rebuild.blend")
REBUILD_AUDIT = os.path.join(REBUILD_DIR, "terramar_rebuild.audit.json")
REBUILD_SCREENS = os.path.join(ROOT, "tests", "artifacts", "screens", "buildings", BUILDING_ID, "rebuild")
REBUILD_CALIBRATION = os.path.join(REBUILD_SCREENS, "plan", "calibration.json")


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_manifest():
    return load_json(MANIFEST)


def load_rig():
    return load_json(RIG_CAMERAS)


def placement_shift(manifest):
    """Blender-space translation that removes the showcase build-site offset (three x/z -> Blender x/-z)."""
    off = (manifest.get("placement") or {}).get("offset") or {"x": 0.0, "z": 0.0}
    return (-float(off["x"]), float(off["z"]), 0.0)


def url_to_path(url):
    """A texture URL from the manifest (http://host:port/assets/...) -> the file under the repo root, or None."""
    if not url or "/assets/" not in url:
        return None
    rel = url.split("/assets/", 1)[1].split("?", 1)[0]
    p = os.path.join(ROOT, "assets", *rel.split("/"))
    return p if os.path.exists(p) else None
