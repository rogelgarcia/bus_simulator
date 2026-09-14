"""Compare density/batching at identical world locations, with frozen opaque wall coverage."""
import sys,json,math
from pathlib import Path
import numpy as np,OpenImageIO as oiio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,Y,save_json
def sample(data,uv):
    n=data.shape[0];p=uv*n-.5;base=np.floor(p).astype(int);w=p-base
    def fetch(dx,dy):return data[np.clip(base[:,1]+dy,0,n-1),np.clip(base[:,0]+dx,0,n-1),:3]
    return (fetch(0,0)*(1-w[:,0,None])+fetch(1,0)*w[:,0,None])*(1-w[:,1,None])+(fetch(0,1)*(1-w[:,0,None])+fetch(1,1)*w[:,0,None])*w[:,1,None]
def erode(mask,d):
    out=mask.copy()
    for axis in [0,1]:
        src=out.copy()
        for shift in range(1,d+1):out&=np.roll(src,shift,axis)&np.roll(src,-shift,axis)
    if d:out[:d]=False;out[-d:]=False;out[:,:d]=False;out[:,-d:]=False
    return out
root=Path(sys.argv[1]);r=json.loads((root/'request.json').read_text());name='pose_04';records=json.loads((Path(r['reference'])/'renders.json').read_text())
im=oiio.ImageInput.open(str(Path(r['control'])/'masks'/(name+'_shaded_facade.png')));mask=im.read_image(format=oiio.FLOAT)[:,:,0]>.5;im.close()
for variant in ['geometric_constant','normal_constant']:
    exr=ExrPasses(next(x['file'] for x in records if x['pose']==name and x['variant']==variant),name);mask&=np.abs(exr.read('AI570 Roughness',channels=['X'])[:,:,0]-.85)<1e-4;del exr
shape=(r['height'],r['width'],4);coords=np.flipud(np.memmap(Path(r['capture'])/name/'receiver_atlas.rgba32f',mode='r',dtype='<f4',shape=shape))[:,:,:3][mask]
if np.any(np.abs(coords[:,2]-3)>.001):raise RuntimeError('Changed page')
original=json.loads((Path(r['processing'])/'analysis.json').read_text())['charts'];charts={c['id']:c for c in original}
values={};bake=Path(r['bake']);uv=coords[:,:2]
values['original_raw']=sum(sample(np.load(bake/f'{s}.3.npy',mmap_mode='r'),uv)*math.pi for s in ['sky','bounce'])
values['original_extended']=sample(np.memmap(Path(r['processing'])/'overlap.f32',mode='r',dtype='<f4',shape=(4096,4096,4)),uv)
values['original_seams']=sample(np.memmap(bake/'seam-input.3.mip0.f32',mode='r',dtype='<f4',shape=(4096,4096,4)),uv)
variants=['native_all','adaptive_all','fine_all'] if r['phase']=='refined' else ['native_unjoined','native_joined','fine_joined','finer_joined']
for variant in variants:
    atlas=json.loads((root/variant/'atlas.json').read_text());n=atlas['profile']['pageSize'];data=np.memmap(root/variant/'extended.f32',mode='r',dtype='<f4',shape=(n,n,4))
    observed=np.zeros((len(coords),3));stitched=observed.copy();coverage=np.zeros(len(coords),int)
    seam_file=root/variant/'seam-input.0.mip0.f32';seams=np.memmap(seam_file,mode='r',dtype='<f4',shape=(n,n,4)) if seam_file.exists() else None
    for c in atlas['charts']:
        if c['id'] not in charts:continue
        old=charts[c['id']];px=uv*4096-np.array([old['x'],old['y']]);select=(px[:,0]>=0)&(px[:,1]>=0)&(px[:,0]<old['width'])&(px[:,1]<old['height'])
        point=(px[select]-2-np.array(old.get('pixelOffset',[.5,.5])))*np.array(c['texelsPerMeter'])/np.array(old['texelsPerMeter'])+2+np.array(c.get('pixelOffset',[.5,.5]))+np.array([c['x'],c['y']])
        observed[select]=sample(data,point/n);coverage[select]+=1
        if seams is not None:stitched[select]=sample(seams,point/n)
    if np.any(coverage!=1):raise RuntimeError('Chart remapping is incomplete or ambiguous')
    values[variant]=observed
    if seams is not None:values[variant+'_seams']=stitched
transport=Path(r['transportReference'])/'bake_scene';exr=ExrPasses(transport/'full.exr',name);full=(exr.read('Diffuse Direct')+exr.read('Diffuse Indirect'))*exr.read('Diffuse Color');del exr
exr=ExrPasses(transport/'sun.exr',name);direct=exr.read('Diffuse Direct')*exr.read('Diffuse Color');del exr
values['source_render']=(full-direct)[mask]*2*math.pi
rows=[]
for inset in [0,3,6]:
    selected=erode(mask,inset)[mask];means={k:float(np.mean(v[selected]@Y)) for k,v in values.items()}
    rows.append({'inset':inset,'pixels':int(selected.sum()),'irradianceY':means,'relativeToSourceRender':{k:v/means['source_render'] for k,v in means.items()}});print(json.dumps(rows[-1]),flush=True)
save_json(root/'analysis.json',rows)
