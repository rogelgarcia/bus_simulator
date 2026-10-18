"""Rebuild Terra & Mar's derived inputs, baseline, five parts, entry and city composition."""
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common.rebuild_pipeline import main, SCRIPTS


def stages(build):
    build.python('terramar-signs', 'terramar/building/rebuild/trace_sign.py',
                 ['--output', build.output / 'terramar/derived/sign'])
    build.run('terramar-vegetation', build.args.node,
              [SCRIPTS / 'terramar/building/rebuild/decode_vegetation_glb.mjs', '--output', build.output / 'terramar/derived/vegetation'])
    (build.output / 'terramar/baseline').mkdir(parents=True)
    report = build.evidence / 'buildings/terramar_recessed/blender_export/terramar_recessed_before.parity.json'
    report.parent.mkdir(parents=True)
    build.blender('terramar-baseline', 'terramar/building/import_baseline.py')
    if not json.loads(report.read_text(encoding='utf-8'))['all_ok']:
        raise RuntimeError(f'Terra & Mar baseline failed its export contract: {report}')
    build.blender('terramar-parts', 'terramar/building/rebuild/build.py', ['target=all'])
    build.blender('terramar-composition', 'terramar/composition/build_composition.py')


if __name__ == '__main__':
    main('terramar')
