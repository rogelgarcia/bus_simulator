"""Linear transport and display diagnostics; shortlist is a review aid, not a realism score."""
import sys,json,time,csv
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'postprocess'))
import numpy as np
import OpenImageIO as oiio
from color_pipeline import ExrPasses,read_pass,Y,save_json,srgb_decode,write_png

request=json.loads(Path(sys.argv[1]).read_text());renders=json.loads(Path(request['renders']).read_text());processed=json.loads(Path(request['processed']).read_text());settings=request['config'];start=time.perf_counter()
def stats(rgb):
    finite=np.isfinite(rgb);safe=np.where(finite,rgb,0);luma=safe@Y
    return {'nonfiniteComponents':int((~finite).sum()),'negativeComponents':int((safe<0).sum()),'luminancePercentiles':dict(zip(['p01','p10','p50','p90','p99','p999'],np.percentile(luma,[1,10,50,90,99,99.9]).tolist())), 'meanLuminance':float(luma.mean()),'maximumComponent':float(safe.max())}
linear=[];images=[];diagnostics=[];crops=[];mask_cache={}
for record in renders['records']:
    passes=ExrPasses(record['file'],record['pose'])
    rgb=passes.read();metrics=stats(rgb);noisy=passes.read('Noisy Image',True)
    if noisy is not None:
        metrics['rawMinusDenoisedRms']=float(np.sqrt(np.mean((noisy-rgb)**2)))
        metrics['noiseCaveat']='Raw minus denoised includes filtering bias; it is not an independent reference error.'
    parts={};recombined=np.zeros_like(rgb)
    for family in ['Diffuse','Glossy','Transmission']:
        color=passes.read(family+' Color',True);direct=passes.read(family+' Direct',True);indirect=passes.read(family+' Indirect',True)
        if color is not None and direct is not None and indirect is not None:
            parts[family]={'directMean':float(((direct*color)@Y).mean()),'indirectMean':float(((indirect*color)@Y).mean())};recombined+=(direct+indirect)*color
    for name in ['Emission','Environment']:
        contribution=passes.read(name,True)
        if contribution is not None:recombined+=contribution
    if parts:
        metrics['passContributions']=parts;metrics['recombinationRmsVsNoisy']=float(np.sqrt(np.mean((recombined-(noisy if noisy is not None else rgb))**2)))
        metrics['passSemantics']='Cycles DiffDir includes direct environment illumination. These are transport-lobe passes, not sun/sky separation.'
    groups={}
    for name in ['Sun','Sky']:
        group=passes.read('Combined_'+name,True)
        if group is not None:groups[name]=stats(group)
    metrics['sourceLightGroups']=groups
    indices=passes.read('Material Index',False,('X',))[:,:,0].round().astype(np.int32)
    material_regions={}
    for suffix in ['paint','glass','frontglass','rimmetal','tire','glossy']:
        ids=[int(k) for k,name in renders['materialMasks'].items() if name.endswith('_'+suffix)]
        mask=np.isin(indices,ids)
        if mask.sum()>16:material_regions[suffix]={'pixels':int(mask.sum()),**stats(rgb[mask].reshape(-1,1,3))}
    metrics['sourceMaterialRegions']=material_regions
    p99=metrics['luminancePercentiles']['p99'];metrics['extremeHdrPixelFraction']=float(((rgb@Y)>max(1e-8,p99)*settings['definitions']['fireflyMultipleOfP99']).mean())
    if metrics['nonfiniteComponents']:raise RuntimeError('Nonfinite beauty pixels in '+record['id'])
    linear.append({'id':record['id'],'pose':record['pose'],'light':record['light'],'file':record['file'],'seconds':record['seconds'],'metrics':metrics})
    if record['id']=='convergence_high_bounce':
        reference=next((r for r in renders['records'] if r['pose']==record['pose'] and r['light']==record['light'] and r['id']!='convergence_high_bounce'),None)
        if reference:
            base=read_pass(reference['file'],layer=reference['pose']);delta=rgb-base;diagnostics.append({'reference':reference['id'],'comparison':record['id'],'relativeRms':float(np.sqrt(np.mean(delta**2))/max(1e-8,np.sqrt(np.mean(rgb**2)))),'meanLuminanceChange':float((delta@Y).mean()),'interpretation':'Independent seed, doubled budget and higher bounce limit together; cannot separate noise from bounce bias.'})
    del passes
    print('AI560_LINEAR_ANALYZED='+record['id'],flush=True)
for record in processed['records']:
    image=oiio.ImageInput.open(record['file']);rgb=np.asarray(image.read_image(format=oiio.FLOAT));image.close();luma=rgb@Y;maximum=rgb.max(axis=2);minimum=rgb.min(axis=2);sat=(maximum-minimum)/np.maximum(maximum,1e-6)
    metrics=stats(srgb_decode(rgb));metrics.update({'clippedFraction':float((maximum>=settings['definitions']['displayHighlight']).mean()),'blackFraction':float((maximum<=settings['definitions']['displayBlack']).mean()),'highSaturationFraction':float((sat>=settings['definitions']['saturationWarning']).mean())})
    regions={}
    for name,rect in settings.get('regions',{}).items():
        x,y,w,h=rect;height,width=rgb.shape[:2];crop=rgb[int(y*height):int((y+h)*height),int(x*width):int((x+w)*width)];regions[name]=stats(srgb_decode(crop))
        luminance=srgb_decode(crop)@Y;regions[name]['gradientEnergy']=float((np.abs(np.diff(luminance,axis=0)).mean()+np.abs(np.diff(luminance,axis=1)).mean())/2)
        if record['transform']==settings['shortlist']['referenceTransform'] and record['exposureStops']==settings['shortlist']['referenceExposure'] and record['grade']=='neutral':
            target=Path(request['output'])/'crops'/(record['id']+'_'+name+'.png');target.parent.mkdir(exist_ok=True);write_png(target,crop);crops.append({'pose':record['pose'],'light':record['light'],'region':name,'file':str(target),'source':record['file'],'rect':rect,'quality':renders['quality']})
    metrics['rgbClippedFractions']=(rgb>=settings['definitions']['displayHighlight']).mean(axis=(0,1)).tolist()
    metrics['displayChromaMean']=float((maximum-minimum).mean())
    images.append({**record,'metrics':metrics,'regions':regions})
scores=[]
for light in settings['shortlist']['candidates']:
    candidates=[r for r in images if r['light']==light and r['transform']==settings['shortlist']['referenceTransform'] and r['exposureStops']==settings['shortlist']['referenceExposure'] and r['grade']=='neutral' and not r['id'].startswith('convergence')]
    if candidates:
        clipping=float(np.mean([r['metrics']['clippedFraction'] for r in candidates]));saturation=float(np.mean([r['metrics']['highSaturationFraction'] for r in candidates]));scores.append({'light':light,'reviewPenalty':clipping*4+saturation,'clipping':clipping,'saturation':saturation})
scores.sort(key=lambda item:(item['reviewPenalty'],item['light']));shortlist=[item['light'] for item in scores[:settings['shortlist']['count']]]
resolution='3840x2160' if renders['quality']=='final' else '1920x1080';baseline_root=Path(request['runRoot'])/'runtime'/'G00_existing_baked'/resolution
for file in sorted(baseline_root.glob('pose_*.png')):
    input=oiio.ImageInput.open(str(file));rgb=np.asarray(input.read_image(format=oiio.FLOAT));input.close();height,width=rgb.shape[:2]
    for name,(x,y,w,h) in settings['regions'].items():
        crop=rgb[int(y*height):int((y+h)*height),int(x*width):int((x+w)*width)];target=Path(request['output'])/'crops'/(file.stem+'_G00_'+name+'.png');target.parent.mkdir(exist_ok=True);write_png(target,crop);crops.append({'pose':file.stem,'light':'G00','region':name,'file':str(target),'source':str(file),'rect':[x,y,w,h],'quality':renders['quality']})
with (Path(request['output'])/'metrics.csv').open('w',newline='') as stream:
    writer=csv.writer(stream);writer.writerow(['pose','light','transform','exposure_ev','grade','mean_linear_display_luminance','clipped_fraction','black_fraction','high_saturation_fraction','render_seconds'])
    for image in images:writer.writerow([image[k] for k in ['pose','light','transform','exposureStops','grade']]+[image['metrics'][k] for k in ['meanLuminance','clippedFraction','blackFraction','highSaturationFraction']]+[image['renderSeconds']])
save_json(Path(request['output'])/'analysis.json',{'schemaVersion':1,'status':'validated','images':images,'linear':linear,'crops':crops,'convergence':diagnostics,'shortlist':shortlist,'shortlistDiagnostics':scores,'seconds':time.perf_counter()-start,'caveats':['Histogram thresholds only flag extremes; dark trim, sky and bright metal can legitimately trigger them.','Normalized crop regions are reproducible areas, not semantic object masks.','Lower clipping/saturation does not establish photorealism. Compare fixed poses visually before choosing settings.','L00 uses uniform hemisphere fill and a source-gradient/haze camera sky without optical glare; transport remains an approximation.','Procedural interiors and Phong material translations prevent pixel-identical comparison.','Material-index masks exclude mixed antialiased edges. Gradient energy is a texture diagnostic, not an independently calibrated quality score.','No automatic ground-truth shadow-leak classifier or perceptual hue-preservation assessment is claimed.']})
