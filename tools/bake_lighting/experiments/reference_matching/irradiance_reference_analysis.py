"""Use identical facade masks to isolate world lighting and native source transport."""
import sys,json,math
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,Y,save_json,write_png,three_aces

root=Path(sys.argv[1]);request=json.loads((root/'request.json').read_text());trace=Path(request['trace']);reference=Path(request['reference'])
metadata=json.loads((trace/'raw/metadata.json').read_text());shape=(metadata['height'],metadata['width'],4)
raw=lambda name:np.flipud(np.memmap(trace/'raw'/(name+'.rgba32f'),mode='r',dtype='<f4',shape=shape))[:,:,:3]
images={'game_diffuse_no_ao':raw('indirect_no_material_ao')+raw('direct_no_material_ao')};exrs={};records={}
for name,folder in [('original_geometric',reference/'geometric_diffuse'),('source_lighting',root/'source_lighting'),('source_scene',root/'source_scene')]:
    row=next(r for r in json.loads((folder/'renders.json').read_text()) if r['pose']=='pose_custom');records[name]=row
    exr=ExrPasses(row['file'],'pose_custom');exrs[name]=exr
    if abs(2**row['exposureEv']-metadata['exposure'])>1e-8:raise RuntimeError('Exposure mismatch')
    images[name]=(exr.read('Diffuse Direct')+exr.read('Diffuse Indirect'))*exr.read('Diffuse Color')
    images[name+'_albedo']=exr.read('Diffuse Color')
scene=json.loads(Path(json.loads((reference/'full/scene.json').read_text())['manifest']).read_text())
indices=exrs['original_geometric'].read('Material Index',channels=['X'])[:,:,0]
audit={row['id']:row for row in scene['materialAudit']};materials=[]
region=np.zeros(indices.shape,bool);region[:int(shape[0]*.48),int(shape[1]*.25):int(shape[1]*.97)]=True
for value in np.unique(indices[region]):
    if value<=0:continue
    name=scene['build']['materialMasks'][str(int(value))];material=audit.get(name,{})
    if material.get('scope')!='city' or material.get('role')!='authored' or material.get('interiorProxy') or material.get('metalness',0)>.01 or material.get('opacity',1)<1:continue
    mask=indices==value
    for axis in [0,1]:
        for offset in [-2,-1,1,2]:mask &= np.roll(indices,offset,axis)==value
    mask &= region
    if mask.sum()<1000:continue
    means={key:float((image[mask]@Y).mean()) for key,image in images.items()}
    materials.append({'id':name,'pixels':int(mask.sum()),'meanLinearY':means,
        'worldChange':means['source_lighting']/max(means['original_geometric'],1e-9),
        'sourceChange':means['source_scene']/max(means['source_lighting'],1e-9),
        'gameToSource':means['game_diffuse_no_ao']/max(means['source_scene'],1e-9)})
materials.sort(key=lambda row:-row['pixels'])
for name,image in images.items():
    if not np.isfinite(image).all():raise RuntimeError('Nonfinite diffuse result')
    if not name.endswith('_albedo'):write_png(root/(name+'.png'),three_aces(np.maximum(image,0),metadata['exposure']))
result={'materials':materials,'records':records,'limits':[
    'Original geometric control used 128 samples; source-world and source-scene controls use 256.',
    'Source reconstruction includes only static bake participants; the dynamic bus is absent.',
    'Facade masks exclude glass and erode boundaries; secondary material and geometry changes are grouped in the source-scene control.']}
save_json(root/'analysis.json',result);print(json.dumps(result),flush=True)
