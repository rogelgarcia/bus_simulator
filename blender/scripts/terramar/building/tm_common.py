# Terra & Mar (recessed balconies) authoring: shared paths and helpers (AI 614).
#
# Generated models live in blender_files/, non-game inputs in blender_inputs/, and render evidence in
# tests/artifacts/screens/. This folder holds tracked authoring sources; see blender/README.md.
#
# Frame: the config's own footprint frame. three.js (x, y, z) -> Blender (x, -z, y), and the showcase build-site
# offset recorded in the export manifest is removed, so a config point (x, z) lands at Blender (x, -z) and the
# front run A faces Blender -Y. Heights are the game's: the street is z = 0, the building base z = 0.201.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = BP.ROOT
BUILDING_ID = "terramar_recessed"
TAG = os.environ.get("TM_TAG", "before")

ART_DIR = BP.inputs('terramar', 'baseline' if TAG == 'before' else TAG)
GLB = os.path.join(ART_DIR, f"{BUILDING_ID}_{TAG}.glb")
MANIFEST = os.path.join(ART_DIR, f"{BUILDING_ID}_{TAG}.json")
BASELINE = BP.files('terramar', 'baseline', f"{BUILDING_ID}_{TAG}.blend")
PARITY_REPORT = BP.screens('buildings', BUILDING_ID, 'blender_export', f"{BUILDING_ID}_{TAG}.parity.json")
AUDIT_REPORT = BP.screens('buildings', BUILDING_ID, 'blender_export', f"{BUILDING_ID}_{TAG}.audit.json")

# The editable copy (AI 615+): the only file the improvement prompts change; the baseline above stays as extracted.
EDIT_DIR = BP.files('terramar/legacy/edit')
EDIT_BLEND = BP.files('terramar/legacy/edit/terramar_recessed_edit.blend')
EDIT_SCREENS = BP.screens('buildings/terramar_recessed/edit')

# The user's AI-generated 3D models of the reference (low fidelity, an extra source of information only).
REF_MODELS_DIR = BP.inputs('terramar/reference_models')
REF_MODELS_BLEND = BP.files('terramar/legacy/reference_models/terramar_ai_reference_models.blend')
REF_MODELS_REPORT = BP.inputs('terramar/reference_models/terramar_ai_reference_models.fit.json')

SCREENS = BP.screens('buildings/terramar_recessed/blender_export')
SCREENS_GAME = BP.screens('buildings/terramar_recessed/blender_export/game')
SCREENS_BLENDER = BP.screens('buildings/terramar_recessed/blender_export/blender')
SCREENS_SHEETS = BP.screens('buildings/terramar_recessed/blender_export/sheets')
REFERENCES = BP.screens('buildings/terramar_recessed/references')

RIG_CAMERAS = BP.script('terramar/building/rig_cameras.json')
POSES_JSON = BP.script('terramar/building/poses.json')                       # AI 639 comparison poses
POSES_DIR = BP.screens('buildings/terramar_recessed/poses')
B8 = BP.screens('buildings/terramar_recessed/references/b8.png')

# The from-scratch rebuild (AI 642+): layered model generated from rebuild/terramar_plan.json.
REBUILD_SRC = BP.script('terramar/building/rebuild')
REBUILD_PLAN = BP.script('terramar/building/rebuild/terramar_plan.json')
REBUILD_DIR = BP.files('terramar/parts')
# The model is split into part files (build.py target=...) that terramar_building.blend links (compose.py);
# the composition is what the poses, the audit and the checks open.
REBUILD_PARTS = {name: BP.files('terramar', 'parts', f"terramar_part_{role}.blend")
                 for name, role in {'building': 'shell', 'props': 'props', 'site': 'site',
                                    'interiors': 'interiors', 'wear': 'wear'}.items()}
REBUILD_BLEND = BP.files('terramar/terramar_building.blend')
REBUILD_AUDIT = BP.files('terramar/legacy/rebuild/terramar_rebuild.audit.json')
JOINT_LAYOUT = BP.files('terramar/legacy/rebuild/joint_layout.json')
REBUILD_SCREENS = BP.screens('buildings/terramar_recessed/rebuild')
REBUILD_CALIBRATION = BP.screens('buildings/terramar_recessed/rebuild/plan/calibration.json')


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
