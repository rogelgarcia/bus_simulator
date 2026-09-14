"""Separate production appearance differences from a matched source-material light test."""
import sys,json
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,three_aces,srgb_decode,write_png,save_json,Y


def mask_image(file):
    image=oiio.ImageInput.open(str(file))
    if not image: raise RuntimeError('Missing frozen wall mask: '+str(file))
    try: return image.read_image(format=oiio.FLOAT)[:,:,0]>.5
    finally: image.close()


def erode(mask,distance):
    if not distance:return mask
    result=mask.copy()
    for axis in [0,1]:
        source=result.copy()
        for shift in range(1,distance+1):result&=np.roll(source,shift,axis)&np.roll(source,-shift,axis)
    result[:distance]=False;result[-distance:]=False;result[:,:distance]=False;result[:,-distance:]=False
    return result


root=Path(sys.argv[1]);request=json.loads((root/'request.json').read_text())
capture,control,reference=(Path(request[key]) for key in ['capture','control','reference'])
regions=json.loads((control/'measurements.json').read_text())
controls=json.loads((control/'request.json').read_text())
renders=json.loads((reference/'renders.json').read_text())
scene_manifest=Path(json.loads((reference/'scene.json').read_text())['manifest'])
scene=json.loads(scene_manifest.read_text());material_audit={item['id']:item for item in scene['materialAudit']}
rows=[];sheets=[];(root/'images').mkdir()
for pose in request['poses']:
    name=pose['id'];meta=json.loads((capture/name/'metadata.json').read_text())
    shape=(meta['height'],meta['width'],4)
    game={key:np.flipud(np.fromfile(capture/name/(key+'.rgba32f'),dtype='<f4').reshape(shape))[:,:,:3]
          for key in meta['passes']}
    if not all(np.isfinite(value).all() for value in game.values()):raise RuntimeError('Nonfinite game radiance')
    target=next(item for item in renders if item['pose']==name);exposure=2**target['exposureEv']
    if abs(exposure-meta['exposure'])>1e-8:raise RuntimeError('Exposure changed')
    exr=ExrPasses(target['file'],name)
    cycles=exr.read('Noisy Image');beauty=exr.read()
    diffuse=(exr.read('Diffuse Direct')+exr.read('Diffuse Indirect'))*exr.read('Diffuse Color')
    specular=(exr.read('Glossy Direct')+exr.read('Glossy Indirect'))*exr.read('Glossy Color')
    emission=exr.read('Emission')
    closure=np.abs(cycles-diffuse-specular-emission)
    display={'production':three_aces(game['combined'],exposure),
             'source_control':three_aces(game['source_combined_no_material_ao'],exposure),
             'cycles':three_aces(beauty,exposure)}
    labels={'production':'Current game · authored materials',
            'source_control':'Game diagnostic · source textures, no texture AO/variation',
            'cycles':'Cycles · source-texture reference'}
    for key,value in display.items():write_png(root/'images'/(name+'_'+key+'.png'),value)
    # Keep final appearance pairs separate from the material-isolation comparison.
    sheets.append({'file':str(root/(name+'_current_cycles.png')),
        'panels':[{'file':str(root/'images'/(name+'_'+key+'.png')),'label':labels[key]} for key in ['production','cycles']],
        'width':1920,'height':588})
    for region in next(item['regions'] for item in regions['poses'] if item['pose']==name):
        if not region['region'].endswith('_facade'):continue
        material=material_audit[region['material']]
        unknown=set(material.get('untranslatedProceduralHooks',[]))-{'materialVariationConfig'}
        if (unknown or material.get('hadBumpMap') or material.get('interiorProxy')
                or material.get('busProxy') or material.get('grassProxy')
                or material['sourceType'] not in ('MeshStandardMaterial','MeshPhysicalMaterial')):
            raise RuntimeError('Source-material control does not translate selected wall: '+region['material'])
        stem=name+'_'+region['region'];mask=mask_image(control/'masks'/(stem+'.png'))
        if int(mask.sum())!=region['pixels']:raise RuntimeError('Frozen mask changed: '+stem)
        restoration=float(np.abs(game['combined']-game['combined_restored'])[mask].max())
        closure_error=float(closure[mask].mean()/cycles[mask].mean())
        if restoration>1e-5 or closure_error>1e-5 or emission[mask].max()>1e-6:
            raise RuntimeError(f'{stem}: invalid restoration/pass closure/opaque selection')
        row={'pose':name,'region':region['region'],'material':region['material'],
             'checks':{'restorationMax':restoration,'cyclesClosureMeanRelative':closure_error,
                       'selectedSourceMaterialControlSupported':True},'masks':[]}
        for distance in [0,3,6]:
            selected=erode(mask,distance)
            if selected.sum()<100:continue
            y={key:float((value[selected]@Y).mean()) for key,value in game.items()}
            cy=float((cycles[selected]@Y).mean());dy=float((diffuse[selected]@Y).mean());sy=float((specular[selected]@Y).mean())
            ratios={'productionBeauty':y['combined']/cy,'noTextureAoBeauty':y['combined_no_material_ao']/cy,
                    'sourceBeauty':y['source_combined_no_material_ao']/cy,
                    'sourceDiffuse':y['source_diffuse_no_material_ao']/dy,
                    'sourceSpecular':(y['source_combined_no_material_ao']-y['source_diffuse_no_material_ao'])/sy}
            display_bias={key:float(100*((srgb_decode(value[selected])@Y).mean()/(srgb_decode(display['cycles'][selected])@Y).mean()-1))
                          for key,value in display.items() if key!='cycles'}
            row['masks'].append({'additionalInsetPixels':distance,'pixels':int(selected.sum()),'ratios':ratios,
                'meanSceneLinearY':{'game':y,'cyclesBeauty':cy,'cyclesDiffuse':dy,'cyclesSpecular':sy},
                'displayBiasPercent':display_bias,
                'appearanceGapAttributionPoints':{
                    'textureAo':100*(y['combined_no_material_ao']-y['combined'])/cy,
                    'proceduralMaterial':100*(y['source_combined_no_material_ao']-y['combined_no_material_ao'])/cy,
                    'remainingSourceDifference':100*(cy-y['source_combined_no_material_ao'])/cy}})
        rows.append(row)
        rect=controls['regions']['facades'][name][region['region']]
        x0,y0,x1,y1=[int(v*s) for v,s in zip(rect,[shape[1],shape[0],shape[1],shape[0]])]
        panels=[]
        for key,value in display.items():
            image=value.copy();image[~mask]=.22
            file=root/'images'/(stem+'_'+key+'.png');write_png(file,image[y0:y1,x0:x1])
            panels.append({'file':str(file),'label':labels[key]+' | wall only'})
        width=max(480,x1-x0)
        sheets.append({'file':str(root/(stem+'_material_control.png')),'panels':panels,
            'width':width*3,'height':round((y1-y0)*width/(x1-x0))+48})
        print(json.dumps({'pose':name,'region':region['region'],**row['masks'][0]}),flush=True)

limitations=[
    'Production game retains material variation and texture AO. The source-material game image is a diagnostic, never the shipped appearance.',
    'The saved Cycles reference is unchanged. It omits runtime procedural material variation and texture AO; its beauty is not proof of a game irradiance error.',
    'Only shading inputs are temporarily controlled. Installed baked transport, light, geometry, poses and exposure remain authenticated and unchanged.',
    'Material masks exclude glass and frames using Cycles IDs and erosion. Independent game-ID intersection is not yet implemented.',
    'Mean scene-linear lobe ratios are not a percentage of full-scene visual parity. Sunlit boundary pixels remain sensitive to shadow reconstruction and sampling.',
    'Cycles source normals/texture filtering and Three derivatives/BRDF approximations still differ; local reflections and transparent/proxy materials are not made identical.',
    'This is an offline raw-radiance diagnostic, not a new gameplay timing benchmark. Existing repeated five-pose reflection performance evidence remains separate.']
save_json(root/'analysis.json',{'schemaVersion':1,'comparisonKind':'source-material-controlled-diagnostic','rows':rows,'limitations':limitations})
save_json(root/'sheets.json',sheets)
lines=['# AI568: separate material appearance from illumination','','The reference remains unchanged. All numbers below are mean scene-linear game/Cycles ratios on opaque wall masks.',
       '','| Pose / wall | Pixels | Production beauty | Texture AO off | Source-material beauty | Source diffuse | Source specular |',
       '|---|---:|---:|---:|---:|---:|---:|']
for row in rows:
    sample=row['masks'][0];r=sample['ratios']
    lines.append(f"| {row['pose']} / {row['region']} | {sample['pixels']} | "+' | '.join(f'{r[key]:.4f}' for key in ['productionBeauty','noTextureAoBeauty','sourceBeauty','sourceDiffuse','sourceSpecular'])+' |')
lines+=['','All original and additional 3px/6px inset measurements, AO/material attribution, restoration checks and display scores remain in analysis.json.','']+['- '+value for value in limitations]
(root/'analysis.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
