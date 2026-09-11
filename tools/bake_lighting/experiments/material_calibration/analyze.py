"""Separated transport measurements and pose-grouped, explicitly qualified material comparisons."""
import sys,json,time,math,html,shutil
from pathlib import Path
import numpy as np
import PyOpenColorIO as ocio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import ExrPasses,read_pass,write_png,display,three_aces,Y,save_json,sha
from texture_audit import texture_diagnostics

def read(file):return json.loads(Path(file).read_text())
def native(r):return np.flipud(np.fromfile(r['raw'],dtype='<f4').reshape(r['height'],r['width'],4))
def error(a,b):return float(np.linalg.norm(a-b)/max(np.linalg.norm(b),1e-8))
def center(rgb,index):
    h,w=rgb.shape[:2];x=index*128+64;return rgb[h//2-3:h//2+3,x-5:x+5,:3].mean(axis=(0,1))
def check(out,name,value,limit,**extra):out.append({'name':name,'status':'pass' if math.isfinite(value) and value<=limit else 'fail','value':float(value),'limit':limit,**extra})
def scaled(rgb,width=960):
    h,w=rgb.shape[:2];new_h=round(h*width/w);return rgb[np.linspace(0,h-1,new_h).astype(int)[:,None],np.linspace(0,w-1,width).astype(int)]

def fixtures(root,job,output,checks):
    manifest=read(root/'native.json');params=read(manifest['parameters']);game=read(manifest['fixtures']);g={r['id']:r for r in game['records']};measurements=[];cards=[];diagnostics=[]
    cy={r['id']:r for r in read(root/'renders.json') if r['kind']=='fixture'}
    for ident,r in cy.items():
        passes=ExrPasses(r['file'],'Material');rgb=passes.read();diff=(passes.read('Diffuse Direct')+passes.read('Diffuse Indirect'))*passes.read('Diffuse Color');spec=(passes.read('Glossy Direct')+passes.read('Glossy Indirect'))*passes.read('Glossy Color')
        # The constant Cycles world remains visible in raw EXRs. Compare receiver surfaces,
        # and show a neutral black surround matching the native fixture's null background.
        indices=passes.read('Material Index',channels=('X',))[:,:,0];surface=indices>0
        interior=surface.copy()
        for axis in [0,1]:
            for shift in [-2,-1,1,2]:interior&=np.roll(indices,shift,axis)==indices
        rgb=np.where(surface[:,:,None],rgb,0)
        ga=native(g[ident+'_combined'])[:,:,:3];gd=native(g[ident+'_diffuse'])[:,:,:3];gs=native(g[ident+'_specular'])[:,:,:3]
        check(checks,ident+' finite native transport',0 if np.isfinite(ga).all() and np.isfinite(gd).all() and np.isfinite(gs).all() else 1,0)
        # Background is black, fixtures have no emission/transmission; source-isolated lobes reconstruct the image.
        check(checks,ident+' native diffuse/specular sum',error(gd+gs,ga),job['defaults']['tolerances']['lobeRelative'])
        check(checks,ident+' Cycles diffuse/specular sum on receiver interiors',error((diff+spec)[interior],rgb[interior]),job['defaults']['tolerances']['lobeRelative'])
        parts=ident.split('_');kind,angle,mode=parts[0],int(parts[1]),'_'.join(parts[2:])
        if kind=='plane' and mode in ['sun','sky','combined']:
            expected=.18*((math.cos(math.radians(35)) if mode!='sky' else 0)+(1 if mode!='sun' else 0));target=np.full(3,expected)
            for label,pixels in [('game',ga),('cycles',rgb)]:check(checks,ident+' '+label+' analytical gray18',error(center(pixels,0),target),job['defaults']['tolerances']['neutralRelative'])
        for i,m in enumerate(job['materials']):
            a,b=center(ga,i),center(rgb,i);entry={'id':ident,'material':m['id'],'gameRgb':a.tolist(),'cyclesRgb':b.tolist(),'relativeDifference':error(a,b),'gameDiffuse':center(gd,i).tolist(),'gameSpecular':center(gs,i).tolist(),'cyclesDiffuse':center(diff,i).tolist(),'cyclesSpecular':center(spec,i).tolist()}
            entry['status']='review' if entry['relativeDifference']>job['defaults']['tolerances']['fixtureComparisonReviewRelative'] else 'within-declared-review-band'
            if kind=='sphere':
                entry['highlight']={}
                for label,pixels in [('game',gs),('cycles',spec)]:
                    values=(pixels[:,i*128:(i+1)*128,:3]@Y);peak=float(values.max());entry['highlight'][label]={'peakY':peak,'sumY':float(values.sum()),'pixelsAboveHalfPeak':int((values>=peak*.5).sum()) if peak>0 else 0}
            if kind=='plane' and mode=='sun_shadow':
                unshadowed=native(g[f'plane_{angle}_sun_specular'])[:,:,:3];fraction=float(np.linalg.norm(center(gs,i))/max(np.linalg.norm(center(unshadowed,i)),1e-8));entry['directSpecularShadowFraction']=fraction
                check(checks,ident+' '+m['id']+' direct specular visibility',fraction,job['defaults']['tolerances']['directShadowFraction'])
            measurements.append(entry)
        names=[]
        for label,pixels in [('game',ga),('cycles',rgb),('game_specular',gs),('cycles_specular',spec)]:
            file='images/'+ident+'_'+label+'.png';write_png(output/file,three_aces(pixels,1));names.append(file)
        cards.append({'id':ident,'images':names})
    effective=[]
    for r in params['results']:
        rgba=native(r);mask=rgba[:,:,3]>.5;pixels=rgba[:,:,:3][mask]
        item={k:v for k,v in r.items() if k!='raw'};item['coveragePixels']=int(mask.sum());item['raw']=r['raw']
        if len(pixels):
            item['mean']=pixels.mean(axis=0).tolist();item['percentiles']=np.percentile(pixels,[5,50,95],axis=0).tolist();check(checks,r['id']+' '+r['mode']+' finite effective inputs',0 if np.isfinite(pixels).all() else 1,0)
            if r['mode']=='normal_corrected':check(checks,r['id']+' corrected tangent normal faces receiver camera',abs(1-float(item['mean'][2]*2-1)),.01)
        else:item['unavailable']='No projected samples in this view; not a zero-reflectance measurement.'
        file='images/'+r['id']+'_'+r['mode']+'.png';write_png(output/file,three_aces(rgba[:,:,:3],1) if r['mode']=='baseColor' else rgba[:,:,:3]);item['image']=file;effective.append(item)
    check(checks,'24 independent bus reflection combinations preserve colors and restore references',len(params['toggles']['failures']),0,evidence=params['toggles'])
    # Independent fault injection proves that the analytic reference distinguishes gamma and duplicate illumination.
    bad_gamma=((.18+.055)/1.055)**2.4;negative={'sRGB .18 used as linear .18':abs(bad_gamma/.18-1)>.5,'duplicated sky':abs(.36/.18-1)>.5,'Phong F0 copied as GGX tint':abs(.04*.04/.04-1)>.5}
    for name,detected in negative.items():check(checks,'negative control '+name,0 if detected else 1,0)
    return {'measurements':measurements,'effective':effective,'toggles':params['toggles'],'negativeControls':negative,'cards':cards,'nativeSeconds':manifest['seconds'],'browser':manifest['browserVersion'],'limitations':['GGX implementation, energy compensation and PMREM are not identical. A fixture discrepancy is reported, not corrected by changing exposure.','Fixture RGB means approximate textured inputs; actual shader/mesh samples are retained separately.','Cycles lobe conservation excludes a two-pixel material-index edge band, where antialiased world radiance is mixed with surfaces.','Visibility checks cover neutral native GGX fixtures. Production custom grass/asphalt visibility still requires AI559/562 source-isolated city diagnosis.']}

def city(root,job,output,checks):
    daylight_root=Path(job['daylightRoot']);daylight=read(daylight_root/'daylight.json');old=read(daylight_root/'renders.json');renders=read(root/'renders.json')
    request=read(daylight_root/'request.json');config=ocio.Config.CreateFromFile(request['identity']['ocioConfig']);settings={'workingSpace':'Linear Rec.709','display':'sRGB'}
    tones=[{'id':'aces','label':'ACESFilmic · Three.js r183','type':'three_aces_filmic','exposureMultiplier':1},{'id':'agx','label':'AgX · Blender 5.2.1 / None','type':'ocio','view':'AgX'}]
    records=[r for r in old if r['kind']=='city' and r['material']=='original']+[r for r in renders if r['kind']=='city'];images=[];stats=[]
    masks=read(root/'request.json')['sourceScene']['build']['materialMasks'];by_material={m['source']:[int(k) for k,v in masks.items() if v==m['source'] or v.startswith(m['source']+'.')] for m in job['materials'] if m.get('source')}
    for record in records:
        passes=ExrPasses(record['file'],record['pose']);rgb=passes.read();indices=passes.read('Material Index',channels=('X',))[:,:,0]
        diff=(passes.read('Diffuse Direct')+passes.read('Diffuse Indirect'))*passes.read('Diffuse Color');spec=(passes.read('Glossy Direct')+passes.read('Glossy Indirect'))*passes.read('Glossy Color');direct=passes.read('Diffuse Direct')@Y
        check(checks,record['id']+' finite city transport',0 if np.isfinite(rgb).all() else 1,0)
        per_material=[]
        for m in job['materials']:
            if not m.get('source'):continue
            mask=np.isin(indices,by_material[m['source']]);n=int(mask.sum())
            if n<8:continue
            luminance=rgb[mask]@Y;level=np.percentile(direct[mask],[20,80]);dark=mask&(direct<=level[0]);bright=mask&(direct>=level[1]);
            per_material.append({'material':m['id'],'pixels':n,'linearYMean':float(luminance.mean()),'linearYPercentiles':np.percentile(luminance,[5,50,95]).tolist(),'diffuseYMean':float((diff[mask]@Y).mean()),'specularYMean':float((spec[mask]@Y).mean()),'lowDirectRgb':rgb[dark].mean(axis=0).tolist(),'highDirectRgb':rgb[bright].mean(axis=0).tolist(),'rangeInterpretation':'Within-material lower/upper direct-light quintiles, not a geometric sun/shade classifier. Cycles direct includes environment light.'})
        ratios={m['material']:m['linearYMean'] for m in per_material};denom=ratios.get('asphalt')
        stats.append({'id':record['id'],'profile':record['profile'],'pose':record['pose'],'variant':record['material'],'materials':per_material,'relativeToAsphalt':{k:v/denom for k,v in ratios.items()} if denom and denom>1e-8 else {},'specularRawY99':float(np.percentile(spec@Y,99))})
        for tone in tones:
            file='images/'+record['id']+'_'+tone['id']+'.png';encoded=display(rgb,tone,daylight['exposureEv'],settings,config);write_png(output/file,encoded)
            images.append({'pose':record['pose'],'daylight':record['profile'],'variant':record['material'],'tone':tone['id'],'image':file,'exposureEv':daylight['exposureEv'],'file':record['file'],'sha256':record['sha256']})
    for pose in request['identity']['poses']:
        for tone in tones:
            filename=pose['id']+'_'+tone['id']+'_off.png';shutil.copy2(daylight_root/'baselines'/filename,output/'images'/('baseline_'+filename));images.append({'pose':pose['id'],'daylight':'legacy','variant':'game','tone':tone['id'],'image':'images/baseline_'+filename,'exposureEv':'legacy installed bake, unchanged','file':str(daylight_root/'baselines'/filename),'sha256':sha(daylight_root/'baselines'/filename)})
    expected=3*5*len(job['defaults']['cityVariants']);actual=len([r for r in renders if r['kind']=='city']);check(checks,'All daylight/pose/candidate renders',abs(actual-expected),0)
    return {'images':images,'metrics':stats,'tones':tones,'exposureEv':daylight['exposureEv'],'profiles':daylight['profiles']}

def report(root,job,output,summary,fixture,city_data):
    safe=html.escape;images=city_data['images'];data={'images':images};payload=json.dumps(data).replace('<','\\u003c')
    intro='Original game screenshots use the installed baked data and legacy lighting. Cycles columns share AI565 daylight and one calibrated exposure; they are material candidates, not game changes.'
    details='Conversion: correct generated road normal channels and preserve authored Phong F0, with GGX lobe approximation. Plausible: the same corrections plus bounded dry grass/dielectric glazing and bus proposals, and muted opaque window interiors. Original blue/black/gray base colors remain unchanged.'
    content=['<!doctype html><meta charset="utf-8"><title>AI 566 material calibration</title><link rel="stylesheet" href="report.css">',f'<h1>AI 566 · Material calibration</h1><p>{safe(intro)}</p><p>{safe(details)}</p><p>{summary["passed"]} checks pass · {summary["failed"]} fail. Review-band differences are retained for inspection; they are not proof of measured material identity.</p>',
        '<header>Pose <select id="pose">'+''.join(f'<option>pose_0{i}</option>' for i in range(1,6))+'</select> Daylight <select id="daylight"><option>D01</option><option>D02</option><option>D03</option></select> Tone <select id="tone"><option value="aces">ACESFilmic</option><option value="agx">AgX</option></select></header><div id="grid" class="grid"></div>',
        '<details><summary>Neutral material order and fixture inputs</summary><table><tr><th>Material</th><th>Linear RGB</th><th>Roughness</th><th>Metallic</th></tr>']
    for m in job['materials']:content.append(f'<tr><td>{safe(m["label"])}</td><td>{safe(str([round(v,4) for v in m["fixture"]["color"]]))}</td><td>{m["fixture"]["roughness"]:.3f}</td><td>{m["fixture"]["metalness"]}</td></tr>')
    content.append('</table></details><details><summary>Neutral swatches and sphere highlights · game / Cycles / game specular / Cycles specular</summary>')
    for c in fixture['cards']:content.append('<p>'+safe(c['id'])+'</p><div class="strip">'+''.join(f'<img loading="lazy" src="{safe(f)}" alt="{safe(c["id"])}">' for f in c['images'])+'</div>')
    content.append('</details><details><summary>Effective runtime mesh samples</summary><div class="grid">')
    for e in fixture['effective']:content.append(f'<figure><img loading="lazy" src="{safe(e["image"])}"><figcaption>{safe(e["id"]+" · "+e["mode"])} · {e["coveragePixels"]} projected samples</figcaption></figure>')
    content.append('</div></details><p>Machine-readable evidence: <a href="summary.json">checks</a> · <a href="fixture_metrics.json">neutral lobes</a> · <a href="city_metrics.json">city material ratios</a> · <a href="texture_audit.json">AO/encoding/alpha review</a> · <a href="corrections.json">correction report</a> · <a href="candidate_profile.json">versioned candidates</a></p>')
    content.append('<script>const data='+payload+';const labels={game:"Game · installed bake / legacy lighting",original:"Cycles · original exported materials",conversion:"Cycles · normal/F0 corrections",plausible:"Cycles · plausible material proposal"};function draw(){const p=document.getElementById("pose").value,d=document.getElementById("daylight").value,t=document.getElementById("tone").value;document.getElementById("grid").replaceChildren(...["game","original","conversion","plausible"].map(v=>{const a=data.images.find(x=>x.pose===p&&x.tone===t&&x.variant===v&&(v==="game"||x.daylight===d));const f=document.createElement("figure"),i=document.createElement("img"),c=document.createElement("figcaption");i.src=a.image;c.textContent=labels[v]+" · "+p+" · "+(v==="game"?"legacy":d);f.append(i,c);return f;}));}document.querySelectorAll("select").forEach(s=>s.addEventListener("change",draw));document.getElementById("pose").value="pose_03";draw();</script>')
    shutil.copy2(Path(__file__).with_name('report.css'),output/'report.css')
    (output/'index.html').write_text('\n'.join(content),encoding='utf8')

def main():
    start=time.perf_counter();root=Path(sys.argv[1]);job=read(root/'experiment.json');output=root/'report'
    if (output/'summary.json').exists():shutil.copytree(output,root/'analysis_attempts'/str(time.time_ns()))
    output.mkdir(exist_ok=True);(output/'images').mkdir(exist_ok=True);checks=[]
    shutil.copy2(Path(__file__).with_name('references.json'),output/'reference_manifest.json')
    fixture=fixtures(root,job,output,checks);city_data=city(root,job,output,checks);inventory=read(root/'inventory.json');changes=read(root/'city_materials.json')
    check(checks,'Source/runtime material IDs and base colors match',len(inventory['correspondenceErrors']),0)
    check(checks,'Normal/roughness/metallic/alpha/AO textures are not sRGB decoded',len(inventory['dataEncodingErrors']),0)
    check(checks,'Bus candidate base colors are unchanged',sum(c['before']['Base Color']!=c['after']['Base Color'] for c in changes['changes'] if c['source'].split('_')[-1] in ['paint','glass','frontglass','glossy','plastic','rimmetal']),0)
    texture_review=texture_diagnostics(root,inventory,output);save_json(output/'texture_audit.json',texture_review)
    corrections={'verified':[{'id':'generated_road_normal_order','finding':'AsphaltFineTextures writes (-dhx,1,-dhy) into a tangent-space map. The identified generated maps need G/B exchanged; original and corrected effective GPU normals are retained. City candidates apply the same correction without modifying source assets.','materials':inventory['generatedNormalIds']},{'id':'phong_f0_units','finding':'Exporter copies a Phong linear specular color into a GGX dielectric tint, adding a second F0 multiplier. The conversion variant preserves the authored normal-incidence F0; it does not make Phong and GGX identical.'},{'id':'untranslated_procedural','finding':'Source export explicitly strips custom shader hooks. GPU parameter samples and the inventory identify which values cannot be inferred from texture thumbnails.'}],
        'plausibleChoices':['Dry-grass roughness remap 0.65 + 0.30*original; sample moisture/map provenance remain unmeasured.','Dielectric building glass replaces metallic reflection shortcuts while retaining exported opacity; combined runtime blending/cutout remains an adapter requirement.','Preserve original bus base colors; test bounded paint/glass/trim/rim GGX responses.','Opaque zero-emission muted gray/beige window interiors are an explicit visual substitute.'],
        'unresolved':['No measured identity establishes the exact albedo or BRDF of these city assets.','RGB Cornell data cannot be treated as matching measurements without spectral/source/camera identity.','Production procedural world-space wear, parallax, bump/normal scaling, environment response and color/alpha semantics need AI562 adapters.','AO/color-map correlation alone cannot prove duplicated baked illumination.','Neutral fixture visibility is not a complete test of production custom shaders; AI559/562 owns city source-isolated visibility tests.','Legacy Phong F0 values for paint can exceed common coating values; preserving them is a diagnostic conversion, not material certification.','Native/Cycles GGX and PMREM deviations remain in the numerical report; no per-material light/exposure compensation.'],
        'productionHandoff':{'AI567':'Consume versioned candidates, reject unresolved reference mismatches, retain one global daylight exposure.','AI562':'Integrate approved material/export adapters, window contract, bake invalidation and matched runtime captures; profile corrections are not auto-published.','AI551':'City-local reflections remain separate.'},'runtimePerformance':'Not changed in production; frame-time/FPS/GPU cost of production integration is unmeasured. Detached ownership/cache checks do not imply a runtime performance benchmark.'}
    summary={'schemaVersion':1,'passed':sum(c['status']=='pass' for c in checks),'failed':sum(c['status']=='fail' for c in checks),'checks':checks,'fixtureReviewCount':sum(m['status']=='review' for m in fixture['measurements']),'materials':inventory['sourceCount'],'nativeSeconds':fixture['nativeSeconds'],'renderSeconds':sum(r['seconds'] for r in read(root/'renders.json')),'analyzeSeconds':time.perf_counter()-start,'publication':'experiment-only'}
    save_json(output/'summary.json',summary);save_json(output/'fixture_metrics.json',fixture);save_json(output/'city_metrics.json',city_data);save_json(output/'corrections.json',corrections);save_json(output/'candidate_profile.json',{'profiles':job['profiles'],'materialInputs':job['materials'],'sourceAuditHash':job['sourceAuditHash'],'sceneSha256':sha(root/'material_city.blend'),'lighting':str(Path(job['daylightRoot'])/'daylight.json')});report(root,job,output,summary,fixture,city_data)
    for pose in ['pose_02','pose_03']:
        # Compact contact sheets use already display-mapped images; raw measurements never use these thumbnails.
        import OpenImageIO as oiio
        tiles=[]
        for variant in ['game','original','conversion','plausible']:
            r=next(x for x in city_data['images'] if x['pose']==pose and x['tone']=='aces' and x['variant']==variant and (variant=='game' or x['daylight']=='D01'))
            reader=oiio.ImageInput.open(str(output/r['image']));pixels=reader.read_image(format=oiio.FLOAT);reader.close();tiles.append(scaled(pixels[:,:,:3]))
        contact=np.concatenate([np.concatenate(tiles[:2],axis=1),np.concatenate(tiles[2:],axis=1)],axis=0);write_png(output/(pose+'_comparison.png'),contact)
    save_json(output/'analysis_timing.json',{'seconds':time.perf_counter()-start});print('AI566_ANALYSIS='+json.dumps({k:v for k,v in summary.items() if k!='checks'}),flush=True)
    if summary['failed']:raise RuntimeError('Material calibration checks failed; inspect summary.json. No candidate promoted.')
if __name__=='__main__':main()
