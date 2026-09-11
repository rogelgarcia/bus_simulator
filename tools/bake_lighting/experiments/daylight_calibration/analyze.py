"""Raw transport checks, frozen exposure, tone comparisons and game-integration handoff."""
import sys,json,time,math,html,shutil
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
import PyOpenColorIO as ocio
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import read_pass,write_png,display,save_json,sha
from daylight_math import Y,irradiance,directions,overcast,chromaticity

NORMALS={'horizontal':(0,0,1),'east':(1,0,0),'north':(0,1,0)}

def relative(a,b):return float(np.linalg.norm(np.asarray(a)-b)/max(np.linalg.norm(b),1e-5))
def fixture_pass(file,suffix):
    image=oiio.ImageInput.open(str(file));part=0
    try:
        while image.seek_subimage(part,0):
            names=list(image.spec().channelnames);channels=['Daylight.'+suffix+'.'+c for c in 'RGB']
            if all(c in names for c in channels):return image.read_image(part,0,0,len(names),oiio.FLOAT)[:,:,[names.index(c) for c in channels]]
            part+=1
        raise RuntimeError('Missing fixture pass '+suffix+' in '+str(file))
    finally:image.close()

def native(record):return np.flipud(np.fromfile(record['raw'],dtype='<f4').reshape(record['height'],record['width'],4))[:,:,:3]
def center(pixels):
    h,w=pixels.shape[:2];return np.mean(pixels[h//4:3*h//4,w//4:3*w//4],axis=(0,1))

def check(checks,name,error,limit,**extra):
    checks.append({'name':name,'status':'pass' if math.isfinite(error) and error<=limit else 'fail','error':float(error),'limit':limit,**extra})

def shadow_profile(pixels):
    h,w=pixels.shape[:2];value=np.mean(pixels[h//3:2*h//3]@Y,axis=0)
    if value[-10:].mean()<value[:10].mean():value=value[::-1]
    normalized=(value-value[:10].mean())/max(value[-10:].mean()-value[:10].mean(),1e-7)
    def crossing(level):
        indices=np.where(normalized>=level)[0]
        if not len(indices):return float('nan')
        i=int(indices[0]);return float(i if not i else i-1+(level-normalized[i-1])/max(normalized[i]-normalized[i-1],1e-8))
    return {'width10to90Meters':(crossing(.9)-crossing(.1))*.16/w,'values':normalized.tolist()}

def validate(root,request,daylight,game,renders):
    checks=[];d=request['defaults'];tol=d['tolerances'];g={r['id']:r for r in game['records']};c={r['id']:r for r in renders if r['kind']=='fixture'};means={};shadows=[]
    for p in daylight['profiles']:
        sky=read_pass(root/'environments'/p['id']/'sky.exr');sun=np.array(p['sunNormalRgb']);direction=np.array(p['sunDirectionBlender'])
        if p['model']=='atmosphere':
            check(checks,p['id']+' spectral solar integral',relative(sun,p['solarQuadrature']['rgb']),tol['sunQuadratureRelative'])
            error=math.degrees(math.acos(float(np.clip(np.dot(p['measuredSunDirectionBlender'],direction),-1,1))))
            check(checks,p['id']+' solar axis',error,tol['sunDirectionDeg'])
            check(checks,p['id']+' zenith blue ordering',0 if sky[1,:,:3].mean(axis=0)[2]>sky[1,:,:3].mean(axis=0)[0] else 1,0)
            # Measured chromaticity is retained, not assigned a made-up measured blue target.
        else:
            expected=overcast(directions(sky.shape[1],sky.shape[0]),p['horizontalIlluminanceLux'])
            check(checks,'CIE overcast relative luminance',relative(sky,expected),tol['overcastRelative'])
            check(checks,'CIE overcast absolute normalization',abs(float(irradiance(sky,[0,0,1])@Y*683)/p['horizontalIlluminanceLux']-1),tol['overcastRelative'])
            check(checks,'Declared D65 overcast chromaticity',float(np.linalg.norm(np.array(p['zenithXy'])-[.3127,.3290])),.0002)
        for normal,n in NORMALS.items():
            expected_sky=irradiance(sky,n);expected_sun=sun*max(float(direction@np.array(n)),0)
            values={}
            for mode in ['sun','sky','combined']:
                ident=p['id']+'_'+mode+'_'+normal
                expected={'sun':expected_sun,'sky':expected_sky,'combined':expected_sun+expected_sky}[mode]*.18/math.pi
                cy=center(read_pass(c[ident]['file']));ga=center(native(g[ident]));values[mode]=(cy,ga)
                means[ident]={'expected':expected.tolist(),'cycles':cy.tolist(),'game':ga.tolist()}
                check(checks,ident+' Cycles receiver',relative(cy,expected),tol['cardRelative'],meanRgb=cy.tolist(),expectedRgb=expected.tolist())
                check(checks,ident+' Game receiver',relative(ga,expected),tol['nativeRelative'],meanRgb=ga.tolist(),expectedRgb=expected.tolist())
            for index,label in [(0,'Cycles'),(1,'Game')]:
                check(checks,p['id']+' '+normal+' '+label+' source additivity',relative(values['sun'][index]+values['sky'][index],values['combined'][index]),tol['additivityRelative'])
        if p['model']=='atmosphere':
            for kind in ['shadow_near','shadow_far']:
                ident=p['id']+'_sun_'+kind;cy=shadow_profile(read_pass(c[ident]['file']));ga=shadow_profile(native(g[ident]));gap=.2 if kind=='shadow_near' else 2
                # Elliptical projection width at 35deg depends on azimuth; compare raw profiles directly.
                shadows.append({'id':ident,'gapMeters':gap,'cycles':cy,'game':ga,'note':'Uniform finite sun vs limb-darkened atmospheric disc; limited native shadow-map spatial resolution.'})
            near,far=shadows[-2:]
            check(checks,p['id']+' reference penumbra grows with gap',0 if far['cycles']['width10to90Meters']>near['cycles']['width10to90Meters']*5 else 1,0)
        sphere_file=c[p['id']+'_combined_spheres']['file']
        glossy=fixture_pass(sphere_file,'Glossy Direct')+fixture_pass(sphere_file,'Glossy Indirect')
        # A missing mirror material previously produced two white diffuse spheres.
        right=float(np.mean(glossy[180:320,300:420]));left=float(np.mean(glossy[180:320,90:210]))
        check(checks,p['id']+' reflective sphere has glossy transport',0 if right>0.01 and right>left*10 else 1,0,rightGlossyMean=right,leftGlossyMean=left)
    # Negative controls: a white balance/color error, doubled sky and rotated directional sun must fail.
    p=daylight['profiles'][0];sky=np.array(p['skyIrradiance']['horizontal']);sun=np.array(p['sunNormalRgb']);direction=np.array(p['sunDirectionBlender'])
    tests={'duplicate sky':relative(2*sky,sky)>tol['nativeRelative'],'wrong solar axis':abs(direction[1]-direction[0])>.5,'blue channel missing':relative(sky*[1,1,0],sky)>tol['nativeRelative']}
    if not all(tests.values()):raise RuntimeError('Calibration does not detect injected errors')
    return checks,means,shadows,{name:bool(value) for name,value in tests.items()}

def make_displays(root,output,request,daylight,game,renders):
    config=ocio.Config.CreateFromFile(request['identity']['ocioConfig']);settings={'workingSpace':'Linear Rec.709','display':'sRGB'}
    tones=[{'id':'aces','label':'ACESFilmic · Three.js r183','type':'three_aces_filmic','exposureMultiplier':1},{'id':'agx','label':'AgX · Blender 5.2.1 / None','type':'ocio','view':'AgX'}]
    variants=[];image_dir=output/'images';image_dir.mkdir(exist_ok=True)
    for record in renders:
        rgb=read_pass(record['file'])
        for tone in tones:
            name=record['id']+'_'+tone['id']+'.png';pixels=display(rgb,tone,daylight['exposureEv'],settings,config)
            write_png(image_dir/name,pixels)
            entry={**{k:v for k,v in record.items() if k not in ['signature']},'tone':tone['id'],'image':'images/'+name,'exposureEv':daylight['exposureEv'],
                'metrics':{'clippedChannelsFraction':float(np.mean(pixels>=.999)),'displayLumaPercentiles':np.percentile(pixels@Y,[1,5,50,95,99]).tolist(),'rawYPercentiles':np.percentile(rgb@Y,[1,5,50,95,99]).tolist()}}
            variants.append(entry)
    return tones,variants

def main():
    start=time.perf_counter();root=Path(sys.argv[1]);output=root/'report';output.mkdir(exist_ok=True)
    request=json.loads((root/'request.json').read_text());daylight=json.loads((root/'daylight.json').read_text());game=json.loads((root/'game.json').read_text());renders=json.loads((root/'renders.json').read_text())
    if (root/'fixture_revision.json').exists():
        revision=json.loads((root/'fixture_revision.json').read_text());renders=[r for r in renders if r['kind']!='fixture']+json.loads(Path(revision['records']).read_text())
    checks,means,shadows,negative=validate(root,request,daylight,game,renders)
    tones,variants=make_displays(root,output,request,daylight,game,renders)
    shutil.copytree(root/'baselines',output/'baselines',dirs_exist_ok=True)
    for record in game['records']:shutil.copyfile(record['png'],output/'images'/('native_'+record['id']+'.png'))
    required={(p['id'],pose['id'],m) for p in daylight['profiles'] for pose in request['identity']['poses'] for m in ['original','neutral']}
    found={(r['profile'],r['pose'],r['material']) for r in renders if r['kind']=='city'}
    if required!=found:raise RuntimeError('Incomplete canonical city matrix')
    profiles=[]
    for p in daylight['profiles']:
        sky=np.array(p['skyIrradiance']['horizontal']);sun=np.array(p['sunNormalRgb'])*p['sunDirectionBlender'][2]
        profiles.append({**p,'estimatedSkyHorizontalLux':float(sky@Y*683),'estimatedSunHorizontalLux':float(sun@Y*683),'sunToSkyHorizontalRatio':float(sun@Y/(sky@Y)),
            'unoccludedToSunBlockedCardRatio':float((sun+sky)@Y/(sky@Y))})
    handoff={'schemaVersion':1,'status':'candidate-only','profiles':profiles,'exposureMultiplier':daylight['exposureMultiplier'],'toneMappingExposurePolicy':daylight['policy'],
        'gameMapping':{'axes':'Three(x,y,z) to Blender(x,-z,y). Sky rotation = atan2(BlenderSun.x,BlenderSun.y), clockwise from +Y. Altitude API in metres.',
            'directionalLight':'intensity=1 and color=linear sunNormalRgb; equivalent max(RGB) intensity with RGB/max color. Do not sRGB-decode these linear values.',
            'environment':'sky.rgba32f: little-endian Float32 RGBA, bottom-up Three equirectangular, intensity=1; same disc-free source for diffuse and reflected sky. No hemisphere.',
            'sunOwnership':'Cycles world includes one limb-darkened solar disc, with no Sun light object. Runtime candidate approximates it with one finite directional Sun; never add the full-disc world to this light.',
            'cameraSun':'Runtime needs a camera-only finite disc consistent with measured direction/color. Keep it out of illumination/reflections already served by the directional Sun. Isolated captures deliberately omit this visual disc.',
            'bakes':'New transport requires newly keyed shadows/indirect/probes. Existing city screenshots are preserved legacy baselines, never paired with candidate lighting as if compatible.'},
        'pendingAI562':['Wire one coherent background/environment/sun profile into runtime and bake key selection.','Evaluate native finite-source shadows in full city; no production filter change here.','Validate material/geometry/export differences, local reflections and dynamic indirect transport.'],
        'pendingAI566':'Repeat candidates after calibrated material profile exists; neutral opaque override changes alpha/glass occlusion and is only a geometry diagnostic.'}
    save_json(output/'daylight_profile.json',handoff)
    limitations=request['defaults']['limitations']+['Opaque neutral override removes alpha, transmission and emissive material behavior. Use it to isolate geometry/lighting, not to score original-material agreement.',
        'Global PMREM cannot reproduce local ground bounces/occluded reflections on the spheres. Their images are diagnostic, not a claim of full native GI parity.',
        'ACESFilmic is the pinned Three.js display operator applied to Cycles linear pixels; AgX uses the pinned Blender OCIO transform. Neither renderer uses a creative grade.',
        'The original game baselines retain their own exposure 1.02 and accepted baked data. Their mismatched illumination prevents a pixel-wise physical error score against the new candidates.']
    summary={'schemaVersion':1,'passed':sum(c['status']=='pass' for c in checks),'failed':sum(c['status']=='fail' for c in checks),'checks':checks,'negativeControls':negative,'cardMeans':means,'shadowProfiles':shadows,
        'profiles':profiles,'exposureEv':daylight['exposureEv'],'exposureMultiplier':daylight['exposureMultiplier'],'limitations':limitations,'renders':len(renders),'cityRenders':len(required),
        'gameSeconds':game['seconds'],'prepare':json.loads((root/'prepare_timing.json').read_text()),'render':json.loads((root/'render_timing.json').read_text()),'originalCityRenderSeconds':sum(r['seconds'] for r in renders if r['kind']=='city'),'selectedFixtureRenderSeconds':sum(r['seconds'] for r in renders if r['kind']=='fixture'),'analysisSeconds':time.perf_counter()-start,
        'gpu':game['records'][0]['gpu'],'browser':game['browserVersion'],'ocioConfig':request['identity']['ocioConfig'],'ocioIdentity':request['identity']['ocioFiles'],'baselinePolicy':'Retained current-bake source screenshots, grading off; unaltered source metadata.'}
    save_json(output/'summary.json',summary);save_json(output/'gallery.json',{'tones':tones,'variants':variants,'poses':[p['id'] for p in request['identity']['poses']],'profiles':profiles,'exposureEv':daylight['exposureEv'],'legacy':json.loads((output/'legacy/controls.json').read_text())['records'] if (output/'legacy/controls.json').exists() else []})
    lines=''.join('<tr><td>'+html.escape(c['name'])+'</td><td class="'+c['status']+'">'+c['status']+'</td><td>'+format(c['error'],'.5g')+'</td><td>'+str(c['limit'])+'</td></tr>' for c in checks)
    metrics=''.join('<tr><td>'+html.escape(p['name'])+'</td><td>'+format(p['estimatedSunHorizontalLux'],'.0f')+'</td><td>'+format(p['estimatedSkyHorizontalLux'],'.0f')+'</td><td>'+format(p['sunToSkyHorizontalRatio'],'.2f')+'</td></tr>' for p in profiles)
    page='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AI 565 · coherent daylight</title><link rel="stylesheet" href="report.css"></head><body><header><h1>Coherent daylight · AI 565</h1><p>One atmosphere, one sun, one exposure. '+str(summary['passed'])+' checks passed; '+str(summary['failed'])+' failed.</p><p>Raw transport retained. Neutral grading. Fixed exposure '+format(daylight['exposureEv'],'.3f')+' EV.</p><nav><a href="daylight_profile.json">Game handoff</a> · <a href="summary.json">Measurements and limitations</a></nav></header><table><tr><th>Model condition</th><th>Sun horizontal lux*</th><th>Sky horizontal lux*</th><th>Sun / sky</th></tr>'+metrics+'</table><p>* Model estimates with declared spectral assumptions. Overcast normalized to 10,000 lux; its D65 color is assumed.</p><div class="controls"><label>Pose <select id="pose"></select></label><label><input id="neutral" type="checkbox"> Show neutral geometry diagnostic</label><button id="compare">Compare selected</button><span id="count"></span></div><div class="tones"><strong>ACESFilmic · Three.js r183</strong><strong>AgX · Blender 5.2.1 / None</strong></div><main id="gallery"></main><h2>Native diagnostic spheres</h2><div id="spheres" class="grid"></div><details><summary>Calibration checks and scope</summary><ul>'+''.join('<li>'+html.escape(l)+'</li>' for l in limitations)+'</ul><table><tr><th>Check</th><th>Status</th><th>Error</th><th>Limit</th></tr>'+lines+'</table></details><dialog id="viewer"><div class="bar"><button id="previous" aria-label="Previous image">←</button><span id="caption"></span><button id="next" aria-label="Next image">→</button><button id="close">Close ×</button></div><div id="large"></div></dialog><script type="module" src="report.js"></script></body></html>'
    (output/'index.html').write_text(page,encoding='utf8')
    print(json.dumps({'passed':summary['passed'],'failed':summary['failed'],'cityRenders':len(required),'report':str(output/'index.html')}))

if __name__=='__main__':main()
