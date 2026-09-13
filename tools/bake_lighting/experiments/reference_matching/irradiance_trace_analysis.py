"""Compare original Cycles passes, processed HDR pages, GPU sampling and Lambert composition."""
import json, math, sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses, Y, save_json, sha

def bilinear(data, uv):
    size=data.shape[0];p=uv*size-.5;base=np.floor(p).astype(np.int64);weight=p-base
    x0=np.clip(base[:,0],0,size-1);x1=np.clip(base[:,0]+1,0,size-1)
    y0=np.clip(base[:,1],0,size-1);y1=np.clip(base[:,1]+1,0,size-1)
    fetch=lambda y,x:decode(data[y,x]) if data.ndim==2 else data[y,x,:3]
    a=fetch(y0,x0)*(1-weight[:,0,None])+fetch(y0,x1)*weight[:,0,None]
    b=fetch(y1,x0)*(1-weight[:,0,None])+fetch(y1,x1)*weight[:,0,None]
    return a*(1-weight[:,1,None])+b*weight[:,1,None]

def decode(packed):
    exponent=np.exp2((packed>>27).astype(np.int32)-24)
    return np.stack([packed&511,(packed>>9)&511,(packed>>18)&511],axis=-1)*exponent[:,None]

root=Path(sys.argv[1]);request=json.loads((root/'request.json').read_text());bake=Path(request['bake'])
output=Path(sys.argv[2]) if len(sys.argv)>2 else root
metadata=json.loads((root/'raw/metadata.json').read_text());shape=(metadata['height'],metadata['width'],4)
raw=lambda name:np.flipud(np.memmap(root/'raw'/(name+'.rgba32f'),mode='r',dtype='<f4',shape=shape))[:,:,:3]
reference=Path(request['reference']);renders=json.loads((reference/'full/renders.json').read_text())
target=next(row for row in renders if row['pose']=='pose_custom')
if abs(metadata['exposure']-2**target['exposureEv'])>1e-8:raise RuntimeError('Exposure mismatch')
scene=json.loads(Path(json.loads((reference/'full/scene.json').read_text())['manifest']).read_text())
exr=ExrPasses(target['file'],'pose_custom');indices=exr.read('Material Index',channels=['X'])[:,:,0]
audit={row['id']:row for row in scene['materialAudit']};masks={}
region=np.zeros(indices.shape,bool);region[:int(shape[0]*.48),int(shape[1]*.25):int(shape[1]*.97)]=True
for value in np.unique(indices[region]):
    if value<=0:continue
    name=scene['build']['materialMasks'][str(int(value))];material=audit.get(name,{})
    if material.get('scope')!='city' or material.get('role')!='authored' or material.get('interiorProxy') or material.get('metalness',0)>.01 or material.get('opacity',1)<1:continue
    mask=indices==value
    for axis in [0,1]:
        for offset in [-2,-1,1,2]:mask &= np.roll(indices,offset,axis)==value
    mask &= region
    if mask.sum()>=1000:masks[name]=mask
gpu_coords=raw('receiver_atlas');valid=np.isfinite(gpu_coords).all(axis=-1)&(gpu_coords>=0).all(axis=-1)
coverage={name:{'pixels':int(mask.sum()),'mappedPixels':int((mask&valid).sum())} for name,mask in masks.items()}
print('GPU receiver coverage: '+json.dumps(coverage),flush=True)
masks={name:mask&valid for name,mask in masks.items() if (mask&valid).sum()>=1000}
if not masks:raise RuntimeError('No mapped opaque material to trace')
union=np.logical_or.reduce(list(masks.values()))
coords=raw('receiver_atlas')[union];lod=raw('receiver_lod')[union,0]
if (coords<0).any() or not np.isfinite(coords).all():raise RuntimeError('An opaque comparison surface lacks receiver coordinates')
pages=np.rint(coords[:,2]).astype(int);uv=coords[:,:2]
profile=request['profile'];size=profile['pageSize'];levels=profile['mipLevels']
if (pages<0).any() or (uv>1).any() or (lod<0).any() or (lod>levels-1).any():raise RuntimeError('Invalid GPU receiver address')
samples={name:np.zeros((len(coords),3),np.float64) for name in ['rawSky','rawBounce','rawBase','processedBase','packedBase','processedLod','packedLod']}
index=json.loads((bake/'package_index.json').read_text());verified=[]
pass_receipts={name:json.loads((bake/(name+'.receipt.json')).read_text()) for name in ['sky','bounce']}
job_hash=sha(bake/'job.json')
for record in pass_receipts.values():
    if record['jobSha256']!=job_hash:raise RuntimeError('Offline pass job identity mismatch')
for page in np.unique(pages):
    selection=pages==page;local_uv=uv[selection];local_lod=lod[selection]
    print('Trace offline page '+str(page),flush=True)
    for name in ['sky','bounce']:
        file=bake/f'{name}.{page}.npy';expected=next(row for row in pass_receipts[name]['files'] if row['file']==file.name)
        if file.stat().st_size!=expected['bytes'] or sha(file)!=expected['sha256']:raise RuntimeError('Original Cycles pass changed: '+str(file))
        verified.append({'file':str(file),'sha256':expected['sha256']})
        data=np.load(file,mmap_mode='r');samples['raw'+name.title()][selection]=bilinear(data,local_uv)*math.pi
    for mip in range(levels):
        n=size>>mip;file=bake/f'processed.{page}.mip{mip}.u32'
        expected=next(row for row in index['mapping']['coverage']['raster']['pages'][int(page)]['mips'] if row['mip']==mip)
        if file.stat().st_size!=expected['bytes'] or sha(file)!=expected['sha256']:raise RuntimeError('Published HDR page changed')
        verified.append({'file':str(file),'sha256':expected['sha256']})
        packed=np.memmap(file,mode='r',dtype='<u4',shape=(n,n));packed_value=bilinear(packed,local_uv)
        floats=np.memmap(bake/f'seam-input.{page}.mip{mip}.f32',mode='r',dtype='<f4',shape=(n,n,4));float_value=bilinear(floats,local_uv)
        weight=np.maximum(0,1-np.abs(local_lod-mip))[:,None]
        samples['packedLod'][selection]+=packed_value*weight;samples['processedLod'][selection]+=float_value*weight
        if mip==0:
            samples['packedBase'][selection]=packed_value;samples['processedBase'][selection]=float_value
samples['rawBase']=samples['rawSky']+samples['rawBounce']
samples['gpuIrradiance']=raw('receiver_irradiance')[union]
samples['gameIndirectNoAo']=raw('indirect_no_material_ao')[union]
samples['expectedLambert']=samples['gpuIrradiance']*raw('albedo')[union]/math.pi
samples['gameDirectNoAo']=raw('direct_no_material_ao')[union]
if len(sys.argv)>3:
    control=Path(sys.argv[3]);rows=json.loads((control/'source_scene/renders.json').read_text())
    row=next(item for item in rows if item['pose']=='pose_custom');control_exr=ExrPasses(row['file'],'pose_custom')
    samples['sourceAlbedo']=control_exr.read('Diffuse Color')[union]
    samples['gameAlbedo']=raw('albedo')[union]
    for name,pass_name in [('sourceSky','Diffuse Direct'),('sourceBounce','Diffuse Indirect')]:
        samples[name]=control_exr.read(pass_name)[union]*math.pi
    for name in ['rawSky','rawBounce','sourceSky','sourceBounce']:
        samples[name+'Radiance']=samples[name]*samples['gameAlbedo']/math.pi
def error(a,b):
    delta=np.linalg.norm(a-b,axis=-1);reference=np.maximum(np.linalg.norm(b,axis=-1),1e-6)
    return {'relativeRms':float(np.sqrt(np.mean(delta**2)/max(np.mean(reference**2),1e-12))),
            'relativeP99':float(np.percentile(delta/reference,99)),'maximumAbsoluteRgb':float(np.max(np.abs(a-b)))}
result={'profile':profile,'pixels':int(union.sum()),'coverage':coverage,'verifiedFiles':verified,'materials':[],
    'gpuSamplingError':error(samples['gpuIrradiance'],samples['packedLod']),
    'quantizationError':error(samples['packedLod'],samples['processedLod']),
    'lambertCompositionError':error(samples['gameIndirectNoAo'],samples['expectedLambert']),
    'restorationMaxRgb':float(np.max(np.abs(raw('combined')[union]-raw('combined_restored')[union]))),
    'limits':['Raw pass interpolation can include unused boundary pixels; interpret padding differences per material.',
              'CPU bilinear filtering uses full precision; GPU interpolation has implementation-dependent subtexel precision.',
              'This checks delivery of the recorded bake, not equivalence of the two scene exporters.']}
for name,mask in masks.items():
    select=mask[union];means={key:float((value[select]@Y).mean()) for key,value in samples.items()}
    result['materials'].append({'id':name,'pixels':int(select.sum()),'meanLinearY':means,'lodMean':float(lod[select].mean()),
        'processedToRaw':means['processedBase']/max(means['rawBase'],1e-9),
        'gpuToStored':means['gpuIrradiance']/max(means['packedLod'],1e-9)})
result['materials'].sort(key=lambda row:-row['pixels'])
save_json(output/'analysis.json',result)
print(json.dumps({k:result[k] for k in ['pixels','gpuSamplingError','quantizationError','lambertCompositionError','restorationMaxRgb']}),flush=True)
if result['restorationMaxRgb']>1e-5:raise RuntimeError('Trace did not restore static materials')
if result['gpuSamplingError']['relativeRms']>.02:raise RuntimeError('GPU sampling differs materially from authenticated pixels; inspect preserved analysis')
if result['lambertCompositionError']['relativeRms']>.005:raise RuntimeError('Shader composition differs from irradiance times albedo/pi; inspect preserved analysis')
