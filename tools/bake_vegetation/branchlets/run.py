# Runs isolated canopy-only authoring and captures through the shared bake framework.
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
for folder in [HERE.parent/'lod0', HERE.parent/'lod1', HERE]: sys.path.insert(0, str(folder))
options = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text())
if options['phase'] == 'atlas':
    from branchlet_atlas import build_atlases
    build_atlases(options)
elif options['phase'] == 'build':
    from rebuild import build
    build(options)
elif options['phase'] == 'render':
    from compare import render
    render(options)
