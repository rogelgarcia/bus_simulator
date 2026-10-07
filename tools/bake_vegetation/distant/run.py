# Dispatches distant tree jobs through the registered shared headless Blender entry point.
import json
import sys
from pathlib import Path

here=Path(__file__).parent
sys.path.insert(0,str(here.parent/'lod0'))
sys.path.insert(0,str(here))
options=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
if options['phase']=='build':
    from build import build
    build(options)
elif options['phase']=='render':
    from review import render
    render(options)
elif options['phase']=='diagnose':
    from diagnose import diagnose
    diagnose(options)
