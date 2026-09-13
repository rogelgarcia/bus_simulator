"""Fixed-exposure comparisons. Cycles diffuse passes are color-demodulated; restore their color once."""
import json,sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,three_aces,write_png,save_json,srgb_encode,Y

def analyze(root,output):
    request=json.loads((root/'request.json').read_text());target=request['target']
    metadata=json.loads((root/'game_raw/metadata.json').read_text())
    shape=(metadata['height'],metadata['width'],4)
    raw=lambda name:np.flipud(np.fromfile(root/'game_raw'/(name+'.rgba32f'),dtype='<f4').reshape(shape))[:,:,:3]
    images={name:raw(name) for name in metadata['passes']}
    cycles=ExrPasses(target['file'],target['pose'])
    images['cycles_combined']=cycles.read()
    images['cycles_diffuse']=(cycles.read('Diffuse Direct')+cycles.read('Diffuse Indirect'))*cycles.read('Diffuse Color')
    images['cycles_albedo']=cycles.read('Diffuse Color')
    indices=cycles.read('Material Index',channels=['X'])[:,:,0]
    if any(a.shape!=images['combined'].shape or not np.isfinite(a).all() for a in images.values()):
        raise RuntimeError('Nonfinite or differently sized radiance passes')
    exposure=2**target['exposureEv']
    if abs(exposure-metadata['exposure'])>1e-8:raise RuntimeError('Exposure changed')
    for name,value in images.items():
        write_png(output/(name+'.png'),srgb_encode(np.maximum(value,0)) if 'albedo' in name else three_aces(np.maximum(value,0),exposure))
    scene_file=json.loads((Path(request['input'])/'cycles/scene.json').read_text())['manifest']
    scene=json.loads(Path(scene_file).read_text());audit={a['id']:a for a in scene['materialAudit']}
    result={'exposure':exposure,'regions':{},'limitations':[
        'Diagnostic raw game output bypasses postprocessing; material AO is distinct from screen-space/contact AO.',
        'Cycles diffuse includes sky direct and indirect paths; it is not a named-sun versus sky separation.',
        'Material masks come from Cycles, eroded by two pixels; exported geometry/procedural hooks still differ.',
        'Cycles Diffuse Color includes its BSDF diffuse weight, so it is an albedo diagnostic, not guaranteed identical to a base-color AOV.'
    ]}
    for region,rect in request['regions'].items():
        h,w=indices.shape;x0,y0,x1,y1=rect
        region_mask=np.zeros((h,w),bool);region_mask[int(y0*h):int(y1*h),int(x0*w):int(x1*w)]=True
        def stats(mask):
            values={key:float(np.mean(image[mask]@Y)) for key,image in images.items()}
            values['materialAoBrighteningPercent']=100*(values['combined_no_material_ao']/max(values['combined'],1e-9)-1)
            values['diffuseNoAoGameToCycles']=values['diffuse_no_material_ao']/max(values['cycles_diffuse'],1e-9)
            return {'pixels':int(mask.sum()),'meanLinearY':values,'meanLinearRgb':{key:image[mask].mean(axis=0).tolist() for key,image in images.items()}}
        entry={'rectangle':rect,**stats(region_mask),'materials':[]}
        for value in np.unique(indices[region_mask]):
            if value<=0:continue
            mask=indices==value
            for axis in [0,1]:
                for shift in [-2,-1,1,2]:mask &= np.roll(indices,shift,axis)==value
            mask &= region_mask
            if mask.sum()<100:continue
            identity=scene['build']['materialMasks'][str(int(value))]
            entry['materials'].append({'id':identity,'audit':audit.get(identity),**stats(mask)})
        entry['materials'].sort(key=lambda a:-a['pixels'])
        result['regions'][region]=entry
    # Restrict restoration validation to the user's static building regions, excluding animated vegetation.
    result['restorationMaxLinearDifference']=max(float(np.max(np.abs(images['combined'][int(r[1]*shape[0]):int(r[3]*shape[0]),int(r[0]*shape[1]):int(r[2]*shape[1])]-images['combined_restored'][int(r[1]*shape[0]):int(r[3]*shape[0]),int(r[0]*shape[1]):int(r[2]*shape[1])]))) for r in request['regions'].values())
    if result['restorationMaxLinearDifference']>1e-5:raise RuntimeError('Static building radiance did not restore')
    save_json(output/'analysis.json',result)
    print(json.dumps({'exposure':exposure,'regions':{key:value['meanLinearY'] for key,value in result['regions'].items()},'restored':result['restorationMaxLinearDifference']}),flush=True)

if __name__=='__main__':analyze(Path(sys.argv[1]),Path(sys.argv[2]) if len(sys.argv)>2 else Path(sys.argv[1]))
