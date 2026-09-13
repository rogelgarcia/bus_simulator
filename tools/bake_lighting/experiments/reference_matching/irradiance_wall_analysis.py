"""Select one visible original chart, then compare clamp variants at identical GPU addresses."""
import sys,json,math
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,Y,save_json,sha
root=Path(sys.argv[1]);request=json.loads((root/'request.json').read_text());control=Path(request['input'])
control_request=json.loads((control/'request.json').read_text());trace=Path(control_request['trace'])
trace_request=json.loads((trace/'request.json').read_text());bake=Path(trace_request['bake'])
metadata=json.loads((trace/'raw/metadata.json').read_text());shape=(metadata['height'],metadata['width'],4)
raw=lambda name:np.flipud(np.memmap(trace/'raw'/(name+'.rgba32f'),mode='r',dtype='<f4',shape=shape))[:,:,:3]
coords=raw('receiver_atlas')
receipts={lobe:json.loads((bake/(lobe+'.receipt.json')).read_text()) for lobe in ['sky','bounce']}
if any(record['jobSha256']!=sha(bake/'job.json') for record in receipts.values()):raise RuntimeError('Original pass job changed')
if sys.argv[2]=='prepare':
    chart_hash=sha(bake/'charts.ndjson')
    if any(record['chartSha256']!=chart_hash for record in receipts.values()):raise RuntimeError('Original charts changed')
    reference=Path(control_request['reference']);scene=json.loads(Path(json.loads((reference/'full/scene.json').read_text())['manifest']).read_text())
    rows=json.loads((reference/'full/renders.json').read_text());row=next(r for r in rows if r['pose']=='pose_custom')
    exr=ExrPasses(row['file'],'pose_custom');indices=exr.read('Material Index',channels=['X'])[:,:,0]
    material=next(int(k) for k,v in scene['build']['materialMasks'].items() if v=='MAT_396_MeshStandardMaterial')
    mask=(indices==material)&(coords>=0).all(axis=-1)
    uv=coords[mask];size=trace_request['profile']['pageSize'];integrals={}
    for page in np.unique(uv[:,2].astype(int)):
        local=np.minimum((uv[uv[:,2]==page,:2]*size).astype(int),size-1)
        counts=np.bincount(local[:,1]*size+local[:,0],minlength=size*size).reshape(size,size)
        integrals[int(page)]=np.pad(counts.cumsum(0).cumsum(1),((1,0),(1,0)))
    best=None;count=0
    with (bake/'charts.ndjson').open() as stream:
        for line in stream:
            chart=json.loads(line);table=integrals.get(chart['page'])
            if table is None:continue
            x,y=chart['x']+2,chart['y']+2;w,h=chart['width']-4,chart['height']-4
            n=int(table[y+h,x+w]-table[y,x+w]-table[y+h,x]+table[y,x])
            if n>count:best=chart;count=n
    if best is None or count<1000:raise RuntimeError('No sufficiently visible brick chart')
    save_json(root/'chart.json',best)
    save_json(root/'selection.json',{'pixels':count,'bake':str(bake),'sourcePackage':control_request['sourcePackage'],
        'chartsSha256':chart_hash,'chart':{k:v for k,v in best.items() if k!='triangles'}})
    print(json.dumps({'pixels':count,'chart':best['id'],'size':[best['width'],best['height']]}),flush=True)
else:
    chart=json.loads((root/'chart.json').read_text());size=trace_request['profile']['pageSize']
    uv=coords[:,:,:2]*size-np.array([chart['x'],chart['y']]);mask=(coords[:,:,2]==chart['page'])
    mask &=(uv[:,:,0]>3)&(uv[:,:,1]>3)&(uv[:,:,0]<chart['width']-3)&(uv[:,:,1]<chart['height']-3)
    points=uv[mask]-.5;base=np.floor(points).astype(int);w=points-base
    def sample(data,offset=(0,0)):
        x,y=(base+np.array(offset)).T
        return ((data[y,x,:3]*(1-w[:,0,None])+data[y,x+1,:3]*w[:,0,None])*(1-w[:,1,None])+
                (data[y+1,x,:3]*(1-w[:,0,None])+data[y+1,x+1,:3]*w[:,0,None])*w[:,1,None])
    results=[]
    row=next(r for r in json.loads((control/'source_scene/renders.json').read_text()) if r['pose']=='pose_custom')
    exr=ExrPasses(row['file'],'pose_custom')
    for lobe in ['sky','bounce']:
        original=bake/(lobe+'.'+str(chart['page'])+'.npy')
        expected=next(row for row in receipts[lobe]['files'] if row['file']==original.name)
        if sha(original)!=expected['sha256']:raise RuntimeError('Original baked page changed')
        old=sample(np.load(original,mmap_mode='r'),(chart['x'],chart['y']))
        a=sample(np.load(root/('clamp10_'+lobe+'.npy')));b=sample(np.load(root/('clamp0_'+lobe+'.npy')))
        means={name:float((value@Y).mean()) for name,value in [('original',old),('clamp10',a),('clamp0',b)]}
        means['sourceRender']=float((exr.read('Diffuse Direct' if lobe=='sky' else 'Diffuse Indirect')[mask]@Y).mean())
        results.append({'lobe':lobe,'meanLinearY':means,'reproductionRatio':means['clamp10']/means['original'],
            'unclampedRatio':means['clamp0']/means['clamp10'],'unclampedToRender':means['clamp0']/means['sourceRender']})
    save_json(root/'analysis.json',{'pixels':int(mask.sum()),'results':results,'diagnosticOnly':True})
    print(json.dumps(results),flush=True)
    if any(not np.isfinite(list(row['meanLinearY'].values())).all() for row in results):raise RuntimeError('Nonfinite wall measurement')
    if any(abs(row['reproductionRatio']-1)>.06 for row in results):raise RuntimeError('Small-chart control does not reproduce the stored bake closely enough')
    if any(abs(row['unclampedToRender']-1)>.025 for row in results):raise RuntimeError('Unclamped wall bake/render parity failed')
