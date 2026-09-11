"""Bounded, identifiable search on authenticated radiance followed by independent finalist verification."""
import sys,json,math,time
from pathlib import Path
import numpy as np
import PyOpenColorIO as ocio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,read_pass,display,write_png,sha,save_json,Y
from metrics import measures,violations,ranking
read=lambda f:json.loads(Path(f).read_text())

def calibrate(root,r):
    checks=[];d=r['daylight'];scale=2**d['exposureEv'];clear=d['profiles'][0]
    E=np.array(clear['skyIrradiance']['horizontal'])+np.array(clear['sunNormalRgb'])*math.sin(math.radians(35))
    err=abs(float(E@Y)*scale/math.pi-1)
    checks.append({'name':'Locked clear neutral receiver scale','value':err,'limit':r['recipe']['physicalTolerances']['cardRelative'],'status':'pass' if err<=r['recipe']['physicalTolerances']['cardRelative'] else 'fail'})
    for rec in read(root/'radiance.json')['records']:
        if sha(rec['file'])!=rec['sha256']:raise RuntimeError('Changed cached raw pass')
        rgb=read_pass(rec['file'],layer=rec['pose']);finite=bool(np.isfinite(rgb).all());checks.append({'name':rec['id']+' finite linear radiance','status':'pass' if finite else 'fail','maximum':float(rgb.max())})
    result={'checks':checks,'passed':sum(c['status']=='pass' for c in checks),'failed':sum(c['status']=='fail' for c in checks),'exposureEv':d['exposureEv'],'linearScale':scale,'exposurePolicy':r['recipe']['uncertainty'],'lightGroupRecombination':False}
    save_json(root/'calibration_checks.json',result)
    if result['failed']:raise RuntimeError('Calibration failure prevents search')

def search(root,r):
    cfg=r['recipe'];baseEv=r['daylight']['exposureEv'];ocio_config=ocio.Config.CreateFromFile(r['ocioConfig']);candidates={};start=time.perf_counter();settings={'workingSpace':'Linear Rec.709','display':'sRGB'}
    for raw in read(root/'radiance.json')['records']:
        rgb=read_pass(raw['file'],layer=raw['pose']);index=read_pass(raw['file'],'Material Index',channels=('X',),layer=raw['pose'])[:,:,0]
        for offset in cfg['exposureOffsets']:
            ident=raw['profile']+'_'+raw['material']+'_ev'+format(offset,'+.1f');directory=root/'iterations'/ident;directory.mkdir(parents=True,exist_ok=True)
            candidate=candidates.setdefault(ident,{'id':ident,'daylight':raw['profile'],'material':raw['material'],'exposureOffset':offset,'exposureEv':baseEv+offset,'grade':'off','records':[]})
            for tone in cfg['tones']:
                file=directory/(raw['pose']+'_'+tone['id']+'.png');metadata=file.with_suffix('.json')
                signature={'rawSha256':raw['sha256'],'recipe':sha(root/'request.json'),'tone':tone,'ev':baseEv+offset}
                if file.exists() and metadata.exists():
                    rec=read(metadata)
                    if rec['signature']!=signature or sha(file)!=rec['sha256']:raise RuntimeError('Candidate iteration changed; preserve it and start a fresh run')
                else:
                    encoded=display(rgb,tone,baseEv+offset,settings,ocio_config);m=measures(rgb,encoded,index,cfg['regions'][raw['pose']]);write_png(file,encoded)
                    rec={'pose':raw['pose'],'tone':tone['id'],'image':str(file),'sha256':sha(file),'raw':raw,'signature':signature,'metrics':m,'reviewFlags':violations(m,cfg['displayGuards'],raw['profile'])};save_json(metadata,rec)
                candidate['records'].append(rec)
        print('AI567_EVALUATED='+raw['id'],flush=True)
    finalists=[]
    for c in candidates.values():
        c['trainingViolations']=[rec['pose']+': '+v for rec in c['records'] if rec['pose'] in cfg['training'] and rec['tone']=='aces' for v in rec['reviewFlags']]
        c['heldOutViolations']=[rec['pose']+': '+v for rec in c['records'] if rec['pose'] in cfg['heldOut'] and rec['tone']=='aces' for v in rec['reviewFlags']]
        c['eligibleSunny']=c['daylight']!='D03';c['status']='retained-alternative' if c['eligibleSunny'] else 'overcast-stress-case'
        c['reason']='Candidate uses declared transport and global display only.' if c['eligibleSunny'] else 'Physical overcast is outside the declared sunny environmental condition.'
    for material in cfg['materials']:
        ordered=sorted([c for c in candidates.values() if c['material']==material and c['eligibleSunny']],key=ranking);best=ordered[0]
        best['status']='finalist';best['reason']='Chosen within this material family by the published lexicographic training rule. Held-out views did not affect selection.';finalists.append({k:v for k,v in best.items() if k!='records'})
        for c in ordered[1:]:c['reason']='Retained for review: lower training/preference priority than '+best['id']
    sensitivity=[]
    for material in cfg['materials']:
        for daylight in cfg['daylights']:
            rows=sorted([c for c in candidates.values() if c['material']==material and c['daylight']==daylight],key=lambda c:c['exposureOffset'])
            sensitivity.append({'material':material,'daylight':daylight,'exposureSweep':[{'ev':c['exposureOffset'],'trainingFlags':len(c['trainingViolations']),'heldOutFlags':len(c['heldOutViolations']),'meanClip':float(np.mean([rec['metrics']['surfaceWhiteClipFraction'] for rec in c['records'] if rec['tone']=='aces']))} for c in rows]})
    save_json(root/'search.json',{'schemaVersion':1,'candidates':list(candidates.values()),'finalists':finalists,'selectionRule':cfg['selectionOrder'],'sensitivity':sensitivity,'seconds':time.perf_counter()-start,'fittedParameters':['global display exposure offset on a fixed half-stop grid'],'lockedParameters':['sun/sky radiometry','material albedos','sky spectral color','geometry','grade'],'ambiguity':'Daylight weather and surface identity are assumed conditions. Ranking is an artistic preference decision after validation, not a photorealism probability.'})

def analyze(root,r):
    cfg=r['recipe'];search_result=read(root/'search.json');raws=read(root/'radiance.json')['records'];ocio_config=ocio.Config.CreateFromFile(r['ocioConfig']);directory=root/'final_images';directory.mkdir(exist_ok=True);checks=[];images=[]
    for rec in read(root/'final_renders.json'):
        if sha(rec['file'])!=rec['sha256']:raise RuntimeError('Finalist raw changed')
        candidate=next(c for c in search_result['finalists'] if c['id']==rec['candidate']);old=next(x for x in raws if x['profile']==rec['daylight'] and x['material']==rec['material'] and x['pose']==rec['pose'])
        rgb=read_pass(rec['file'],layer=rec['pose']);previous=read_pass(old['file'],layer=old['pose']);scale=2**candidate['exposureEv'];diff=abs(rgb-previous)*scale;relative=abs(float(rgb.mean()/previous.mean())-1);p95=float(np.percentile(diff,95));t=cfg['physicalTolerances'];finite=bool(np.isfinite(rgb).all())
        checks.append({'candidate':rec['candidate'],'pose':rec['pose'],'name':'Independent full render vs search cache','status':'pass' if finite and relative<t['finalMeanRelative'] and p95<t['finalP95AbsoluteExposed'] else 'fail','relativeMean':relative,'p95AbsoluteExposed':p95,'limits':t,'note':'Independent seed, higher samples and tighter adaptive threshold; denoising variance is expected.'})
        index=read_pass(rec['file'],'Material Index',channels=('X',),layer=rec['pose'])[:,:,0]
        for tone in cfg['tones']:
            encoded=display(rgb,tone,candidate['exposureEv'],{'workingSpace':'Linear Rec.709','display':'sRGB'},ocio_config);m=measures(rgb,encoded,index,cfg['regions'][rec['pose']]);file=directory/(rec['id']+'_'+tone['id']+'.png');write_png(file,encoded)
            images.append({'candidate':rec['candidate'],'pose':rec['pose'],'tone':tone['id'],'image':str(file),'sha256':sha(file),'metrics':m,'reviewFlags':violations(m,cfg['displayGuards'],rec['daylight'])})
    validation=read(root/'validation.json');profile_materials=read(Path(r['materialRoot'])/'profiles.json') if (Path(r['materialRoot'])/'profiles.json').exists() else read(Path(r['materialRoot'])/'experiment.json')['profiles']
    selected=[]
    for c in search_result['finalists']:
        evidence={'referenceValid':validation['referenceValid'],'identitiesMatch':validation['identitiesMatch'],'fullRenderVerified':all(x['status']=='pass' for x in checks if x['candidate']==c['id']),'heldOutPassed':not any(x['reviewFlags'] for x in images if x['candidate']==c['id'] and x['tone']=='aces' and x['pose'] in cfg['heldOut'])}
        selected.append({**c,'evidence':evidence,'promotion':'validated-lab-candidate' if all(evidence.values()) else 'blocked'})
    limitations=[*read(Path(r['materialRoot'])/'report/corrections.json')['unresolved'],*[x['reason'] for x in validation['limitations']],search_result['ambiguity'],'Legacy game baseline has different lighting from calibrated Cycles. No equal-light game parity or production performance improvement is claimed.','Region statistics are geometry-aligned review diagnostics. They are not physical targets for altered-geometry generated images.']
    integration=[
        'AI562: correct AsphaltFineTextures tangent normal component order on asphalt and markings; check derivative/UV orientation and regenerate dependent bakes.',
        'AI562: port authored Phong F0 conversion to the exporter, separate from optional GGX material choices; preserve bus blue paint, black trim and gray rims.',
        'AI562: adapt procedural interiors, AO, normal strength and alpha semantics; use versioned zero-emission muted interior contract where exact translation is unavailable.',
        'AI562: install coherent disc-free sky for environment plus one calibrated finite sun; hemisphere fill zero. Visible sky and reflections must share the same atmosphere.',
        'AI562: regenerate compatible sky/bounce lighting for all changed materials/environment. Old bakes cannot be retained as matching calibrated illumination.',
        'AI562: match finite-source shadow visibility including canopy contacts and distant penumbrae; direct diffuse baking remains conditional on controlled quality/cost evidence.',
        'AI562: capture all five poses at matched exposure/grade; validate source-isolated city sun/specular/shadow behavior, material toggles without flashes/stalls, and CPU/GPU/memory before/after.',
        'AI551: city-local reflections remain separate. AI567 does not introduce local probes or production defaults.'
    ]
    profile={'schemaVersion':1,'revision':cfg['revision'],'publication':'experiment-only','selected':selected,'source':{'scene':read(root/'scene.json'),'runtime':r['prepared']['source'],'bakes':r['bakes'],'frozenFiles':r['frozenFiles']},'daylight':r['daylight'],'materials':profile_materials,'display':{'workingSpace':'Linear Rec.709 / D65','primary':cfg['tones'][0],'alternative':cfg['tones'][1],'baseExposureEv':r['daylight']['exposureEv'],'grade':'off','autoExposure':False,'ocioConfigSha256':sha(r['ocioConfig']),'engineMapping':'Offline display(rgb, exposureEv) applies 2^EV; Three ACESFilmic toneMappingExposure uses that multiplier including the same internal /0.6 convention.'},'expected':{'finalChecks':checks,'images':images},'limitations':limitations,'integration':integration,'physicalScope':'Validated analytical transport and assumed documented atmosphere/materials, not measured certification of city assets.'}
    save_json(root/'profile.json',profile);save_json(root/'final_checks.json',{'checks':checks,'images':images,'passed':sum(x['status']=='pass' for x in checks),'failed':sum(x['status']=='fail' for x in checks),'promoted':sum(x['promotion']=='validated-lab-candidate' for x in selected)})
    if any(c['status']=='fail' for c in checks):raise RuntimeError('Independent final renders failed verification; profile blocks promotion')
    print('AI567_FINAL_CHECKS='+json.dumps({'passed':len(checks),'selected':[(c['id'],c['promotion']) for c in selected]}),flush=True)

if __name__=='__main__':
    root=Path(sys.argv[1]);r=read(root/'request.json');{'calibrate':calibrate,'search':search,'analyze':analyze}[sys.argv[2]](root,r)
