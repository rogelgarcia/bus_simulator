"""Compare matching scene-linear captures; lobe names are not treated as source-light names."""
import json
from pathlib import Path
import numpy as np
from color_pipeline import read_pass,three_aces,write_png,Y

def analyze_raw(source,pose,target,reference,regions,output):
    folder=Path(source)/('raw-'+pose)
    if not (folder/'metadata.json').exists():return None
    metadata=json.loads((folder/'metadata.json').read_text())
    shape=(metadata['height'],metadata['width'],4)
    raw=lambda name:np.flipud(np.fromfile(folder/(name+'.rgba32f'),dtype='<f4').reshape(shape))[:,:,:3]
    game=raw('combined');ambient=raw('ambient');sun=game-ambient
    no_ao=raw('ambient_no_material_ao') if (folder/'ambient_no_material_ao.rgba32f').exists() else None
    reference_image=read_pass(target['file'],layer=pose)
    if game.shape!=reference_image.shape:return {'matchedResolution':False}
    if not all(np.isfinite(a).all() for a in [game,ambient,reference_image]):raise RuntimeError('Nonfinite scene-linear capture')
    def stats(a):
        return {'meanRgb':a.mean(axis=(0,1)).tolist(),'luminanceMedian':float(np.median(a@Y)),
            'luminanceMean':float(np.mean(a@Y))}
    def crop(a,rect):
        h,w=a.shape[:2];x0,y0,x1,y1=rect;return a[int(y0*h):int(y1*h),int(x0*w):int(x1*w)]
    reference_sun=None;reference_diffuse=None
    file=Path(reference)/'contributions.json'
    if file.exists():
        record=next(item for item in json.loads(file.read_text()) if item['pose']==pose)
        reference_sun=sum(read_pass(record['file'],family+' Direct',layer=pose)*read_pass(record['file'],family+' Color',layer=pose) for family in ['Diffuse','Glossy'])
        reference_diffuse=(read_pass(target['file'],'Diffuse Direct',layer=pose)+read_pass(target['file'],'Diffuse Indirect',layer=pose))*read_pass(target['file'],'Diffuse Color',layer=pose)
        reference_diffuse-=read_pass(record['file'],'Diffuse Direct',layer=pose)*read_pass(record['file'],'Diffuse Color',layer=pose)
    result={'matchedResolution':True,'metadata':metadata,'regions':{},
        'limitations':'Native raw render bypasses postprocessing and retains material AO textures. Cycles BRDF, fake interiors and denoising differ. Regional aggregates include texture and edge differences, so these are diagnostics without a parity threshold.'}
    out=Path(output)/'raw';out.mkdir(exist_ok=True)
    for name,value in [('game_combined',game),('game_sun',sun),('game_ambient',ambient),('cycles_combined',reference_image)]:
        write_png(out/(Path(source).name+'-'+pose+'-'+name+'.png'),three_aces(np.maximum(value,0),2**target['exposureEv']))
    for name,rect in regions.items():
        a=crop(game,rect);b=crop(reference_image,rect)
        item={'game':stats(a),'cycles':stats(b),'gameSun':stats(crop(sun,rect)),
            'gameAmbient':stats(crop(ambient,rect)),'sceneLinearRMSE':float(np.sqrt(np.mean((a-b)**2)))}
        if reference_sun is not None:item['cyclesSun']=stats(crop(reference_sun,rect));item['cyclesAmbient']=stats(crop(reference_image-reference_sun,rect))
        if no_ao is not None:item['gameAmbientNoMaterialAo']=stats(crop(no_ao,rect))
        result['regions'][name]=item
    if reference_sun is not None:
        indices=read_pass(target.get('maskFile',target['file']),'Material Index',channels=['X'],layer=pose)[:,:,0]
        if indices.shape!=game.shape[:2]:
            h,w=game.shape[:2];ih,iw=indices.shape
            indices=indices[((np.arange(h)+.5)*ih/h).astype(int)[:,None],((np.arange(w)+.5)*iw/w).astype(int)[None,:]]
        scene=json.loads(Path(json.loads((Path(reference)/'scene.json').read_text())['manifest']).read_text())
        audit={item['id']:item for item in scene['materialAudit']}
        result['materials']=[]
        for value in np.unique(indices):
            if value<=0:continue
            mask=indices==value
            for axis in [0,1]:
                for shift in [-2,-1,1,2]:mask &= np.roll(indices,shift,axis)==value
            mask[:2]=False;mask[-2:]=False;mask[:,:2]=False;mask[:,-2:]=False
            count=int(mask.sum())
            if count<500:continue
            identity=scene['build']['materialMasks'][str(int(value))]
            values={'game':game,'cycles':reference_image,'gameSun':sun,'cyclesSun':reference_sun,
                'gameAmbient':ambient,'cyclesAmbient':reference_image-reference_sun,'cyclesDiffuseAmbient':reference_diffuse}
            if no_ao is not None:values['gameAmbientNoMaterialAo']=no_ao
            result['materials'].append({'id':identity,'pixels':count,'audit':audit.get(identity),
                'meanLuminance':{name:float(np.mean(image[mask]@Y)) for name,image in values.items()}})
        result['materialMaskPolicy']='Cycles material IDs, eroded by two pixels, minimum 500 pixels; projection verified separately. Reflection scaling and geometric-normal irradiance remain different representations.'
    return result
