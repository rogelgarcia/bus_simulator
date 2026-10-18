"""Rebuild the Bradbury baseline, ornaments, portal, block, wear and city composition."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common.rebuild_pipeline import main


def stages(build):
    build.blender('bradbury-baseline', 'bradbury/building/import_baseline.py',
        ['--output', build.output / 'bradbury/baseline/bradbury_block_before.blend',
         '--report', build.evidence / 'bradbury-baseline.json'])
    build.blender('bradbury-capital', 'bradbury/building/ornaments/capital.py')
    build.blender('bradbury-arch-leaf', 'bradbury/building/ornaments/arch_leaf.py')
    build.blender('bradbury-portal', 'bradbury/building/rebuild_portal.py', ['01', '02', '03', '04', '05', '06', '07', '08'])
    build.blender('bradbury-block', 'bradbury/building/assemble_building.py', ['--no-render'])
    build.blender('bradbury-wear', 'bradbury/building/wear_layer.py')
    build.blender('bradbury-composition', 'bradbury/composition/build_composition.py')


if __name__ == '__main__':
    main('bradbury')
