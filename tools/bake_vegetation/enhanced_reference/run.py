# Runs enhanced reference stages through the shared isolated Blender backend.
import json
import sys
from pathlib import Path
HERE=Path(__file__).parent
for folder in [HERE.parent/'authoring',HERE.parent/'lod0',HERE]:sys.path.insert(0,str(folder))
o=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
if o['phase']=='materials':
    from surface import validate_materials
    validate_materials(o)
elif o['phase']=='build':
    from model import build
    build(o)
elif o['phase']=='render':
    from render import render
    render(o)
elif o['phase']=='structure':
    from structure import structure
    structure(o)
elif o['phase']=='refine':
    from refine import refine
    refine(o)
elif o['phase']=='inspect':
    from mesh_audit import inspect
    inspect(o)

elif o['phase']=='foliage':
    if o['foliage-layout']=='open':
        from open_leaf_reference import open_leaf_reference
        open_leaf_reference(o)
    elif o['foliage-layout']=='organic':
        from organic_reference import organic_reference
        organic_reference(o)
    elif o['foliage-layout']=='dome':
        from fan_reference import fan_reference
        fan_reference(o)
    else:
        from releaf import releaf
        releaf(o)
elif o['phase']=='posture':
    from posture import posture
    posture(o)
elif o['phase']=='shape':
    from spatial_reference import spatial_reference
    spatial_reference(o)
elif o['phase']=='crown':
    from crown_reference import crown_reference
    crown_reference(o)
elif o['phase']=='leaf-wireframe':
    from leaf_wireframe import render_leaf_wireframe
    render_leaf_wireframe(o)
