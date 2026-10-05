# Explicit phases run only through the registered shared bake framework.
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import inspect


def main(options):
    phase = options['phase']
    if options.get('placement') == 'core':
        from core_run import run
        run(options)
        return
    if phase == 'inspect':
        inspect(options)
        return
    if phase in ['all', 'build'] and not (Path(options['output']) / 'inspection.json').exists():
        inspect(options)
    if phase in ['all', 'build', 'canopy', 'atlas', 'spatial-build']:
        from atlas import build_atlases
        build_atlases(options)
    if phase in ['all', 'build', 'wood']:
        from wood import build_wood
        build_wood(options)
    if phase in ['all', 'build', 'canopy', 'cards', 'spatial-build']:
        from canopy import build_cards
        build_cards(options)
    if phase in ['all', 'canopy', 'render']:
        from comparison import render_comparisons
        render_comparisons(options)


if __name__ == '__main__':
    main(json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text()))
