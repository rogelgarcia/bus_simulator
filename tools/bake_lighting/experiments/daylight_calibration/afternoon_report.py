"""Display each elevation at exactly the original finalist exposure, with raw measurements retained."""
import sys,json,html
from pathlib import Path
import numpy as np
import PyOpenColorIO as ocio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import read_pass,display,write_png,sha,save_json,Y

def main():
    root=Path(sys.argv[1]);r=json.loads((root/'request.json').read_text());measurements=json.loads((root/'measurements.json').read_text());records=json.loads((root/'renders.json').read_text())
    records=[{**v,'elevationDeg':35} for v in r['baseline']]+records;out=root/'report';out.mkdir();images=out/'images';images.mkdir();cfg=ocio.Config.CreateFromFile(r['ocioConfig']);rows=[]
    for rec in records:
        if sha(rec['file'])!=rec['sha256']:raise RuntimeError('Raw reference changed')
        rgb=read_pass(rec['file'],layer=rec['pose'])
        if not np.isfinite(rgb).all():raise RuntimeError('Nonfinite comparison')
        for tone in r['tones']:
            encoded=display(rgb,tone,r['exposureEv'],{'workingSpace':'Linear Rec.709','display':'sRGB'},cfg);name=rec['pose']+'_E'+str(rec['elevationDeg'])+'_'+tone['id']+'.png';write_png(images/name,encoded)
            rows.append({'pose':rec['pose'],'elevationDeg':rec['elevationDeg'],'tone':tone['id'],'image':'images/'+name,'sha256':sha(images/name),'raw':rec,'exposureEv':r['exposureEv'],'meanRawY':float((rgb@Y).mean()),'whiteClipFraction':float(np.mean(encoded.min(axis=2)>.99))})
    header='<h1>Bright afternoon daylight</h1><p>35° current reference · 55° afternoon target · 65° higher-sun alternative. Identical geometry, plausible material variant, cameras and global exposure: '+format(r['exposureEv'],'.3f')+' EV. Grading off; no white-balance or sky-color edit. Click an image for its full resolution.</p><p>These angles describe an intended look, not a geolocated clock time. Higher sun naturally changes energy, color, reflections and shadows together. This is a lab comparison; game lighting and bakes are unchanged.</p>'
    body=header
    for pose in r['poses']:
        body+='<h2>'+pose['id']+' · '+pose['busId']+'</h2>'
        for tone in r['tones']:
            body+='<h3>'+html.escape(tone['label'])+'</h3><div class="grid">'
            for elevation in [35,*r['recipe']['elevationsDeg']]:
                row=next(v for v in rows if v['pose']==pose['id'] and v['tone']==tone['id'] and v['elevationDeg']==elevation);label=str(elevation)+'°'+(' · Afternoon target' if elevation==55 else ' · Original' if elevation==35 else ' · Higher sun')
                body+='<figure><figcaption>'+label+'</figcaption><a href="'+row['image']+'"><img src="'+row['image']+'" alt="'+pose['id']+' '+label+'" loading="lazy"></a></figure>'
            body+='</div>'
    body+='<p><a href="comparison.json">Image measurements and provenance</a> · <a href="../measurements.json">Physical checks and irradiance</a></p>'
    (out/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bright afternoon daylight</title><link rel="stylesheet" href="afternoon.css"><body>'+body+'</body></html>',encoding='utf8')
    save_json(out/'comparison.json',{'publication':'experiment-only','recipe':r['recipe'],'images':rows,'physicalChecks':measurements['checks'],'commonExposureEv':r['exposureEv']})
    save_json(root/'afternoon_profile.json',{'publication':'experiment-only','preferredElevationDeg':r['recipe']['preferredElevationDeg'],'profiles':measurements['profiles'],'commonComparisonExposureEv':r['exposureEv'],'exposurePolicy':r['recipe']['exposurePolicy'],'notProductionReady':'Requires matched native sun/sky and regenerated dependent bakes. 35-degree calibration receipts do not certify a new game integration.'})

if __name__=='__main__':main()
