"""Check native scene-linear sunlight, directional sky and additivity against measured E55."""
import sys,json,math
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'daylight_calibration'))
from color_pipeline import read_pass,save_json
from analyze import shadow_profile

root=Path(sys.argv[1]);request=json.loads((root/'request.json').read_text());p=request['profile'];config=request['calibrated']
if sys.argv[2]=='prepare':
    rgb=read_pass(Path(request['source'])/'measurements/E55/sky.exr');h,w=rgb.shape[:2]
    rgba=np.ones((h,w,4),np.float32);rgba[:,:,:3]=rgb;np.flipud(rgba).astype('<f4').tofile(root/'sky.rgba32f')
    direction=p['sunDirectionBlender'];profile={**p,'model':'atmosphere','skyFile':str(root/'sky.rgba32f'),'skyWidth':w,'skyHeight':h,
        'sunDirectionThree':[direction[0],direction[2],-direction[1]],'angularDiameterDeg':config['angularDiameterDeg']}
    save_json(root/'daylight.json',{'profiles':[profile],'exposureMultiplier':config['exposure']})
else:
    records=json.loads((root/'game.json').read_text())['records'];checks=[];values={};shadows={}
    def check(name,observed,expected,tolerance):
        a=np.asarray(observed);b=np.asarray(expected);error=float(np.linalg.norm(a-b)/max(np.linalg.norm(b),1e-7))
        checks.append({'name':name,'error':error,'limit':tolerance,'passed':math.isfinite(error) and error<=tolerance,'observed':a.tolist(),'expected':b.tolist()})
    check('Runtime sun RGB equals measured integral',config['sunNormalRgb'],p['sunNormalRgb'],1e-8)
    sun=np.array(p['sunNormalRgb']);direction=np.array(p['sunDirectionBlender']);normals={'horizontal':[0,0,1],'east':[1,0,0],'north':[0,1,0]}
    for record in records:
        raw=np.flipud(np.fromfile(record['raw'],dtype='<f4').reshape(record['height'],record['width'],4))[:,:,:3]
        if record['kind'].startswith('shadow_'):shadows[record['kind']]=shadow_profile(raw);continue
        if record['kind'] not in normals:continue
        observed=raw[32:96,32:96].mean(axis=(0,1));sky=np.array(p['skyIrradiance'][record['kind']]);direct=sun*max(float(direction@normals[record['kind']]),0)
        expected={'sun':direct,'sky':sky,'combined':sky+direct}[record['mode']]*.18/math.pi
        check(record['id'],observed,expected,p['defaults']['tolerances']['nativeRelative']);values[(record['kind'],record['mode'])]=observed
    for normal in normals:check(normal+' source additivity',values[(normal,'sun')]+values[(normal,'sky')],values[(normal,'combined')],p['defaults']['tolerances']['additivityRelative'])
    near=shadows['shadow_near']['width10to90Meters'];far=shadows['shadow_far']['width10to90Meters']
    checks.append({'name':'Native finite sun penumbra grows with gap','nearMeters':near,'farMeters':far,'passed':math.isfinite(far) and far>2.5*near})
    save_json(root/'validation.json',{'checks':checks,'shadows':shadows,'scope':'Raw native analytical sun and PMREM sky conversion at 55 degrees; finite directional shadow fixture. Full city cache parity is a separate mandatory production gate.'})
    print(json.dumps({'passed':sum(c['passed'] for c in checks),'total':len(checks),'checks':checks}),flush=True)
    if not all(c['passed'] for c in checks):raise RuntimeError('Native afternoon validation failed')
