"""Correct the mixed-face measurement error without changing geometry or dropping radiance pixels."""
import sys,json
from pathlib import Path
import numpy as np,OpenImageIO as oiio
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));sys.path.insert(0,str(HERE.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,Y,save_json,write_png,three_aces
from surface_normal_metrics import comparable_faces,self_test
self_test()
root=Path(sys.argv[1]);r=json.loads((root/'request.json').read_text());reference=Path(r['geometryReference']);rows=[]
original_request=json.loads((reference/'request.json').read_text());capture=Path(original_request['geometryCapture']);records=json.loads((Path(r['reference'])/'renders.json').read_text())
for name in ['pose_02','pose_04']:
    im=oiio.ImageInput.open(str(Path(r['control'])/'masks'/(name+'_shaded_facade.png')));mask=im.read_image(format=oiio.FLOAT)[:,:,0]>.5;im.close()
    for variant in ['geometric_constant','normal_constant']:
        exr=ExrPasses(next(x['file'] for x in records if x['pose']==name and x['variant']==variant),name)
        mask&=np.abs(exr.read('AI570 Roughness',channels=['X'])[:,:,0]-.85)<1e-4;del exr
    exr=ExrPasses(reference/(name+'.exr'),name);convert=lambda v:np.stack([v[:,:,0],v[:,:,2],-v[:,:,1]],axis=2)
    cp=convert(exr.read('AI571 Position'));cf=convert(exr.read('AI571 Face Normal'));cn=convert(exr.read('AI571 Mesh Normal'));del exr
    shape=(*mask.shape,4);game=lambda key:np.flipud(np.memmap(capture/name/(key+'.rgba32f'),mode='r',dtype='<f4',shape=shape))[:,:,:3]
    gp=game('geometric__position');gf=game('geometric__face_normal');gn=game('geometric__normal')*2-1
    coherent,matching,face_angle=comparable_faces(gp,cp,gf,cf,mask)
    norm=lambda v:v/np.maximum(np.linalg.norm(v,axis=-1,keepdims=True),1e-8)
    angle=np.degrees(np.arccos(np.clip(np.sum(norm(gn)*norm(cn),axis=-1),-1,1)))
    stats=lambda a,m:{'median':float(np.median(a[m])),'p95':float(np.percentile(a[m],95)),'max':float(a[m].max())}
    row={'pose':name,'strictPixels':int(mask.sum()),'mixedFacePixels':int((mask&~coherent).sum()),'coherentPixels':int(coherent.sum()),'matchingPositionPixels':int(matching.sum()),
        'allPixelsNormalDegrees':stats(angle,mask),'comparableNormalDegrees':stats(angle,matching),'comparableFaceDegrees':stats(face_angle,matching),
        'positionDifferenceMeters':stats(np.linalg.norm(gp-cp,axis=-1),matching)}
    # Existing diffuse results retain all strict pixels; report both categories explicitly.
    old=Path(r['capture'])/name;gd=np.flipud(np.memmap(old/'diffuse_no_material_ao.rgba32f',mode='r',dtype='<f4',shape=shape))[:,:,:3]
    exr=ExrPasses(next(x['file'] for x in records if x['pose']==name and x['variant']=='native'),name)
    cd=(exr.read('Diffuse Direct')+exr.read('Diffuse Indirect'))*exr.read('Diffuse Color');del exr
    row['nativeDiffuseRatio']={label:float(np.mean(gd[m]@Y)/np.mean(cd[m]@Y)) for label,m in [('allStrict',mask),('comparableFaces',matching)]}
    rows.append(row);print(json.dumps(row),flush=True)
    rgb=np.zeros((*mask.shape,3),np.float32);rgb[matching]=(.18,.7,.35);rgb[mask&~coherent]=(.8,.35,.12);rgb[coherent&~matching]=(.5,.3,.7)
    y,x=np.nonzero(mask);crop=(slice(y.min(),y.max()+1),slice(x.min(),x.max()+1));write_png(root/(name+'_coherent_green_mixed_orange.png'),rgb[crop])
save_json(root/'analysis.json',{'policy':'Separate mixed-face AA footprints before normal metrics; radiance full-mask metrics retained','selfTestPassed':True,'poses':rows})
