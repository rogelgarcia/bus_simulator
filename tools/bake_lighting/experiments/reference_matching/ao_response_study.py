"""AO attribution and an independent-white-calibrated reflection candidate screen."""
import sys,json
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,three_aces,write_png,save_json,Y

def load(p):return json.loads(Path(p).read_text())
def image(p):
    f=oiio.ImageInput.open(str(p));a=f.read_image(format=oiio.FLOAT);f.close();return a
def mean_y(a,m):return float(np.mean(a[m]@Y))
def views(pose,w,h):
    c=pose['pose']['camera'];q=c['quaternion'];x,y,z,wq=[q[k] for k in ['x','y','z','w']]
    rot=np.array([[1-2*(y*y+z*z),2*(x*y-z*wq),2*(x*z+y*wq)],
                  [2*(x*y+z*wq),1-2*(x*x+z*z),2*(y*z-x*wq)],
                  [2*(x*z-y*wq),2*(y*z+x*wq),1-2*(x*x+y*y)]])
    s=np.tan(np.radians(c['fovDeg'])/2);xx,yy=np.meshgrid((2*(np.arange(w)+.5)/w-1)*s*w/h,(1-2*(np.arange(h)+.5)/h)*s)
    a=np.stack([-xx,-yy,np.ones_like(xx)],axis=2)@rot.T
    return a/np.linalg.norm(a,axis=2,keepdims=True)

root=Path(sys.argv[1]);r=load(root/'request.json');capture=Path(r['capture']);reference=Path(r['reference']);fixture=load(Path(r['fixture'])/'analysis.json')
white=next(x['cells'] for x in fixture['results'] if x['world']=='white');sky=next(x['cells'] for x in fixture['results'] if x['world']=='sky')
rough_axis=sorted({x['roughness'] for x in white});view_axis=sorted({x['noV'] for x in white})
lut=np.array([[1/next(x['ratio'] for x in white if x['roughness']==rough and x['noV']==nv) for rough in rough_axis] for nv in view_axis])
def gain(rough,nv):
    i=np.clip(np.searchsorted(view_axis,nv,side='right')-1,0,len(view_axis)-2);j=np.clip(np.searchsorted(rough_axis,rough,side='right')-1,0,len(rough_axis)-2)
    a=np.clip((nv-np.array(view_axis)[i])/(np.array(view_axis)[i+1]-np.array(view_axis)[i]),0,1)
    b=np.clip((rough-np.array(rough_axis)[j])/(np.array(rough_axis)[j+1]-np.array(rough_axis)[j]),0,1)
    return (lut[i,j]*(1-b)+lut[i,j+1]*b)*(1-a)+(lut[i+1,j]*(1-b)+lut[i+1,j+1]*b)*a
heldout=[dict(roughness=x['roughness'],noV=x['noV'],before=x['ratio'],after=x['ratio']*float(gain(x['roughness'],x['noV']))) for x in sky]
save_json(root/'reflection_candidate.json',{'fit':'White-only Cycles/native energy ratio, F0=.04 dielectric. No city fitting. Bilinear LUT is a hypothesis, not an accepted renderer correction.',
    'roughness':rough_axis,'noV':view_axis,'gain':lut.tolist(),'heldOutSky':heldout})
control=Path(r['control']);regions=load(control/'measurements.json');renders=load(reference/'renders.json');rows=[]
(root/'walls').mkdir()
for pose in r['poses']:
    name=pose['id'];meta=load(capture/name/'metadata.json');shape=(meta['height'],meta['width'],4)
    def raw(key):return np.flipud(np.fromfile(capture/name/(key+'.rgba32f'),dtype='<f4').reshape(shape))[:,:,:3]
    beauty=raw('combined');noao=raw('combined_no_material_ao');diff=raw('diffuse');diff_noao=raw('diffuse_no_material_ao');indirect=raw('indirect_no_material_ao')
    ao=raw('texture_ao')[:,:,0];rough=raw('roughness')[:,:,0];normal=raw('normal')*2-1;normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-8)
    nv=np.clip(np.sum(normal*views(pose,meta['width'],meta['height']),axis=2),0,1)
    # Background pixels are not material AOVs. Bound those inputs for image-wide
    # arithmetic, then independently reject out-of-range values inside wall masks.
    specao=np.clip(np.power(np.maximum(nv+np.clip(ao,0,1),1e-8),np.exp2(-16*np.clip(rough,0,1)-1))-1+ao,0,1)
    env=raw('environment_specular_no_material_ao');g=gain(rough,nv)
    candidate=beauty+env*specao[:,:,None]*(g[:,:,None]-1)
    exr=ExrPasses(next(x['file'] for x in renders if x['pose']==name),name);cy=exr.read('Noisy Image');del exr
    selected=next(x['regions'] for x in regions['poses'] if x['pose']==name)
    for region in selected:
        if not region['region'].endswith('_facade'):continue
        mask=image(control/'masks'/(name+'_'+region['region']+'.png'))[:,:,0]>.5
        if int(mask.sum())!=region['pixels']:raise RuntimeError('Changed wall mask')
        if np.min(ao[mask])<0 or np.max(ao[mask])>1 or np.min(rough[mask])<0 or np.max(rough[mask])>1:raise RuntimeError('Invalid opaque wall AO/roughness')
        cy_y=mean_y(cy,mask);ao_loss=noao-beauty;predicted=indirect*(1-ao[:,:,None])+env*(1-specao[:,:,None])
        closure=float(np.max(np.abs(ao_loss-predicted)[mask]))
        if closure>1e-4:raise RuntimeError('AO channel attribution failed '+str(closure))
        values=ao[mask];ys,xs=np.nonzero(mask);crop=(slice(max(0,ys.min()-8),ys.max()+9),slice(max(0,xs.min()-8),xs.max()+9))
        row={'pose':name,'region':region['region'],'material':region['material'],'pixels':int(mask.sum()),'aoCompositionMaxError':closure,
             'ao':{'mean':float(values.mean()),'p05':float(np.percentile(values,5)),'p50':float(np.median(values)),'p95':float(np.percentile(values,95)),'std':float(values.std()),'fractionBelow095':float(np.mean(values<.95))},
             'gameToCycles':mean_y(beauty,mask)/cy_y,'noAoToCycles':mean_y(noao,mask)/cy_y,'aoDeficitPoints':100*mean_y(ao_loss,mask)/cy_y,
             'diffuseAoDeficitPoints':100*mean_y(diff_noao-diff,mask)/cy_y,'reflectionCandidateToCycles':mean_y(candidate,mask)/cy_y,
             'linearRgbMaeBefore':float(np.mean(np.abs(beauty[mask]-cy[mask]))),'linearRgbMaeCandidate':float(np.mean(np.abs(candidate[mask]-cy[mask]))),
             'candidateGainMean':float(g[mask].mean()),'candidateOutOfFixtureRangeFraction':float(np.mean((nv[mask]<.05)|(rough[mask]<.05)))}
        rows.append(row);print(json.dumps(row),flush=True)
        panels=[]
        for value in [beauty,noao,cy,candidate]:
            im=three_aces(value,meta['exposure']);im[~mask]=.16;panels.append(im[crop])
        write_png(root/'walls'/(name+'_'+region['region']+'.png'),np.concatenate(panels,axis=1))
summary={'rows':rows,'skyBeforeMaxAbsError':max(abs(x['before']-1) for x in heldout),'skyCandidateMaxAbsError':max(abs(x['after']-1) for x in heldout),
         'skyWorsenedCells':sum(abs(x['after']-1)>abs(x['before']-1)+.005 for x in heldout),
         'candidateWorsenedWallMasks':[x['pose']+'/'+x['region'] for x in rows if x['linearRgbMaeCandidate']>x['linearRgbMaeBefore']],
         'wallPanelOrder':['Game production AO','Diagnostic game AO bypass','Physical Cycles','Estimated white-only reflection candidate'],
         'policy':'AO bypass and reflection candidate are counterfactual diagnostic controls, not accepted fixes. PNG panels are raw wall crops; glass excluded. Candidate affects only the indirect specular term. No render, material, bake or reference image is overwritten.'}
save_json(root/'analysis.json',summary)
print(json.dumps({k:v for k,v in summary.items() if k!='rows'}),flush=True)
