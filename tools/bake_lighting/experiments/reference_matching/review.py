"""Immutable comparison history. Quantitative errors require matching projection and display."""
import sys,json,shutil,html,hashlib
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import write_png
from raw_analysis import analyze_raw

root=Path(sys.argv[1]);r=json.loads((root/'request.json').read_text());assets=root/'images';assets.mkdir()
def copy(src,name):
    dest=assets/name;shutil.copy2(src,dest);return 'images/'+name
def pixels(file):
    image=oiio.ImageInput.open(str(file))
    if not image:raise RuntimeError('Cannot decode '+str(file))
    try:return np.asarray(image.read_image(format=oiio.FLOAT)[:,:,:3],dtype=np.float64)
    finally:image.close()
def linear(a):return np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4)
def stats(a):
    y=linear(a)@np.array([.2126,.7152,.0722])
    return {'luminance':dict(zip(['p05','median','p95'],map(float,np.percentile(y,[5,50,95])))),'nearBlackFraction':float(np.mean(np.max(a,axis=2)<.02)),'clippedFraction':float(np.mean(np.max(a,axis=2)>=254.5/255))}
def crop(a,rect):
    h,w=a.shape[:2];x0,y0,x1,y1=rect;return a[int(y0*h):int(y1*h),int(x0*w):int(x1*w)]
poses=[];measurements=[]
for target in r['renders']:
    pose=target['pose'];ref=pixels(target['image']);cards=[]
    def card(file,name,metadata):
        image=copy(file,pose+'-'+str(len(cards))+'.png')
        thumbnail=pose+'-'+str(len(cards))+'-preview.png'
        original=oiio.ImageBuf(str(file));spec=original.spec()
        preview=oiio.ImageBuf(oiio.ImageSpec(640,max(1,round(spec.height*640/spec.width)),spec.nchannels,oiio.FLOAT))
        if not oiio.ImageBufAlgo.resize(preview,original):raise RuntimeError(preview.geterror())
        preview.write(str(assets/thumbnail))
        cards.append({'name':name,'image':image,'preview':'images/'+thumbnail,'metadata':metadata,'regions':{}})
        return cards[-1]
    historical=Path(r['historical'])
    if pose=='pose_03' and (historical/'user_cycles_target.png').exists():card(historical/'user_cycles_target.png','Historical selected target (35°)',{'comparison':'Visual context; probable L00 / +0.5 EV / neutral match, not exact identity'})
    if pose=='pose_02' and (historical/'pose_02/user_cycles_target_aces_plus_0_5_ev.png').exists():
        card(historical/'pose_02/user_cycles_target_aces_plus_0_5_ev.png','Historical selected target · +0.5 EV',{'comparison':'Visual context; probable L00 / neutral match, not exact identity'})
    reference_card=card(target['image'],'Updated Cycles · calibrated 55°',{'comparisonRole':'calibrated_cycles_55','sunDegrees':55,'EV':target['exposureEv'],'tone':target['tone'],'grade':target['grade'],'seconds':target.get('seconds')})
    for name,rect in r['config']['regions'].get(pose,{}).items():
        file=pose+'-reference-'+name+'.png';write_png(assets/file,crop(ref,rect));reference_card['regions'][name]='images/'+file
    for previous in r.get('referenceHistory',[]):
        record=next((item for item in previous['renders'] if item['pose']==pose),None)
        if record:card(record['image'],'Previous Cycles · '+previous['id'],{
            'EV':record['exposureEv'],'tone':record['tone'],'grade':record['grade'],
            'comparison':'Versioned exporter history; not the current numerical reference'})
    for source in r['sources']:
        record=next((x for x in source['manifest']['images'] if x['id']==pose),None)
        if record is None:continue
        file=Path(source['root'])/record['image'];a=pixels(file)
        game_pose=next(x for x in source['prepared']['poses'] if x['id']==pose)
        reference_pose=next(x for x in r['referenceRequest']['poses'] if x['id']==pose)
        aligned=game_pose==reference_pose
        matched=not source.get('reviewOnly') and aligned and a.shape==ref.shape and abs(record['lighting']['exposure']-2**target['exposureEv'])<1e-8 and record['lighting']['toneMapping']=='aces' and record['graphics']['colorGrading']['preset']=='off' and record['atmosphere']['sun']['elevationDeg']==55
        metrics={'pose':pose,'iteration':source['id'],'matchedDisplayAndSize':matched,'alignedPose':aligned,**stats(a),'performance':record.get('performance'),'regions':{}}
        if matched:metrics['sceneLinear']=analyze_raw(source['root'],pose,target,r['reference'],r['config']['regions'].get(pose,{}),root)
        if matched:metrics['linearizedDisplayRMSE']=float(np.sqrt(np.mean((linear(a)-linear(ref))**2)))
        region_images={}
        for name,rect in r['config']['regions'].get(pose,{}).items():
            ca=crop(a,rect);regional=stats(ca)
            if matched:regional['linearizedDisplayRMSE']=float(np.sqrt(np.mean((linear(ca)-linear(crop(ref,rect)))**2)))
            metrics['regions'][name]=regional
            write_png(assets/(pose+'-'+source['id']+'-'+name+'.png'),ca)
            region_images[name]='images/'+pose+'-'+source['id']+'-'+name+'.png'
        measurements.append(metrics)
        game_card=card(file,source['id'],{'sunDegrees':record['atmosphere']['sun']['elevationDeg'],'EV':float(np.log2(record['lighting']['exposure'])),'mode':record['baked']['status']['effectiveMode'],'tone':record['lighting']['toneMapping'],'grade':record['graphics']['colorGrading']['preset'],'metrics':metrics,'note':r['config'].get('iterationNotes',{}).get(source['id'])})
        game_card['regions']=region_images
        if source['prepared'].get('comparison'):
            game_card['metadata']['comparisonRole']=source['prepared']['comparison']['role']
            game_card['metadata']['comparison']=source['prepared']['comparison']['policy']
        if source.get('reviewOnly'):game_card['metadata']['acceptance']='Rejected / incomplete checks; visual history only'
        game_card['metadata']['viewport']=record['viewport']
    poses.append({'id':pose,'bus':target['bus'],'cards':cards})
(root/'measurements.json').write_text(json.dumps(measurements,indent=2))
(root/'data.json').write_text(json.dumps({'poses':poses,'config':r['config']},indent=2))
for name in ['review.js','review.css']:shutil.copy2(Path(__file__).with_name(name),root/name)
(root/'index.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AI562 · Calibrated game lighting</title><link rel="stylesheet" href="review.css"><body><header><h1>Calibrated game lighting</h1><p>55° clear afternoon · ACESFilmic · grading Off</p><p>Every iteration is preserved. Historical targets use different sunlight. Click a frame for the carousel; arrow keys navigate.</p></header><main id="poses"></main><dialog id="viewer"><header><button id="previous" aria-label="Previous image">←</button><strong id="caption"></strong><button id="next" aria-label="Next image">→</button><button id="close" aria-label="Close">×</button></header><img id="large" alt="Selected comparison"><footer id="thumbs"></footer></dialog><script type="module" src="review.js"></script></body></html>''',encoding='utf-8')
print(json.dumps({'poses':len(poses),'images':sum(len(p['cards']) for p in poses),'quantitativeMatches':sum(m['matchedDisplayAndSize'] for m in measurements),'limits':r['config']['limits']}),flush=True)
