"""Resolved material inputs, density convergence and named-light lobe controls."""
import json,sys
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,three_aces,write_png,save_json,Y

def erode(mask,distance):
    result=mask.copy()
    if not distance:return result
    for axis in [0,1]:
        source=result.copy()
        for shift in range(1,distance+1):result&=np.roll(source,shift,axis)&np.roll(source,-shift,axis)
    result[:distance]=False;result[-distance:]=False;result[:,:distance]=False;result[:,-distance:]=False
    return result

def mean_y(value,mask):return float(np.mean(value[mask]@Y))
def ratio(a,b):return a/b if b>1e-6 else None

root=Path(sys.argv[1]);r=json.loads((root/'request.json').read_text());capture=Path(r['capture']);reference=Path(r['reference']);control=Path(r['control'])
regions=json.loads((control/'measurements.json').read_text());renders=json.loads((reference/'renders.json').read_text())
source_manifest=json.loads(Path(json.loads((reference/'scene.json').read_text())['manifest']).read_text())
source=json.loads(Path(source_manifest['sourceManifest']).read_text())
native_materials={name for surface in source['surfaceMaterials'] for name in surface['materials']}
previous=json.loads((Path(r['previousReference'])/'renders.json').read_text()) if r.get('previousReference') else []
contributions=json.loads((reference/'contributions.json').read_text())
transport=json.loads((Path(r['transport'])/'renders.json').read_text()) if r.get('transport') else []
rows=[];sheets=[];additional=[];(root/'images').mkdir()
(root/'facades').mkdir()

def view_vectors(pose,width,height):
    camera=pose['pose']['camera'];q=camera['quaternion'];x,y,z,w=[q[k] for k in ['x','y','z','w']]
    rotation=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                       [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                       [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    scale=np.tan(np.radians(camera['fovDeg'])/2)
    xx,yy=np.meshgrid((2*(np.arange(width)+.5)/width-1)*scale*width/height,(1-2*(np.arange(height)+.5)/height)*scale)
    view=np.stack([-xx,-yy,np.ones_like(xx)],axis=2)@rotation.T
    return view/np.linalg.norm(view,axis=2,keepdims=True)
for pose in r['poses']:
    name=pose['id'];meta=json.loads((capture/name/'metadata.json').read_text());shape=(meta['height'],meta['width'],4)
    game={key:np.flipud(np.fromfile(capture/name/(key+'.rgba32f'),dtype='<f4').reshape(shape))[:,:,:3] for key in meta['passes']}
    if not all(np.isfinite(v).all() for v in game.values()):raise RuntimeError('Invalid native capture')
    target=next(x for x in renders if x['pose']==name);exposure=2**target['exposureEv']
    if abs(exposure-meta['exposure'])>1e-8:raise RuntimeError('Changed exposure')
    exr=ExrPasses(target['file'],name);beauty=exr.read();radiance=exr.read('Noisy Image')
    diffuse=(exr.read('Diffuse Direct')+exr.read('Diffuse Indirect'))*exr.read('Diffuse Color')
    glossy=(exr.read('Glossy Direct')+exr.read('Glossy Indirect'))*exr.read('Glossy Color')
    emission=exr.read('Emission');closure=np.abs(radiance-diffuse-glossy-emission)
    sun=ExrPasses(next(x['file'] for x in contributions if x['pose']==name),name)
    direct=sun.read('Diffuse Direct')*sun.read('Diffuse Color')
    direct_specular=sun.read('Glossy Direct')*sun.read('Glossy Color')
    del sun
    albedo=exr.read('AI568 Base Color');rough=exr.read('AI568 Roughness',channels=['X'])[:,:,0];ao=exr.read('AI568 Texture AO',channels=['X'])[:,:,0]
    normal=exr.read('AI568 World Normal',optional=True)
    if normal is not None:
        normal=normal*2-1;normal=np.stack([normal[:,:,0],normal[:,:,2],-normal[:,:,1]],axis=2)
        normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-8)
    # This is a named artistic control, not physical Cycles or a new target.
    # Match Three's authored-AO composition only; never multiply Base Color,
    # named-sun terms or the full beauty by the AO map.
    ao_control=None
    if normal is not None:
        no_v=np.clip(np.sum(normal*view_vectors(pose,meta['width'],meta['height']),axis=2),0,1)
        specular_ao=np.clip(np.power(np.maximum(no_v+ao,1e-8),np.exp2(-16*rough-1))-1+ao,0,1)
        ao_control=radiance-(diffuse-direct)*(1-ao[:,:,None])-(glossy-direct_specular)*(1-specular_ao[:,:,None])
    lower=ExrPasses(next(x['file'] for x in previous if x['pose']==name),name) if previous else None
    low_radiance=lower.read('Noisy Image') if lower else None
    if lower:del lower
    global_glossy=None
    if transport:
        match=next(x for x in transport if x['pose']==name and x['variant']['id']=='global_glossy')
        global_exr=ExrPasses(match['file'],name)
        global_glossy=(global_exr.read('Glossy Direct')+global_exr.read('Glossy Indirect'))*global_exr.read('Glossy Color')
        del global_exr
    for key,value in [('game',game['combined']),('cycles',beauty)]:write_png(root/'images'/(name+'_'+key+'.png'),three_aces(value,exposure))
    sheets.append({'file':str(root/(name+'.png')),'panels':[{'file':str(root/'images'/(name+'_game.png')),'label':'Current game · authored materials'}, {'file':str(root/'images'/(name+'_cycles.png')),'label':'Cycles · resolved materials, physical occlusion'}]})
    selected_regions=next((p['regions'] for p in regions['poses'] if p['pose']==name),None)
    if selected_regions is None:
        additional.append({'pose':name,'policy':'Independent saved close-up; visual validation only, no invented regional score.'});continue
    for region in selected_regions:
        if not region['region'].endswith('_facade'):continue
        image=oiio.ImageInput.open(str(control/'masks'/(name+'_'+region['region']+'.png')));mask=image.read_image(format=oiio.FLOAT)[:,:,0]>.5;image.close()
        if int(mask.sum())!=region['pixels']:raise RuntimeError('Changed frozen wall mask')
        restoration=float(np.max(np.abs(game['combined']-game['combined_restored'])[mask]))
        cycle_closure=float(np.mean(closure[mask])/np.mean(radiance[mask]))
        if restoration>1e-5 or cycle_closure>1e-5 or emission[mask].max()>1e-6:raise RuntimeError('Failed restoration / lobe closure / opaque mask')
        lobes='direct_no_material_ao' in game and 'environment_specular_no_material_ao' in game
        if lobes:
            native_closure=float(np.max(np.abs(game['combined_no_material_ao']-game['diffuse_no_material_ao']-game['direct_specular_no_material_ao']-game['environment_specular_no_material_ao'])[mask]))
            diffuse_closure=float(np.max(np.abs(game['diffuse_no_material_ao']-game['direct_no_material_ao']-game['indirect_no_material_ao'])[mask]))
            if max(native_closure,diffuse_closure)>1e-4:raise RuntimeError('Native lobe closure failed')
        else:native_closure=diffuse_closure=None
        native=region['material'] in native_materials
        if native and ao_control is not None:
            ys,xs=np.nonzero(mask);crop=(slice(max(0,ys.min()-16),min(shape[0],ys.max()+17)),slice(max(0,xs.min()-16),min(shape[1],xs.max()+17)))
            for key,value in [('game',game['combined']),('cycles_physical',radiance),('cycles_authored_ao_control',ao_control)]:
                image=three_aces(value,exposure);image[~mask]=.16
                write_png(root/'facades'/(name+'_'+region['region']+'_'+key+'.png'),image)
                write_png(root/'facades'/(name+'_'+region['region']+'_'+key+'_crop.png'),image[crop])
            sheets.append({'file':str(root/'facades'/(name+'_'+region['region']+'_ao_matched.png')),'panels':[
                {'file':str(root/'facades'/(name+'_'+region['region']+'_game_crop.png')),'label':'Current game · measured opaque wall only'},
                {'file':str(root/'facades'/(name+'_'+region['region']+'_cycles_authored_ao_control_crop.png')),'label':'Cycles + matching authored AO · artistic control'}]})
        row={'pose':name,'region':region['region'],'material':region['material'],'nativeSurfaceEvaluated':native,
             'checks':{'restorationMax':restoration,'cyclesClosureRelative':cycle_closure,'nativeLobeClosureMax':native_closure,'nativeDiffuseClosureMax':diffuse_closure},'masks':[]}
        for distance in [0,3,6]:
            selected=erode(mask,distance)
            if selected.sum()<100:continue
            cy=mean_y(radiance,selected);gy={key:mean_y(v,selected) for key,v in game.items()}
            sample={'additionalInsetPixels':distance,'pixels':int(selected.sum()),'gameToCycles':gy['combined']/cy,'gameNoAoToCycles':gy['combined_no_material_ao']/cy,
                    'baseColorMeanRatioRGB':(np.mean(game['albedo'][selected],axis=0)/np.mean(albedo[selected],axis=0)).tolist() if native else None,
                    'baseColorMeanAbsError':float(np.mean(np.abs(game['albedo'][selected]-albedo[selected]))) if native else None,
                    'roughnessGame':float(np.mean(game['roughness'][selected,0])),'roughnessCycles':float(np.mean(rough[selected])) if native else None,
                    'textureAoGame':float(np.mean(game['texture_ao'][selected,0])) if 'texture_ao' in game else None,'textureAoCycles':float(np.mean(ao[selected])) if native else None,
                    'gameToAuthoredAoCyclesControl':ratio(gy['combined'],mean_y(ao_control,selected)) if native and ao_control is not None else None,
                    'densityRadianceChangePercent':100*(cy/mean_y(low_radiance,selected)-1) if low_radiance is not None else None}
            if native and normal is not None and 'normal' in game:
                gn=game['normal'][selected]*2-1;gn/=np.maximum(np.linalg.norm(gn,axis=1,keepdims=True),1e-8)
                angle=np.degrees(np.arccos(np.clip(np.sum(gn*normal[selected],axis=1),-1,1)))
                sample['normalAngleDeg']={'median':float(np.median(angle)),'p95':float(np.percentile(angle,95))}
            if lobes:
                env_diffuse=diffuse-direct;env_specular=glossy-direct_specular
                pairs={'diffuse':('diffuse_no_material_ao',diffuse),'namedSunDiffuse':('direct_no_material_ao',direct),'skyBounceDiffuse':('indirect_no_material_ao',env_diffuse),
                       'namedSunSpecular':('direct_specular_no_material_ao',direct_specular),'environmentSpecular':('environment_specular_no_material_ao',env_specular)}
                sample['lobes']={key:{'gameMeanY':gy[g],'cyclesMeanY':mean_y(c,selected),'ratio':ratio(gy[g],mean_y(c,selected))} for key,(g,c) in pairs.items()}
                sample['differenceAttributionPoints']={'textureAO':100*(gy['combined_no_material_ao']-gy['combined'])/cy,'diffuse':100*(mean_y(diffuse,selected)-gy['diffuse_no_material_ao'])/cy,
                    'specular':100*(mean_y(glossy,selected)-gy['direct_specular_no_material_ao']-gy['environment_specular_no_material_ao'])/cy}
                if global_glossy is not None:
                    spec=gy['direct_specular_no_material_ao']+gy['environment_specular_no_material_ao']
                    sample['globalGlossyControl']={'gameToFullSpecular':ratio(spec,mean_y(glossy,selected)),
                        'gameToGlobalSpecular':ratio(spec,mean_y(global_glossy,selected)),
                        'cyclesSpecularFull':mean_y(glossy,selected),'cyclesSpecularGlobal':mean_y(global_glossy,selected)}
            row['masks'].append(sample)
        rows.append(row);print(json.dumps({'pose':name,'wall':region['region'],**row['masks'][0]}),flush=True)
    del exr,game
policy=['Physical Cycles retains geometric visibility; authored texture AO stays separate, never multiplied into Base Color.',
        'An explicitly labeled Cycles + authored AO artistic wall-only control applies the native AO equation to sky/bounce diffuse and environment specular. Physical reference images remain unchanged. Unsupported surface AOVs are excluded; this is not a physical-lighting correction.',
        'Lobes use color-weighted noisy Cycles passes; named-sun terms come from sun-only Direct, not full-world Direct. All bounce stays in sky/bounce and environment terms.',
        'Masks are frozen opaque-wall selections with additional 0/3/6px inset sensitivity. Windows are excluded. Insets alter the sampled area, not only edge contamination.',
        'Native and Cycles BRDF lobe accounting, filtering and global versus local reflection visibility differ. Ratios are regional means, not whole-scene accuracy.',
        'No game setting, bake source, light gain, exposure or AO policy changed during this analysis.']
save_json(root/'analysis.json',{'schemaVersion':2,'rows':rows,'additionalViews':additional,'policies':policy});save_json(root/'sheets.json',sheets)
lines=['# AI568 resolved material / transport validation','','| Pose / wall | Game / Cycles | AO off / Cycles | Diffuse | Sky + bounce | Environment specular | Density change |','|---|---:|---:|---:|---:|---:|---:|']
for row in rows:
    s=row['masks'][0];l=s.get('lobes',{});values=[s['gameToCycles'],s['gameNoAoToCycles'],l.get('diffuse',{}).get('ratio'),l.get('skyBounceDiffuse',{}).get('ratio'),l.get('environmentSpecular',{}).get('ratio')]
    lines.append(f"| {row['pose']} / {row['region']} | "+' | '.join('n/a' if v is None else f'{v:.4f}' for v in values)+' | '+('n/a' if s['densityRadianceChangePercent'] is None else f"{s['densityRadianceChangePercent']:+.3f}%")+' |')
lines+=['','']+['- '+p for p in policy]
(root/'analysis.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
