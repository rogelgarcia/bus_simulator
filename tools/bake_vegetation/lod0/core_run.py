# Core-canopy phases share the registered LOD0 configuration, publication gate and source hashing.
import shutil
from pathlib import Path

from common import inspect


def run(options):
    phase = options['phase']
    output = Path(options['output'])
    if not (output / 'inspection.json').exists():
        shutil.copy2(Path(options['baseline']) / 'inspection.json', output / 'inspection.json')
    if phase == 'inspect': inspect(options)
    if phase in ['atlas', 'build', 'canopy']:
        from core_atlas import build
        build(options)
    if phase in ['wood', 'build']:
        from wood import build_wood
        build_wood(options)
    if phase in ['cards', 'build', 'canopy']:
        from core_cards import build
        build(options)
    if phase in ['render', 'canopy']:
        from comparison import render_comparisons
        render_comparisons(options)
    if phase == 'wireframe':
        from core_wireframe import render
        render(options)
