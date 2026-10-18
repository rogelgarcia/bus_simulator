# Where the wear layer reads and writes. Everything it generates stays inside portal_project/ (in wear/), referenced
# by paths relative to the .blend that uses them, so a copy of that one folder at the same depth renders the same.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import os

AUTHORING = BP.script('bradbury/building/.')          # .../authoring/BradburyBlock
ROOT = BP.ROOT   # the repo (worktree) root
BRAD = BP.files('bradbury')
ART = BP.files('bradbury')

BLOCK = BP.files('bradbury/parts/bradbury_part_block.blend')        # read only: assemble_building.py writes it
PORTAL = BP.files('bradbury/parts/bradbury_part_portal.blend')      # read only: the pieces write it; the block links it
ORNAMENTS = BP.files('bradbury/parts')               # read only: linked by the portal
ORNAMENT_FILES = tuple(os.path.join(ORNAMENTS, f'bradbury_part_ornament_{name}.blend')
                       for name in ('arch_leaf', 'capital'))

WEAR_DIR = BP.files('bradbury/wear')                     # everything the wear layer writes
WORN_BLOCK = BP.files('bradbury/bradbury_building.blend')
WORN_PORTAL = BP.files('bradbury/parts/bradbury_part_portal_worn.blend')
NODES = BP.files('bradbury/parts/bradbury_part_wear_nodes.blend')      # the WEAR_layer group and the mask images, linked by both
MASKS = BP.files('bradbury/wear/masks')                  # one atlas PNG per feature
CACHE = BP.files('bradbury/wear/cache')                  # per feature: sources, marks, fields, apply data
MANIFEST = BP.files('bradbury/wear/wear_manifest.json')

SCREENS = BP.screens('bradbury_wear')


def rel_to(path, start_dir):
    # a '//'-style Blender path of `path` relative to the folder `start_dir`
    return "//" + os.path.relpath(path, start_dir).replace("\\", "/")
