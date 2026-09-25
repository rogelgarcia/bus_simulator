# Where the wear layer reads and writes. Everything it generates stays inside portal_project/ (in wear/), referenced
# by paths relative to the .blend that uses them, so a copy of that one folder at the same depth renders the same.
import os

AUTHORING = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # .../authoring/BradburyBlock
ROOT = os.path.normpath(os.path.join(AUTHORING, "..", "..", "..", "..", "..", ".."))   # the repo (worktree) root
BRAD = os.path.join(ROOT, "tests", "artifacts", "blender", "bradbury")
ART = os.path.join(BRAD, "portal_project")

BLOCK = os.path.join(ART, "bradbury_block.blend")        # read only: assemble_building.py writes it
PORTAL = os.path.join(ART, "bradbury_portal.blend")      # read only: the pieces write it; the block links it
ORNAMENTS = os.path.join(ART, "ornaments")               # read only: linked by the portal

WEAR_DIR = os.path.join(ART, "wear")                     # everything the wear layer writes
WORN_BLOCK = os.path.join(WEAR_DIR, "bradbury_block_worn.blend")
WORN_PORTAL = os.path.join(WEAR_DIR, "bradbury_portal_worn.blend")
NODES = os.path.join(WEAR_DIR, "wear_nodes.blend")      # the WEAR_layer group and the mask images, linked by both
MASKS = os.path.join(WEAR_DIR, "masks")                  # one atlas PNG per feature
CACHE = os.path.join(WEAR_DIR, "cache")                  # per feature: sources, marks, fields, apply data
MANIFEST = os.path.join(WEAR_DIR, "wear_manifest.json")

SCREENS = os.path.join(ROOT, "tests", "artifacts", "screens", "bradbury_wear")


def rel_to(path, start_dir):
    # a '//'-style Blender path of `path` relative to the folder `start_dir`
    return "//" + os.path.relpath(path, start_dir).replace("\\", "/")
