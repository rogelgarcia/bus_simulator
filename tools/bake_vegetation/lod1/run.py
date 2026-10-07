# Runs isolated LOD1 building or full-tree rendering through the shared bake framework.
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / 'lod0'))
sys.path.insert(0, str(Path(__file__).parent))
options = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text())
if options['phase'] == 'build':
    from build import build
    build(options)
elif options['phase'] == 'render':
    from render import render
    render(options)
elif options['phase'] == 'inspect-wood':
    from wood_quality import inspect
    inspect(options)
elif options['phase'] == 'geometry':
    from build import reduce_wood
    from common import clear_scene, triangles, write_json
    for model in options['models']:
        clear_scene(); wood, error = reduce_wood(options, model, False)
        report = {'woodTriangles': triangles(wood.data), 'geometryError': error}
        write_json(Path(options['output'])/model/'wood-quality-trial.json', report)
        print(f'[LOD1] Geometry trial {model}: {report}', flush=True)
