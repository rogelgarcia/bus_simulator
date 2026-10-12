# Dispatches isolated hybrid authoring through the shared bake framework.
import json
import sys
from pathlib import Path
HERE=Path(__file__).parent
for folder in [HERE.parent/'authoring',HERE.parent/'branchlets',HERE.parent/'lod0',HERE]:sys.path.insert(0,str(folder))
options=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
if options['phase']=='atlas':
    from flat_atlas import run
elif options['phase']=='build':
    from hybrid_build import run
elif options['phase'] in ['render','variants']:
    from hybrid_render import run
run(options)
