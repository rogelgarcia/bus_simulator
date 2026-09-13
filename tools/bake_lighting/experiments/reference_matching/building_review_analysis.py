"""Separate diffuse-model and AO differences on the custom pose's opaque material masks."""
import json,sys
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,three_aces,write_png,save_json,srgb_decode,Y

capture,reference,output=map(Path,sys.argv[1:4])
full=json.loads((reference/'full/renders.json').read_text())
control=json.loads((reference/'geometric_diffuse/renders.json').read_text())
pointer=json.loads((reference/'full/scene.json').read_text())
scene=json.loads(Path(pointer['manifest']).read_text())
source=json.loads(Path(scene['sourceManifest']).read_text())
result={'groundCoverage':source['groundCoverage'],'materials':[],
    'conditions':'Fixed exposure, ACESFilmic, no grade change. Primary geometric Lambert control is a diagnostic, not the physical target.',
    'limits':['Global environment reflections lack local specular occlusion/parallax.',
              'Game material AO is measured separately; diffuse control disables Cycles bump correction and primary glossy response.',
              'Material masks exclude glass but procedural hooks and secondary material transport can still differ.']}
if (capture/'custom_raw').is_dir():
    target=next(r for r in full if r['pose']=='pose_custom');lambert=next(r for r in control if r['pose']=='pose_custom')
    metadata=json.loads((capture/'custom_raw/metadata.json').read_text())
    shape=(metadata['height'],metadata['width'],4);exposure=2**target['exposureEv']
    if abs(exposure-metadata['exposure'])>1e-8:raise RuntimeError('Exposure mismatch')
    def game(name):return np.flipud(np.fromfile(capture/'custom_raw'/(name+'.rgba32f'),dtype='<f4').reshape(shape))[:,:,:3]
    def diffuse(exr):return (exr.read('Diffuse Direct')+exr.read('Diffuse Indirect'))*exr.read('Diffuse Color')
    physical=ExrPasses(target['file'],'pose_custom');geometric=ExrPasses(lambert['file'],'pose_custom')
    images={'game_diffuse':game('diffuse'),'game_diffuse_no_ao':game('diffuse_no_material_ao'),
            'cycles_diffuse':diffuse(physical),'geometric_diffuse':diffuse(geometric)}
    for name,image in images.items():
        if image.shape!=shape[:2]+(3,) or not np.isfinite(image).all():raise RuntimeError('Invalid radiance')
        write_png(output/(name+'.png'),three_aces(np.maximum(image,0),exposure))
    def screenshot(file):
        image=oiio.ImageInput.open(str(file))
        if not image:raise RuntimeError('Missing comparison image: '+str(file))
        try:rgb=image.read_image(format=oiio.FLOAT)[:,:,:3]
        finally:image.close()
        if rgb.shape!=shape[:2]+(3,) or not np.isfinite(rgb).all():raise RuntimeError('Invalid comparison image')
        return rgb
    beauty={'original':screenshot(capture/'pose_custom-original.png'),
            'reflections':screenshot(capture/'pose_custom-reflections.png'),
            'cycles':screenshot(target['image'])}
    result['beautyMetric']='Display-linear luminance and sRGB RGB mean absolute error over the same eroded opaque masks; not scene-linear irradiance.'
    indices=physical.read('Material Index',channels=['X'])[:,:,0]
    audit={a['id']:a for a in scene['materialAudit']}
    for value in np.unique(indices):
        if value<=0:continue
        name=scene['build']['materialMasks'][str(int(value))];material=audit.get(name,{})
        if material.get('scope')!='city' or material.get('role')!='authored' or material.get('interiorProxy') or material.get('metalness',0)>.2 or material.get('opacity',1)<1:continue
        mask=indices==value
        for axis in [0,1]:
            for shift in [-2,-1,1,2]:mask &= np.roll(indices,shift,axis)==value
        # Only the building facade, away from road, bus and lower contact edges.
        region=np.zeros(indices.shape,bool);region[:int(shape[0]*.48),int(shape[1]*.25):int(shape[1]*.97)]=True;mask &= region
        if mask.sum()<1000:continue
        means={key:float((image[mask]@Y).mean()) for key,image in images.items()}
        beauty_means={key:float((srgb_decode(image[mask])@Y).mean()) for key,image in beauty.items()}
        errors={key:float(np.abs(beauty[key][mask]-beauty['cycles'][mask]).mean()) for key in ['original','reflections']}
        result['materials'].append({'id':name,'pixels':int(mask.sum()),'meanLinearY':means,
            'gameToFullDiffuse':means['game_diffuse_no_ao']/max(means['cycles_diffuse'],1e-9),
            'gameToGeometricDiffuse':means['game_diffuse_no_ao']/max(means['geometric_diffuse'],1e-9),
            'beauty':{'meanDisplayLinearY':beauty_means,'meanAbsoluteSrgbError':errors,
                'errorReductionPercent':100*(1-errors['reflections']/max(errors['original'],1e-9))}})
    result['materials'].sort(key=lambda row:-row['pixels'])
    result['exposure']=exposure
save_json(output/'analysis.json',result)
print(json.dumps(result),flush=True)
