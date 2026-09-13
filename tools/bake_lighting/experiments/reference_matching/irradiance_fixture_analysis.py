"""Compare the same central surface area and lobes without a display transform."""
import sys,json
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,save_json
root=Path(sys.argv[1]);results=[]
for name,channel in [('sky','Diffuse Direct'),('bounce','Diffuse Indirect')]:
    bake=np.flipud(np.load(root/(name+'.npy')))[:,:,:3]*np.array([.12,.24,.48])
    exr=ExrPasses(root/(name+'.exr'),'fixture');render=exr.read(channel)*exr.read('Diffuse Color')
    a=bake[16:48,16:48].mean(axis=(0,1));b=render[16:48,16:48].mean(axis=(0,1))
    error=float(np.max(np.abs(a-b)/np.maximum(b,1e-6)))
    results.append({'lobe':name,'bake':a.tolist(),'render':b.tolist(),'maximumRelativeMeanError':error,'passed':error<.025})
save_json(root/'analysis.json',{'checks':results,'settings':json.loads((root/'settings.json').read_text())})
print(json.dumps(results),flush=True)
if not all(row['passed'] for row in results):raise RuntimeError('Native bake/render lobe parity failed; preserve fixture')
