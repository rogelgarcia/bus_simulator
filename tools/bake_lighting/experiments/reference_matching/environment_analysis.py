"""Same-input actual GPU prototype against immutable physical Cycles wall masks."""
import sys,json
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,three_aces,write_png,save_json,Y

def load(p):return json.loads(Path(p).read_text())
def png(p):
    f=oiio.ImageInput.open(str(p));a=f.read_image(format=oiio.FLOAT);f.close();return a
def mean(a,m):return float(np.mean(a[m]@Y))
def rays(pose,w,h):
    c=pose['pose']['camera'];q=c['quaternion'];x,y,z,v=[q[k] for k in ['x','y','z','w']]
    rot=np.array([[1-2*(y*y+z*z),2*(x*y-z*v),2*(x*z+y*v)],[2*(x*y+z*v),1-2*(x*x+z*z),2*(y*z-x*v)],[2*(x*z-y*v),2*(y*z+x*v),1-2*(x*x+y*y)]])
    s=np.tan(np.radians(c['fovDeg'])/2);xx,yy=np.meshgrid((2*(np.arange(w)+.5)/w-1)*s*w/h,(1-2*(np.arange(h)+.5)/h)*s)
    a=np.stack([-xx,-yy,np.ones_like(xx)],axis=2)@rot.T;return a/np.linalg.norm(a,axis=2,keepdims=True)

root=Path(sys.argv[1]);r=load(root/'request.json');capture=Path(r['capture']);original=Path(r['original']);control=Path(r['control'])
regions=load(control/'measurements.json');rows=[];images=[]
(root/'images').mkdir();(root/'walls').mkdir()
for pose in r['poses']:
    name=pose['id'];meta=load(capture/name/'metadata.json');shape=(meta['height'],meta['width'],4)
    def raw(folder,key):
        a=np.flipud(np.fromfile(folder/name/(key+'.rgba32f'),dtype='<f4').reshape(shape))[:,:,:3]
        if not np.isfinite(a).all():raise RuntimeError('Nonfinite native radiance')
        return a
    before=raw(capture,'combined');after=raw(capture,'reference_combined');restored=raw(capture,'combined_restored');old=raw(original,'combined')
    ref=Path(r['closeup'] if name=='pose_custom' else r['reference']);record=next(x for x in load(ref/'renders.json') if x['pose']==name)
    if abs(2**record['exposureEv']-meta['exposure'])>1e-8:raise RuntimeError('Changed display exposure')
    exr=ExrPasses(record['file'],name);beauty=exr.read();cy=exr.read('Noisy Image');ao_control=None
    selected=next((p['regions'] for p in regions['poses'] if p['pose']==name),None)
    if selected:
        diffuse=(exr.read('Diffuse Direct')+exr.read('Diffuse Indirect'))*exr.read('Diffuse Color')
        glossy=(exr.read('Glossy Direct')+exr.read('Glossy Indirect'))*exr.read('Glossy Color')
        sun=ExrPasses(next(x['file'] for x in load(ref/'contributions.json') if x['pose']==name),name)
        direct=sun.read('Diffuse Direct')*sun.read('Diffuse Color');direct_spec=sun.read('Glossy Direct')*sun.read('Glossy Color');del sun
        rough=exr.read('AI568 Roughness',channels=['X'])[:,:,0];ao=exr.read('AI568 Texture AO',channels=['X'])[:,:,0]
        normal=exr.read('AI568 World Normal')*2-1;normal=np.stack([normal[:,:,0],normal[:,:,2],-normal[:,:,1]],axis=2)
        normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-8)
        nv=np.clip(np.sum(normal*rays(pose,shape[1],shape[0]),axis=2),0,1)
        specao=np.clip(np.power(np.maximum(nv+np.clip(ao,0,1),1e-8),np.exp2(-16*np.clip(rough,0,1)-1))-1+ao,0,1)
        ao_control=cy-(diffuse-direct)*(1-ao[:,:,None])-(glossy-direct_spec)*(1-specao[:,:,None])
    del exr
    panels=[]
    for label,value in [('native',before),('prototype',after),('cycles',beauty)]:
        image=three_aces(value,meta['exposure']);file=root/'images'/(name+'_'+label+'.png');write_png(file,image);panels.append(image)
    # Preserve full-resolution individual files; compact comparison is downsampled.
    pair=root/(name+'.png');write_png(pair,np.concatenate([p[::2,::2] for p in panels],axis=1))
    images.append({'pose':name,'sheet':str(pair),'columns':['Current game','Diagnostic view-dependent GGX, 256 samples','Physical Cycles'],'closeup':not bool(selected)})
    for region in selected or []:
        if not region['region'].endswith('_facade'):continue
        mask=png(control/'masks'/(name+'_'+region['region']+'.png'))[:,:,0]>.5
        if int(mask.sum())!=region['pixels']:raise RuntimeError('Changed frozen wall mask')
        restore=float(np.max(np.abs(restored-before)[mask]));drift=float(np.max(np.abs(old-before)[mask]))
        if max(restore,drift)>1e-4:raise RuntimeError('Changed native radiance/restoration '+name+' '+str([restore,drift]))
        if np.min(ao[mask])<0 or np.max(ao[mask])>1 or np.min(rough[mask])<0 or np.max(rough[mask])>1:raise RuntimeError('Invalid wall AO/roughness')
        ys,xs=np.nonzero(mask);crop=(slice(max(0,ys.min()-8),ys.max()+9),slice(max(0,xs.min()-8),xs.max()+9));crops=[]
        for value in [before,after,cy]:
            image=three_aces(value,meta['exposure']);image[~mask]=.16;crops.append(image[crop])
        write_png(root/'walls'/(name+'_'+region['region']+'.png'),np.concatenate(crops,axis=1))
        rows.append({'pose':name,'region':region['region'],'pixels':int(mask.sum()),'material':region['material'],'restoredMax':restore,'oldControlMaxDifference':drift,
            'beforeToCycles':mean(before,mask)/mean(cy,mask),'afterToCycles':mean(after,mask)/mean(cy,mask),
            'beforeToAoControl':mean(before,mask)/mean(ao_control,mask),'afterToAoControl':mean(after,mask)/mean(ao_control,mask),
            'maeBefore':float(np.abs(before[mask]-cy[mask]).mean()),'maeAfter':float(np.abs(after[mask]-cy[mask]).mean())})
    print(name+' validated',flush=True)
performance=load(capture/'pose_02/performance.json')
save_json(root/'analysis.json',{'rows':rows,'images':images,'performance':performance,'policy':'Actual current-game/prototype radiance with fixed lighting, exposure, authored AO and immutable opaque-only masks. Physical Cycles is distinct from the separately scored authored-AO artistic control. Close-up is visual only; no invented region score. Prototype is not enabled in production.'})
