"""Preserve scene-linear sky values, direction and provenance; no display transform."""
import sys,json
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'daylight_calibration'))
from color_pipeline import read_pass,sha,save_json
from daylight_math import irradiance

root=Path(sys.argv[1]);r=json.loads((root/'request.json').read_text());source=Path(r['source'])/'measurements/E55/sky.exr'
rgb=read_pass(source)
if not np.isfinite(rgb).all() or rgb.min()<0:raise RuntimeError('Invalid atmospheric radiance')
file=root/'clear-afternoon-55.hdr';out=oiio.ImageOutput.create(str(file));spec=oiio.ImageSpec(rgb.shape[1],rgb.shape[0],3,oiio.FLOAT)
out.open(str(file),spec);out.write_image(rgb);out.close()
inp=oiio.ImageInput.open(str(file));decoded=inp.read_image(format=oiio.FLOAT);inp.close()
errors=[]
for normal in [(0,0,1),(0,-1,0),(1,0,0)]:
    expected=irradiance(rgb,normal);actual=irradiance(decoded,normal)
    errors.append(float(np.linalg.norm(actual-expected)/np.linalg.norm(expected)))
if max(errors)>.01:raise RuntimeError('HDR quantization changes receiver irradiance by more than 1%')
save_json(root/'clear-afternoon-55.json',{'schemaVersion':1,'id':'clear-afternoon-55-v1','sourceSha256':sha(source),'hdrSha256':sha(file),'profile':r['profile'],'receiverQuantizationErrors':errors,'sunDiscIncluded':False,'mapping':'Three equirectangular; top-down file; outward direction','workingSpace':'scene-linear Rec.709','intensity':1,'exposureApplied':False})
