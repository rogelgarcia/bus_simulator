"""Opaque-mask factorial comparisons; independently reconstruct installed irradiance."""
import sys,json,math
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,three_aces,write_png,save_json,Y,sha

def erode(mask,d):
    if not d:return mask
    out=mask.copy()
    for axis in [0,1]:
        src=out.copy()
        for shift in range(1,d+1):out&=np.roll(src,shift,axis)&np.roll(src,-shift,axis)
    out[:d]=False;out[-d:]=False;out[:,:d]=False;out[:,-d:]=False
    return out

def bilinear(data,uv):
    p=uv*data.shape[0]-.5;base=np.floor(p).astype(int);w=p-base;n=data.shape[0]
    def fetch(dx,dy):
        v=data[np.clip(base[:,1]+dy,0,n-1),np.clip(base[:,0]+dx,0,n-1)]
        if data.ndim>2:return v[:,:3]
        return np.stack([v&511,(v>>9)&511,(v>>18)&511],axis=1)*np.exp2((v>>27).astype(int)-24)[:,None]
    return (fetch(0,0)*(1-w[:,0,None])+fetch(1,0)*w[:,0,None])*(1-w[:,1,None])+(fetch(0,1)*(1-w[:,0,None])+fetch(1,1)*w[:,0,None])*w[:,1,None]

def rel_rms(a,b):return float(np.sqrt(np.sum((a-b)**2)/max(np.sum(b**2),1e-15)))
def normal_decode(value,blender=False):
    n=value*2-1
    if blender:n=np.stack([n[:,:,0],n[:,:,2],-n[:,:,1]],axis=2)
    return n/np.maximum(np.linalg.norm(n,axis=2,keepdims=True),1e-8)
def normal_error(a,b,m):
    angles=np.degrees(np.arccos(np.clip(np.sum(a[m]*b[m],axis=1),-1,1)))
    return {'median':float(np.median(angles)),'p95':float(np.percentile(angles,95))}

root=Path(sys.argv[1]);r=json.loads((root/'request.json').read_text());capture=Path(r['capture']);reference=Path(r['reference']);native=Path(r['nativeReference']);control=Path(r['control']);bake=Path(r['bake'])
regions=json.loads((control/'measurements.json').read_text());renders=json.loads((reference/'renders.json').read_text());original=json.loads((native/'renders.json').read_text())
index=json.loads((bake/'package_index.json').read_text());profile=index['mapping']['profile'];rows=[];trace={};(root/'images').mkdir()
for pose in r['poses']:
    name=pose['id'];meta=json.loads((capture/name/'metadata.json').read_text());shape=(meta['height'],meta['width'],4)
    game={key:np.flipud(np.memmap(capture/name/(key+'.rgba32f'),mode='r',dtype='<f4',shape=shape))[:,:,:3] for key in meta['passes']}
    region=next(p for p in regions['poses'] if p['pose']==name)
    mask_record=next(x for x in region['regions'] if x['region']=='shaded_facade')
    im=oiio.ImageInput.open(str(control/'masks'/(name+'_shaded_facade.png')));mask=im.read_image(format=oiio.FLOAT)[:,:,0]>.5;im.close()
    if int(mask.sum())!=mask_record['pixels']:raise RuntimeError('Frozen mask changed')
    frozen_pixels=int(mask.sum());original_mask=mask.copy()
    coverage=mask.copy()
    for constant_variant in ['geometric_constant','normal_constant']:
        check=ExrPasses(next(x['file'] for x in renders if x['pose']==name and x['variant']==constant_variant),name)
        cy_constant=check.read('AI570 Roughness',channels=['X'])[:,:,0];del check
        game_constant=game[constant_variant+'__roughness'][:,:,0]
        if np.any(np.abs(game_constant[mask]-.85)>1e-5):raise RuntimeError('Game roughness override failed')
        coverage&=np.abs(cy_constant-.85)<1e-4
    if coverage.sum()<mask.sum()*.99:raise RuntimeError('More than 1% of frozen wall lacks Cycles constant-material coverage')
    mask=coverage
    coverage_audit={'frozenPixels':frozen_pixels,'strictPixels':int(mask.sum()),'excludedPartialCoveragePixels':frozen_pixels-int(mask.sum()),
        'policy':'Same constant-roughness material-ID coverage gate for every variant, plus original glass-excluded wall mask; no luminance threshold.'}
    if not all(np.isfinite(v[mask]).all() for v in game.values()):raise RuntimeError('Nonfinite selected raw data')
    restored=float(np.max(np.abs(game['combined'][mask]-game['combined_restored'][mask])))
    if restored>1e-5:raise RuntimeError('Game restoration failed')
    mean=lambda value,m:float(np.mean(value[m]@Y))
    baseline_diffuse=None;native_image=None;native_diffuse=None;geometric_diffuse=None
    for variant in ['native','geometric','geometric_constant','normal_constant']:
        target=next(x for x in renders if x['pose']==name and x['variant']==variant)
        exr=ExrPasses(target['file'],name)
        diffuse=(exr.read('Diffuse Direct')+exr.read('Diffuse Indirect'))*exr.read('Diffuse Color')
        spec=(exr.read('Glossy Direct')+exr.read('Glossy Indirect'))*exr.read('Glossy Color')
        cn=normal_decode(exr.read('AI570 Normal'),True)
        cr=exr.read('AI570 Roughness',channels=['X'])[:,:,0]
        prefix='' if variant=='native' else variant+'__';gd=game[prefix+'diffuse_no_material_ao'];gs=game[prefix+'environment_specular_no_material_ao']
        gn=normal_decode(game[prefix+'normal']);gr=game[prefix+'roughness'][:,:,0]
        if variant=='native':
            baseline_diffuse=gd;native_diffuse=diffuse
            full=ExrPasses(next(x['file'] for x in original if x['pose']==name),name)
            native_image=three_aces(full.read(),meta['exposure'])
            old_diffuse=(full.read('Diffuse Direct')+full.read('Diffuse Indirect'))*full.read('Diffuse Color')
            regional_check={'pose':name,'croppedNativeToFullNativeDiffuse':mean(diffuse,mask)/mean(old_diffuse,mask),**coverage_audit}
            print(json.dumps(regional_check),flush=True)
            del full
        if variant=='geometric':geometric_diffuse=diffuse
        if 'constant' in variant and (np.max(np.abs(gr[mask]-.85))>1e-5 or np.max(np.abs(cr[mask]-.85))>1e-4):
            audit={key:{'min':float(v[mask].min()),'max':float(v[mask].max()),'mean':float(v[mask].mean()),
                'badPixels':int(np.sum(np.abs(v[mask]-.85)>1e-4)),
                'examples':np.stack(np.nonzero(mask&(np.abs(v-.85)>1e-4)),axis=1)[:10].tolist()}
                for key,v in [('game',gr),('cycles',cr)]}
            save_json(root/'failed_constant_control.json',audit)
            raise RuntimeError('Constant roughness control not applied: '+json.dumps(audit))
        measurements=[]
        for inset in [0,3,6]:
            m=erode(mask,inset)
            measurements.append({'inset':inset,'pixels':int(m.sum()),'diffuseRatio':mean(gd,m)/mean(diffuse,m),'specularRatio':mean(gs,m)/mean(spec,m),
                'diffuseGame':mean(gd,m),'diffuseCycles':mean(diffuse,m),'normalDeg':normal_error(gn,cn,m),
                'roughnessGame':float(gr[m].mean()),'roughnessCycles':float(cr[m].mean()),'gameDiffuseChangeMax':float(np.max(np.abs(gd[m]-baseline_diffuse[m])))})
        row={'pose':name,'variant':variant,'restorationMax':restored,'coverage':coverage_audit,'regionalNativeCheck':regional_check,'masks':measurements};rows.append(row)
        print(json.dumps(row),flush=True)
        if name=='pose_02':
            y,x=np.nonzero(mask);crop=(slice(y.min(),y.max()+1),slice(x.min(),x.max()+1))
            panels=[]
            for value in [gd,diffuse]:
                image=three_aces(value,meta['exposure']);image[~mask]=.12;panels.append(image[crop])
            write_png(root/'images'/(name+'_'+variant+'_diffuse_game_left_cycles_right.png'),np.concatenate(panels,axis=1))
        del exr
    write_png(root/'images'/(name+'_current_game.png'),three_aces(game['combined'],meta['exposure']))
    write_png(root/'images'/(name+'_current_cycles.png'),native_image)
    if name!='pose_04':continue
    # Validate the stored RGB9E5 mip images against their package hashes.
    coords=game['receiver_atlas'][mask];lod=game['receiver_lod'][mask,0]
    if np.any(coords<0) or np.any(coords[:,:2]>1):raise RuntimeError('Unmapped wall or invalid UV')
    pages=np.rint(coords[:,2]).astype(int);uv=coords[:,:2];size=profile['pageSize'];levels=profile['mipLevels']
    packed_lod=np.zeros((len(coords),3));packed_base=packed_lod.copy();float_lod=packed_lod.copy();raw_base=packed_lod.copy();verified=[]
    job_hash=sha(bake/'job.json')
    for page in np.unique(pages):
        selection=pages==page;local=uv[selection]
        for source in ['sky','bounce']:
            receipt=json.loads((bake/(source+'.receipt.json')).read_text());file=bake/f'{source}.{page}.npy'
            record=next(x for x in receipt['files'] if x['file']==file.name)
            if receipt['jobSha256']!=job_hash or sha(file)!=record['sha256']:raise RuntimeError('Bake pass authentication failed')
            raw_base[selection]+=bilinear(np.load(file,mmap_mode='r'),local)*math.pi
        for mip in range(levels):
            file=bake/f'processed.{page}.mip{mip}.u32';record=next(x for x in index['mapping']['coverage']['raster']['pages'][page]['mips'] if x['mip']==mip)
            if sha(file)!=record['sha256']:raise RuntimeError('Packed mip hash mismatch')
            verified.append({'file':str(file),'sha256':record['sha256']})
            n=size>>mip;v=bilinear(np.memmap(file,mode='r',dtype='<u4',shape=(n,n)),local)
            w=np.maximum(0,1-np.abs(lod[selection]-mip))[:,None];packed_lod[selection]+=v*w
            float_lod[selection]+=bilinear(np.memmap(bake/f'seam-input.{page}.mip{mip}.f32',mode='r',dtype='<f4',shape=(n,n,4)),local)*w
            if mip==0:packed_base[selection]=v
    gpu=game['receiver_irradiance'][mask];albedo=game['albedo'][mask];expected=gpu*albedo/math.pi;actual=game['indirect_no_material_ao'][mask]
    target=next(x for x in renders if x['pose']==name and x['variant']=='lambert' and x['source']=='full')
    exr=ExrPasses(target['file'],name);ld=(exr.read('Diffuse Direct')+exr.read('Diffuse Indirect'))*exr.read('Diffuse Color');del exr
    target=next(x for x in renders if x['pose']==name and x['variant']=='lambert' and x['source']=='sun')
    exr=ExrPasses(target['file'],name);sun=exr.read('Diffuse Direct')*exr.read('Diffuse Color');del exr
    lambert=ld-sun;cyirr=lambert[mask]*2*math.pi
    trace={'pose':name,'pixels':int(mask.sum()),'pages':np.unique(pages).tolist(),'lodMean':float(lod.mean()),'lodMax':float(lod.max()),'verifiedFiles':verified,
        'gpuVsPackedRelativeRms':rel_rms(gpu,packed_lod),'quantizationRelativeRms':rel_rms(packed_lod,float_lod),'lambertCompositionRelativeRms':rel_rms(actual,expected),'insets':[]}
    for inset in [0,3,6]:
        m=erode(mask,inset);s=m[mask];mean1=lambda x:float(np.mean(x[s]@Y))
        values={key:mean1(value) for key,value in {'rawBake':raw_base,'packedBase':packed_base,'packedLod':packed_lod,'gpu':gpu,'cyclesLambert':cyirr}.items()}
        trace['insets'].append({'inset':inset,'meanIrradiance':values,'gpuToCyclesLambert':values['gpu']/values['cyclesLambert'],
            'rawToCyclesLambert':values['rawBake']/values['cyclesLambert'],'packedLodToBase':values['packedLod']/values['packedBase'],
            'processedBaseToRaw':values['packedBase']/values['rawBake']})
    if trace['gpuVsPackedRelativeRms']>.02 or trace['lambertCompositionRelativeRms']>.005:raise RuntimeError('Delivery or composition failed: '+json.dumps(trace))
    neutral_game=game['receiver_irradiance']*.5/math.pi
    y,x=np.nonzero(mask);crop=(slice(y.min(),y.max()+1),slice(x.min(),x.max()+1));panels=[]
    for value in [neutral_game,lambert]:
        image=three_aces(value,meta['exposure']);image[~mask]=.12;panels.append(image[crop])
    write_png(root/'images'/'pose_04_lambert_game_left_cycles_right.png',np.concatenate(panels,axis=1))
    print(json.dumps(trace),flush=True)
save_json(root/'analysis.json',{'rows':rows,'pose04Trace':trace,'policy':'Frozen opaque masks, glass excluded. Specular control compares environment-only game to full Cycles glossy on the shaded facade; named sun is negligible there, not a general lobe equivalence.'})
