"""Pose-grouped evidence viewer retaining baselines, legacy targets, all iterations and finalists."""
import json,sys,shutil,html
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from color_pipeline import sha,save_json
read=lambda p:json.loads(Path(p).read_text())

def main():
    root=Path(sys.argv[1]);tool=Path(__file__).resolve().parent;repo=tool.parents[3];r=read(root/'request.json');search=read(root/'search.json');profile=read(root/'profile.json');out=Path(sys.argv[2]) if len(sys.argv)>2 else root/'report';(out/'images').mkdir(parents=True,exist_ok=True);items=[]
    def add(file,expected,**meta):
        if sha(file)!=expected:raise RuntimeError('Changed review image: '+str(file))
        name=meta['id']+'.png';shutil.copy2(file,out/'images'/name);items.append({**meta,'image':'images/'+name,'sha256':expected})
    baseline=read(read(root/'baseline.json')['file'])
    for b in baseline['images']:
        add(root/b['image'],b['sha256'],id='baseline_'+b['id'],pose=b['id'],tone='aces',kind='baseline',label='Fresh game · installed bakes · ACESFilmic · grade Off',settings={'exposure':b['renderer']['exposure'],'lighting':b['lighting'],'baked':b['baked'],'shadow':b['shadow'],'materials':b['materials']})
    for c in search['candidates']:
        for im in c['records']:
            add(im['image'],im['sha256'],id=c['id']+'_'+im['pose']+'_'+im['tone'],pose=im['pose'],tone=im['tone'],kind='iteration',label=c['id']+' · '+im['tone']+' · '+c['status'],settings={'daylight':c['daylight'],'material':c['material'],'exposureEv':c['exposureEv'],'globalOffset':c['exposureOffset'],'grade':'off','reason':c['reason'],'metrics':im['metrics'],'reviewFlags':im['reviewFlags'],'raw':im['raw']})
    for im in profile['expected']['images']:
        c=next(c for c in profile['selected'] if c['id']==im['candidate'])
        add(im['image'],im['sha256'],id='final_'+im['candidate']+'_'+im['pose']+'_'+im['tone'],pose=im['pose'],tone=im['tone'],kind='final',label='Final · '+c['id']+' · '+im['tone']+' · '+c['promotion'],settings={'daylight':c['daylight'],'material':c['material'],'exposureEv':c['exposureEv'],'globalOffset':c['exposureOffset'],'grade':'off','evidence':c['evidence'],'metrics':im['metrics'],'reviewFlags':im['reviewFlags']})
    refs=read(tool/'references.json')
    for im in refs['images']:add(repo/im['file'],im['sha256'],id=im['id'],pose=im['pose'],tone='visual',kind='visual',label=im['label'],settings={'role':'visual target only','scored':False,'source':im['file']})
    old=read(Path(r['materialRoot'])/'report/city_metrics.json')
    for im in old['images']:
        if im['variant']!='original' or im['daylight']!='D01':continue
        file=Path(r['materialRoot'])/'report'/im['image']
        add(file,sha(file),id='original_'+im['pose']+'_'+im['tone'],pose=im['pose'],tone=im['tone'],kind='original',label='Original exported materials · D01 · '+im['tone'],settings={'rawSha256':im['sha256'],'exposureEv':im['exposureEv'],'role':'unchanged legacy export under calibrated daylight'})
    attempts=[read(f) for f in sorted((root/'attempts').glob('*.json'))];stages=[{k:v for k,v in a.items() if k!='resources'}|{'peakOwnedResidentBytes':a['resources']['peakOwnedResidentBytes']} for a in attempts]
    data={'images':items,'profile':profile,'validation':read(root/'validation.json'),'finalChecks':read(root/'final_checks.json'),'stages':stages,'search':{k:v for k,v in search.items() if k!='candidates'}}
    (out/'data.js').write_text('window.calibrationReport='+json.dumps(data).replace('<','\\u003c')+';',encoding='utf8')
    for f in ['viewer.js','viewer.css']:shutil.copy2(tool/f,out/f)
    for f in ['profile.json','validation.json','calibration_checks.json','final_checks.json','search.json']:shutil.copy2(root/f,out/f)
    save_json(out/'summary.json',{'imageCount':len(items),'finalists':[{k:v for k,v in c.items() if k!='records'} for c in profile['selected']],'stageTimings':stages,'physicalChecks':read(root/'calibration_checks.json'),'finalRenderChecks':read(root/'final_checks.json')['checks'],'runtimePerformance':'Production renderer unchanged. No production before/after FPS claim. Owned process peak memory sampled every five seconds; GPU memory/time not measured.'})
    (out/'index.html').write_text('''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI567 · Lighting calibration</title><link rel="stylesheet" href="viewer.css"></head><body>
<h1>Lighting calibration · AI 567</h1><p>Fresh game baseline, calibrated Cycles candidates and preserved visual targets. Game settings and production bakes are unchanged. Candidate selection is an explicit preference decision after physical checks.</p>
<details><summary>Checks, assumptions, timing and game integration</summary><div id="evidence"></div><p><a href="profile.json">Versioned handoff</a> · <a href="search.json">All candidates and sensitivity</a> · <a href="validation.json">Independent checks</a> · <a href="summary.json">Timings and results</a></p></details>
<header><label>Pose <select id="pose"><option>pose_01</option><option>pose_02</option><option selected>pose_03</option><option>pose_04</option><option>pose_05</option></select></label><label>Tone <select id="tone"><option value="aces">ACESFilmic</option><option value="agx">AgX</option><option value="all">Both</option></select></label><label>Browse <select id="filter"><option value="shortlist">Finalists + baseline + targets</option><option value="all">Every candidate</option></select></label><button id="defaults">Select baseline + finalists</button><button id="clear">Clear selection</button><button id="compare">Compare selected</button></header>
<p id="count"></p><main id="gallery"></main>
<dialog id="comparison"><nav><button id="close">Close ×</button><button id="gridMode">2 × 2</button><button id="singleMode">Carousel</button><button id="previous" aria-label="Previous image">←</button><button id="next" aria-label="Next image">→</button><span id="position"></span></nav><div id="comparisonImages"></div><footer><label>Configuration <select id="jump"></select></label><div id="thumbnails"></div></footer></dialog>
<script src="data.js"></script><script src="viewer.js"></script></body></html>''',encoding='utf8')
    print('AI567_REVIEW_IMAGES='+str(len(items)),flush=True)
if __name__=='__main__':main()
