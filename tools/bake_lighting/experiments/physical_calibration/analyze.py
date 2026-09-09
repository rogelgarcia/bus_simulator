"""Compare linear captures to equations; display transforms and missing reference coverage stay separate."""
import html
import json
import sys
from pathlib import Path
import time
import numpy as np
import OpenImageIO as oiio
import PyOpenColorIO as ocio
from expectations import expected_image, measure, mutation_checks, receiver_coordinates, shadow_profile
from measured_reference import audit

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lighting_configurations/postprocess'))
from color_pipeline import read_pass, three_aces, display, write_png, sha, save_json


def png(file):
    image=oiio.ImageBuf(str(file))
    if not image.read():
        raise RuntimeError(image.geterror())
    return np.asarray(image.get_pixels(oiio.FLOAT))[:,:,:3]


def vector_values(image):
    n=image.shape[0]
    return np.array([image[int((i//3+.5)*n/3),int((i%3+.5)*n/3)] for i in range(9)])


def main():
    started=time.perf_counter()
    root=Path(sys.argv[1])
    request=json.loads((root/'request.json').read_text(encoding='utf8'))
    config=request['defaults']
    game=json.loads((root/'game.json').read_text(encoding='utf8'))
    cycles=json.loads((root/'cycles.json').read_text(encoding='utf8'))
    refs=json.loads((root/'references/manifest.json').read_text(encoding='utf8'))
    output=root/'report'
    output.mkdir(exist_ok=True)
    available={entry['id']:entry['status']=='available' for entry in refs['downloads']}
    measurement=audit(root/'references',output,write_png,three_aces) if all(available.values()) else {'status':'unavailable','dataAcquired':False,'reason':'Missing authenticated original images or response spectra; see reference manifest','decodedImages':[]}
    save_json(output/'measured_reference.json',measurement)
    n=config['width']
    x,y=receiver_coordinates(n,config['orthoScale'])
    central=(abs(x)<.08)&(abs(y)<.08)
    results=[]
    images=[]
    for f in config['fixtures']:
        expected=expected_image(f,n,config['orthoScale'])
        native=next(r for r in game['records'] if r['id']==f['id'])
        if sha(native['raw'])!=native['rawHash']['sha256']:
            raise RuntimeError('Changed native pixels')
        game_rgb=np.fromfile(native['raw'],dtype='<f4').reshape(n,n,4)[::-1,:,:3]
        rendered=[r for r in cycles['records'] if r['id']==f['id']]
        for record in rendered:
            if sha(record['file'])!=record['sha256']:
                raise RuntimeError('Changed Cycles EXR')
        samples=[read_pass(r['file'],layer='Calibration') for r in rendered]
        mean=np.mean(samples,axis=0)
        mask=central if f['source']!='shadow' else (x>.02)&(abs(y)<.3)
        tolerance=dict(config['tolerances'])
        if f['source']=='shadow':
            tolerance['linearAbsolute']=config['tolerances']['shadowRmse']*max(f['color'])
        noise=(samples[0]-samples[1])/2 if len(samples)>1 else None
        for renderer,rgb,no in [('Cycles',mean,noise),('Game',game_rgb,None)]:
            check=measure(rgb,expected,mask,tolerance,no)
            results.append({'fixture':f['id'],'renderer':renderer,**check,'shadowFilter':native.get('finiteSunFilter') if renderer=='Game' else None,'knownLimitation':'Native directional shadow has no finite solar disc' if renderer=='Game' and f.get('angularDiameter',0)>0 and not native.get('finiteSunSupported') else None})
        for label,rgb in [('expected',expected),('cycles',mean),('game',game_rgb)]:
            file=f['id']+'_'+label+'.png'
            write_png(output/file,three_aces(rgb,1))
        images.append({'id':f['id'],'files':[f['id']+'_'+kind+'.png' for kind in ['expected','cycles','game']]})
        if f['source']=='shadow':
            save_json(output/(f['id']+'_profile.json'),{'x':x[0].tolist(),'expected':expected[n//2,:,0].tolist(),'cycles':mean[n//2,:,0].tolist(),'game':game_rgb[n//2,:,0].tolist(),'quadratureDifference':float(np.max(abs(shadow_profile(f,n,config['orthoScale'],128)-shadow_profile(f,n,config['orthoScale']))))})
    mutation=mutation_checks(expected_image(config['fixtures'][0],n,config['orthoScale']),central,config['tolerances'])
    vectors=np.array(config['vectors'],dtype=np.float32)
    native=next(r for r in game['records'] if r['id']=='display_vectors')
    native_vectors=np.fromfile(native['raw'],dtype='<f4').reshape(n,n,4)[::-1,:,:3]
    cycles_vectors=read_pass(next(r['file'] for r in cycles['records'] if r['id']=='display_vectors'),layer='Calibration')
    input_checks=[]
    for name,rgb in [('Game linear HDR vectors',native_vectors),('Cycles linear EXR vectors',cycles_vectors)]:
        error=float(np.max(abs(vector_values(rgb)-vectors)))
        input_checks.append({'name':name,'status':'pass' if error<.0001 else 'fail','maxError':error,'limit':.0001})
    hdr_file=output/'known_rgbe.hdr'
    hdr_file.write_bytes(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n'+bytes([128,64,32,131]))
    hdr_image=oiio.ImageBuf(str(hdr_file))
    if not hdr_image.read():
        raise RuntimeError(hdr_image.geterror())
    for name,decoded in [('Three HDRLoader RGBE decode',native['hdrDecode']),('OpenImageIO RGBE decode',np.asarray(hdr_image.get_pixels(oiio.FLOAT))[0,0,:3])]:
        error=float(np.max(abs(np.asarray(decoded)-[4,2,1])))
        input_checks.append({'name':name,'status':'pass' if error<=.03125 else 'fail','maxError':error,'limit':.03125,'decoded':list(map(float,decoded)),'reference':'RGBE bytes 128,64,32,131; a shared exponent gives a 0.03125 radiance quantization bin. No sRGB decode or HDR clamp.'})
    expected_aces=three_aces(vectors,1)
    actual_aces=vector_values(png(native['png']))
    if sha(cycles['ocioConfig'])!=cycles['ocioSha256']:
        raise RuntimeError('OCIO configuration changed')
    for resource in cycles['ocioFiles']:
        if sha(resource['file'])!=resource['sha256']:
            raise RuntimeError('OCIO resource changed: '+resource['file'])
    ocio_config=ocio.Config.CreateFromFile(cycles['ocioConfig'])
    expected_agx=display(vectors.reshape(3,3,3),{'view':'AgX','type':'ocio'},0,{'workingSpace':'Linear Rec.709','display':'sRGB'},ocio_config).reshape(9,3)
    actual_agx=vector_values(png(root/'cycles/display_vectors_agx.png'))
    display_checks=[]
    for name,actual,expected in [('ACESFilmic native GLSL vs offline operator',actual_aces,expected_aces),('AgX Blender PNG vs pinned OCIO CPU transform',actual_agx,expected_agx)]:
        error=float(np.max(abs(actual-expected)))
        display_checks.append({'name':name,'status':'pass' if error<=config['tolerances']['displayAbsolute'] else 'fail','maxError':error,'limit':config['tolerances']['displayAbsolute'],'actual':actual.tolist(),'expected':expected.tolist()})
    for wavelength in [450,550,650]:
        record=next(r for r in cycles['records'] if r['id']=='cornell_'+str(wavelength))
        rgb=read_pass(record['file'],layer='Calibration')
        write_png(output/('cornell_'+str(wavelength)+'.png'),three_aces(rgb,1))
    unavailable=[{'id':'cornell_camera_comparison','status':measurement['status'],'reason':measurement['reason']},
        {'id':'cie171_full_suite','status':'unavailable','reason':'Only 5.2 on-axis A is reproduced from the public AGi32 validation report, I=1000, d=3. Other photometries, cases and full normative definitions are not implemented; no CIE conformity claim.'},
        {'id':'game_cornell_multibounce','status':'unsupported','reason':'Native renderer does not integrate emissive area-source diffuse interreflection without separately baked transport; production bake integration remains AI 562.'}]
    contract={'schemaVersion':1,'workingSpace':'linear Rec.709 / D65','lengthUnit':'metre','radianceScale':'Analytical scalar E and I with L=rho*E/pi; native Three light numeric units mapped explicitly, not a measured spectral watts/lux equivalence.',
        'sourceMapping':{'sun':'Cycles energy = Three directional intensity = specified E','point':'Cycles isotropic power = 4*pi*I; Three intensity = I, decay=2, no cutoff','environment':'constant radiance in Cycles World and native PMREM; native specular=0 fixture'},
        'tone':'Three ACESFilmic revision '+game['records'][0]['threeRevision'],'toneSourceHash':native['toneHash'],'agxConfigHash':cycles['ocioSha256'],'agxResources':cycles['ocioFiles'],'exposure':1,'grading':'off','autoExposure':False,'cornell':'Independent 450/550/650 nm transport at the unchanged relative source spectrum, no RGB reconstruction or fitted exposure','tolerances':config['tolerances'],'limitations':unavailable,
        'camera':'Analytical: orthographic, XY receivers with +Z normal, centre samples, scale in metres. Cornell: original measured table, mm converted to m, 35mm lens, 25mm square sensor, no camera registration inferred from unmatched photographs.',
        'textureDecode':'Known encoded 8-bit sRGB bytes with piecewise IEC transfer; material reflectance/color vectors are linear. Known RGBE fixture checked at one quantization bin; EXR and native float render buffers retain values above 1.',
        'rendererScope':game['records'][0]['scope'],'physicalMismatches':[r for r in results if r['status']=='fail']}
    contract['analyticalReferenceValid']=all(r['status']=='pass' for r in results if r['renderer']=='Cycles')
    contract['displayContractValid']=all(r['status']=='pass' for r in display_checks+input_checks)
    contract['measurementValidated']=False
    save_json(output/'contract.json',contract)
    summary={'schemaVersion':1,'checks':results,'inputChecks':input_checks,'displayChecks':display_checks,'mutationChecks':mutation,'unavailable':unavailable,'references':refs,'gameSeconds':game['seconds'],'cyclesSeconds':cycles['seconds'],'analysisSeconds':time.perf_counter()-started,'devices':cycles['devices'],'gpu':game['records'][0]['gpu'],'blenderVersion':cycles['blenderVersion'],'browserVersion':game['browserVersion'],'passed':sum(r['status']=='pass' for r in results),'failed':sum(r['status']=='fail' for r in results)}
    save_json(output/'summary.json',summary)
    rows=''.join('<tr><td>'+html.escape(r['fixture'])+'</td><td>'+r['renderer']+'</td><td class="'+r['status']+'">'+r['status']+'</td><td>'+format(r['relativeRmse'],'.3%')+'</td><td>'+format(r['energyRatio'],'.4f')+'</td></tr>' for r in results)
    cards=''.join('<section><h2>'+item['id']+'</h2><div class="grid">'+''.join('<figure><img src="'+file+'"><figcaption>'+label+'</figcaption></figure>' for file,label in zip(item['files'],['Analytical expectation','Cycles','Game renderer']))+'</div></section>' for item in images)
    limitations=''.join('<li>'+html.escape(r['id']+': '+r['reason'])+'</li>' for r in unavailable)
    cornell=''.join('<figure><img src="cornell_'+str(w)+'.png"><figcaption>'+str(w)+' nm · relative monochromatic Cycles reference</figcaption></figure>' for w in [450,550,650])
    page='<!doctype html><html><head><meta charset="utf-8"><title>AI 564 physical calibration</title><link rel="stylesheet" href="report.css"></head><body><h1>Physical calibration · AI 564</h1><p>'+str(summary['passed'])+' pass / '+str(summary['failed'])+' fail. A working harness does not mean the renderer passes every physical test.</p><p>Linear values are checked before tone mapping. Images: ACESFilmic, exposure 1, grading off. <a href="summary.json">Measurements</a> · <a href="contract.json">Calibration contract</a></p><ul>'+limitations+'</ul><table><tr><th>Fixture</th><th>Renderer</th><th>Status</th><th>Relative RMSE</th><th>Energy ratio</th></tr>'+rows+'</table>'+cards+'<h2>Cornell measured geometry</h2><p>These are synthetic monochromatic renders, not photographs or RGB color-calibrated targets.</p><div class="grid">'+cornell+'</div></body></html>'
    measurement_gallery='<h2>Original measured photographs</h2><p>'+html.escape(measurement['reason'])+'</p><p>Shared preview gain 16; no physical score or exposure fitting.</p><div class="grid">'+''.join('<figure><img src="'+r['preview']+'"><figcaption>'+html.escape(Path(r['file']).stem)+' · measured camera</figcaption></figure>' for r in measurement['decodedImages'])+'</div>'
    page=page.replace('</body>',measurement_gallery+'</body>')
    diagnostics='<h2>Input and display validation</h2><table><tr><th>Check</th><th>Status</th><th>Maximum absolute error</th><th>Predefined limit</th></tr>'+''.join('<tr><td>'+html.escape(r['name'])+'</td><td class="'+r['status']+'">'+r['status']+'</td><td>'+format(r['maxError'],'.6f')+'</td><td>'+str(r['limit'])+'</td></tr>' for r in input_checks+display_checks)+'</table><h2>Injected faults</h2><p>'+html.escape(', '.join(name+': '+('detected' if detected else 'MISSED') for name,detected in mutation.items()))+'</p>'
    page=page.replace('<h2>Cornell measured geometry</h2>',diagnostics+'<h2>Cornell measured geometry</h2>')
    (output/'index.html').write_text(page,encoding='utf8')
    if not all(mutation.values()):
        raise RuntimeError('Harness did not detect injected calibration faults')
    print(json.dumps({'passed':summary['passed'],'failed':summary['failed'],'display':display_checks,'mutation':mutation}))


if __name__=='__main__':
    main()
