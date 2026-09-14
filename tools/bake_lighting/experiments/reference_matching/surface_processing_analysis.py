"""Separate extension, hidden-sample replacement and seam changes on frozen wall samples."""
import sys,json,math
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,Y,save_json

def erode(mask,d):
    out=mask.copy()
    for axis in [0,1]:
        src=out.copy()
        for shift in range(1,d+1):out&=np.roll(src,shift,axis)&np.roll(src,-shift,axis)
    if d:out[:d]=False;out[-d:]=False;out[:,:d]=False;out[:,-d:]=False
    return out

def bilinear(data,uv):
    n=data.shape[0];p=uv*n-.5;base=np.floor(p).astype(int);w=p-base
    def fetch(dx,dy):return data[np.clip(base[:,1]+dy,0,n-1),np.clip(base[:,0]+dx,0,n-1),:3]
    return (fetch(0,0)*(1-w[:,0,None])+fetch(1,0)*w[:,0,None])*(1-w[:,1,None])+(fetch(0,1)*(1-w[:,0,None])+fetch(1,1)*w[:,0,None])*w[:,1,None]

root=Path(sys.argv[1]);r=json.loads((root/'request.json').read_text());capture=Path(r['capture']);reference=Path(r['reference']);bake=Path(r['bake']);name='pose_04'
im=oiio.ImageInput.open(str(Path(r['control'])/'masks'/(name+'_shaded_facade.png')));mask=im.read_image(format=oiio.FLOAT)[:,:,0]>.5;im.close()
records=json.loads((reference/'renders.json').read_text())
for variant in ['geometric_constant','normal_constant']:
    exr=ExrPasses(next(x['file'] for x in records if x['pose']==name and x['variant']==variant),name)
    mask&=np.abs(exr.read('AI570 Roughness',channels=['X'])[:,:,0]-.85)<1e-4;del exr
shape=(r['height'],r['width'],4)
coords=np.flipud(np.memmap(capture/name/'receiver_atlas.rgba32f',mode='r',dtype='<f4',shape=shape))[:,:,:3][mask]
if np.any(np.abs(coords[:,2]-3)>.001):raise RuntimeError('Unexpected page')
uv=coords[:,:2];n=json.loads((root/'processing.json').read_text())['profile']['pageSize'];size=(n,n,4)
samples={}
samples['raw']=sum(bilinear(np.load(bake/f'{s}.3.npy',mmap_mode='r'),uv)*math.pi for s in ['sky','bounce'])
for key,file in [('extension',root/'extension.f32'),('overlap',root/'overlap.f32'),('seams',bake/'seam-input.3.mip0.f32')]:samples[key]=bilinear(np.memmap(file,mode='r',dtype='<f4',shape=size),uv)
rows=[]
for inset in [0,3,6]:
    select=erode(mask,inset)[mask];values={k:float(np.mean(v[select]@Y)) for k,v in samples.items()}
    rows.append({'inset':inset,'pixels':int(select.sum()),'meanY':values,'relativeChanges':{b:values[b]/values[a]-1 for a,b in [('raw','extension'),('extension','overlap'),('overlap','seams')]}})
    print(json.dumps(rows[-1]),flush=True)
charts=json.loads((root/'page_charts.json').read_text());picked=[];pixels=uv*n
for chart in charts:
    x,y,w,h=[chart[k] for k in ['x','y','width','height']];select=(pixels[:,0]>=x)&(pixels[:,0]<x+w)&(pixels[:,1]>=y)&(pixels[:,1]<y+h)
    if np.any(select):picked.append({**{k:v for k,v in chart.items() if k!='triangles'},'triangles':len(chart['triangles']),'pixels':int(select.sum()),'meanY':{k:float(np.mean(v[select]@Y)) for k,v in samples.items()}})
save_json(root/'analysis.json',{'pose':name,'stages':rows,'charts':picked})
