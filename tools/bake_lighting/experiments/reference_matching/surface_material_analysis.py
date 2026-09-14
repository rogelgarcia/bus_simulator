"""Validate surface inputs before interpreting residual radiance differences."""
import sys,json
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,three_aces,write_png,save_json,Y

root=Path(sys.argv[1]);r=json.loads((root/'request.json').read_text());capture=Path(r['capture']);reference=Path(r['reference']);control=Path(r['control'])
regions=json.loads((control/'measurements.json').read_text());renders=json.loads((reference/'renders.json').read_text())
exported=json.loads(Path(json.loads((reference/'scene.json').read_text())['manifest']).read_text())
source=json.loads(Path(exported['sourceManifest']).read_text())
native_materials={name for surface in source['surfaceMaterials'] for name in surface['materials']}
original=json.loads((Path(r['originalReference'])/'renders.json').read_text());rows=[];sheets=[];(root/'images').mkdir()
for pose in r['poses']:
    name=pose['id'];meta=json.loads((capture/name/'metadata.json').read_text());shape=(meta['height'],meta['width'],4)
    game={key:np.flipud(np.fromfile(capture/name/(key+'.rgba32f'),dtype='<f4').reshape(shape))[:,:,:3] for key in ['combined','combined_no_material_ao','combined_restored','albedo','roughness']}
    target=next(x for x in renders if x['pose']==name);old_target=next(x for x in original if x['pose']==name)
    exposure=2**target['exposureEv']
    if abs(exposure-meta['exposure'])>1e-8:raise RuntimeError('Changed exposure')
    exr=ExrPasses(target['file'],name);old=ExrPasses(old_target['file'],name)
    beauty=exr.read();radiance=exr.read('Noisy Image');old_rad=old.read('Noisy Image')
    albedo=exr.read('AI568 Base Color');rough=exr.read('AI568 Roughness',channels=['X'])[:,:,0];ao=exr.read('AI568 Texture AO',channels=['X'])[:,:,0]
    for key,value in [('game',game['combined']),('cycles',beauty)]:write_png(root/'images'/(name+'_'+key+'.png'),three_aces(value,exposure))
    sheets.append({'file':str(root/(name+'.png')),'panels':[{'file':str(root/'images'/(name+'_game.png')),'label':'Current game · authored materials'}, {'file':str(root/'images'/(name+'_cycles.png')),'label':'Cycles · resolved procedural materials, physical occlusion'}]})
    for region in next(p['regions'] for p in regions['poses'] if p['pose']==name):
        if not region['region'].endswith('_facade'):continue
        image=oiio.ImageInput.open(str(control/'masks'/(name+'_'+region['region']+'.png')));mask=image.read_image(format=oiio.FLOAT)[:,:,0]>.5;image.close()
        if int(mask.sum())!=region['pixels']:raise RuntimeError('Changed frozen wall mask')
        if np.max(np.abs(game['combined']-game['combined_restored'])[mask])>1e-5:raise RuntimeError('Game capture restoration failed')
        gy=float(np.mean(game['combined'][mask]@Y));noao=float(np.mean(game['combined_no_material_ao'][mask]@Y));cy=float(np.mean(radiance[mask]@Y));oldy=float(np.mean(old_rad[mask]@Y))
        native=region['material'] in native_materials
        base_ratio=(np.mean(game['albedo'][mask],axis=0)/np.mean(albedo[mask],axis=0)).tolist() if native else None
        row={'pose':name,'region':region['region'],'pixels':int(mask.sum()),'gameBeforeRatio':gy/oldy,'gameResolvedRatio':gy/cy,'gameNoAoResolvedRatio':noao/cy,
             'nativeSurfaceEvaluated':native,'baseColorMeanRatioRGB':base_ratio,'baseColorMeanAbsError':float(np.mean(np.abs(game['albedo'][mask]-albedo[mask]))) if native else None,
             'roughnessMeanGame':float(np.mean(game['roughness'][mask,0])),'roughnessMeanCycles':float(np.mean(rough[mask])) if native else None,
             'aoMean':float(np.mean(ao[mask])) if native else None}
        if not np.isfinite(np.array([gy,noao,cy,*(base_ratio or [])])).all() or cy<=0:raise RuntimeError('Invalid material input/radiance')
        rows.append(row);print(json.dumps(row),flush=True)
    del exr,old,game
save_json(root/'analysis.json',{'schemaVersion':1,'rows':rows,'aoPolicy':'Physical Cycles does not multiply authored texture AO. no-AO game is a diagnostic only. No game settings or light gain changed.'});save_json(root/'sheets.json',sheets)
lines=['# AI568 resolved surface material validation','','All ratios are game/Cycles mean scene-linear luminance on the same opaque wall masks.','','| Pose / wall | Original reference | Resolved reference | Game AO off / resolved | Base color ratio RGB | Roughness game / Cycles |','|---|---:|---:|---:|---|---|']
for row in rows:
    base=' / '.join(f'{x:.4f}' for x in row['baseColorMeanRatioRGB']) if row['nativeSurfaceEvaluated'] else 'unchanged source PBR; no surface AOV'
    rough=f"{row['roughnessMeanGame']:.4f} / {row['roughnessMeanCycles']:.4f}" if row['nativeSurfaceEvaluated'] else 'not measured'
    lines.append(f"| {row['pose']} / {row['region']} | {row['gameBeforeRatio']:.4f} | {row['gameResolvedRatio']:.4f} | {row['gameNoAoResolvedRatio']:.4f} | {base} | {rough} |")
lines+=['','Physical Cycles retains geometric visibility. Texture AO is not Base Color. Surface sampling and renderer BRDF differences remain; these are not full-scene parity percentages.']
(root/'analysis.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
