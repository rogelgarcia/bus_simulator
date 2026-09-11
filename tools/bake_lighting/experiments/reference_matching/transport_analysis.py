"""Analyze the controlled transport reference without accepting it as the visual target."""
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from raw_analysis import analyze_raw
root=Path(sys.argv[1]);request=json.loads((root/'request.json').read_text())
regions=json.loads(Path(__file__).with_name('review.json').read_text())['regions']
targets=json.loads((root/'renders.json').read_text())
if request.get('reconstructSource'):
    masks=json.loads((Path(request['referenceInput'])/'renders.json').read_text())
    for target in targets:target['maskFile']=next(item['file'] for item in masks if item['pose']==target['pose'])
results={target['pose']:analyze_raw(request['capture'],target['pose'],target,root,regions[target['pose']],root) for target in targets}
if request.get('reconstructSource'):
    for value in results.values():
        value['regions'].pop('bus',None)
        value['reconstructionLimits']='Static bake scene excludes dynamic buses; only static facade/material regions are interpretable. The original reference supplies material masks, sampled at pixel centers when resolutions differ.'
        value['materials']=[item for item in value['materials'] if item.get('audit',{}).get('sourceType') in ['MeshStandardMaterial','MeshPhysicalMaterial']]
if any(not result or not result['matchedResolution'] for result in results.values()):raise RuntimeError('Controlled transport capture must match resolution')
(root/'transport_analysis.json').write_text(json.dumps(results,indent=2))
print(json.dumps({'poses':list(results),'diagnosticOnly':True}),flush=True)
