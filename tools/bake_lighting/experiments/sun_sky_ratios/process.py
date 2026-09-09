"""Generate ACESFilmic/AgX exposure comparisons, measurements and pose contact sheets."""
import csv
import json
import sys
import time
from pathlib import Path
import numpy as np
import OpenImageIO as oiio
import PyOpenColorIO as ocio

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lighting_configurations' / 'postprocess'))
from color_pipeline import read_pass, display, write_png, sha, save_json
from measure import exposure_offsets, display_metrics, compare_uniform, Y


def read_png(file):
    buffer = oiio.ImageBuf(str(file))
    if not buffer.read():
        raise RuntimeError(buffer.geterror())
    return np.asarray(buffer.get_pixels(oiio.FLOAT))[:, :, :3]


def main():
    started = time.perf_counter()
    request = json.loads(Path(sys.argv[1]).read_text())
    defaults = request['defaults']
    report = Path(request['report'])
    images = report/'images'
    images.mkdir(parents=True, exist_ok=True)
    renders = json.loads(Path(request['renders']).read_text())
    calibration = json.loads(Path(request['calibration']).read_text())
    offsets = exposure_offsets(calibration['cards']['records'], defaults['reference'])
    configuration = ocio.Config.CreateFromFile(request['colorManagement']['config'])
    color_config = {'workingSpace':'Linear Rec.709', 'display':'sRGB'}
    records, checks, transport = [], [], []
    reference_images = {}
    modes = [('matched', offset) for offset in defaults['exposureOffsets']] + [('fixed',0)]
    for render in renders['records']:
        if sha(render['file']) != render['sha256']:
            raise RuntimeError('Changed EXR: '+render['file'])
        rgb = read_pass(render['file'], layer=render['pose'])
        if not np.isfinite(rgb).all():
            raise RuntimeError('Nonfinite radiance')
        groups = {}
        for group in ['Sun','Sky']:
            data = read_pass(render['file'], 'Combined_'+group, layer=render['pose'])
            groups[group] = float((data@Y).mean())
        transport.append({'pose':render['pose'],'light':render['light'],'meanLinearSunIncludingBounce':groups['Sun'],'meanLinearSkyIncludingBounce':groups['Sky']})
        for tone in defaults['tones']:
            for mode, offset in modes:
                ev = (offsets[render['light']] if mode=='matched' else 0) + offset
                encoded = display(rgb*defaults['baseExposure'], tone, ev, color_config, configuration)
                name = f"{render['pose']}_{render['light']}_{tone['id']}_{mode}_{offset:+g}.png"
                target = images/name
                write_png(target, encoded)
                record = {'pose':render['pose'],'busId':render['busId'],'light':render['light'],'tone':tone['id'],
                          'mode':mode,'offset':offset,'exposureEV':ev,'baseExposure':defaults['baseExposure'],
                          'effectiveExposure':defaults['baseExposure']*2**ev,'file':'images/'+name,'sha256':sha(target),
                          'sourceExr':render['file'],'sourceSha256':render['sha256'],'grade':'off',
                          'ocioConfigSha256':sha(request['colorManagement']['config']),
                          'metrics':display_metrics(encoded, defaults['regions'].get(render['pose'],[]))}
                save_json(target.with_suffix('.json'), record)
                records.append(record)
                if mode=='matched' and offset==0:
                    key = (render['pose'],tone['id'])
                    if render['light']==defaults['reference']:
                        reference_images[key] = encoded.copy()
                    if render['light']==defaults['uniformControl']:
                        result = compare_uniform(reference_images[key], encoded)
                        checks.append({'pose':render['pose'],'tone':tone['id'],**result,'passed':result['rmseEncodedRgb'] <= defaults['uniformDisplayRmseLimit']})
        del rgb
        print('AI563_DISPLAY_DONE='+render['id'], flush=True)
    expected = len(request['poses'])*len(defaults['variants'])*len(defaults['tones'])*len(modes)
    if len(records)!=expected or len(checks)!=len(request['poses'])*len(defaults['tones']):
        raise RuntimeError('Incomplete experiment display/control inventory')
    baselines = []
    for baseline in request['baselines']:
        value = read_png(baseline['file'])
        baselines.append({**baseline,'file':str(Path(baseline['file']).relative_to(report)).replace('\\','/'),
                          'metrics':display_metrics(value,defaults['regions'].get(baseline['pose'],[]))})
    sheets = [pose+'_comparison.png' for pose in request['poses']]
    variants = [{**v,'sunEnergy':next(r['lighting']['sunEnergyRelative'] for r in renders['records'] if r['light']==v['id'])} for v in defaults['variants']]
    references = request.get('references', [])
    data = {'poses':request['poses'],'variants':variants,'tones':defaults['tones'],'offsets':offsets,'records':records,'baselines':baselines,'references':references,'sheets':sheets,'policy':defaults['policy']}
    template = (Path(__file__).parent/'gallery.html').read_text(encoding='utf-8')
    (report/'index.html').write_text(template.replace('__DATA__',json.dumps(data).replace('<','\\u003c')),encoding='utf8')
    with open(report/'metrics.csv','w',newline='',encoding='utf8') as stream:
        writer = csv.writer(stream)
        writer.writerow(['pose','light','tone','mode','offset','totalEV','meanEncodedLuminance','nearWhiteFraction','nearBlackFraction'])
        for r in records:
            m = r['metrics']
            writer.writerow([r['pose'],r['light'],r['tone'],r['mode'],r['offset'],r['exposureEV'],m['meanEncodedLuminance'],m['nearWhiteFraction'],m['nearBlackFraction']])
    summary = {'schemaVersion':1,'status':'validated','imageCount':len(records),'baselineCount':len(baselines),
               'poseCount':len(request['poses']),'renderCount':len(renders['records']),'exposureOffsets':offsets,
               'controlPassed':all(check['passed'] for check in checks),'uniformScaleChecks':checks,'transport':transport,
               'processingSeconds':time.perf_counter()-started,'pathTracingSeconds':sum(r['seconds'] for r in renders['records']),
               'records':records,'baselines':baselines,'references':references,'sheets':sheets,'compactSheets':[p+'_source_vs_2x.png' for p in request['poses']],'policy':defaults['policy'],
               'limits':['Fixed image regions are inspection aids, not exact material/shadow segmentation.',
                         'Source hemisphere is a uniform environment approximation; source camera sky is a separate gradient.',
                         'Shader-only window interiors and game grass reflection suppression are not reproduced.',
                         'Noise and denoising may cause small residuals in the uniform-scale control.']}
    save_json(report/'summary.json',summary)
    if not summary['controlPassed']:
        raise RuntimeError('Uniform scale invariance exceeded the configured error limit; inspect summary.json')
    print('AI563_REVIEW_COMPLETE='+str(report/'index.html'),flush=True)


if __name__=='__main__':
    main()
