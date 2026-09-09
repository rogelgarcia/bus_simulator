"""Derive all exposure and view variants from saved EXRs without tracing rays."""
import sys,json,time
from pathlib import Path
import numpy as np
import PyOpenColorIO as ocio
from color_pipeline import read_pass,display,write_png,sha,save_json

request=json.loads(Path(sys.argv[1]).read_text());renders=json.loads(Path(request['renders']).read_text());config=request['config'];output=Path(request['output']);output.mkdir(parents=True,exist_ok=True)
ocio_path=renders['colorManagement']['config'];configuration=ocio.Config.CreateFromFile(ocio_path)
records=[];start=time.perf_counter()
for render in renders['records']:
    if render['id'].startswith('convergence'):continue
    rgb=None
    for recipe in config['transforms']:
        for stops in (config['finalExposureStops'] if renders['quality']=='final' else config['exposureStops']):
            grades=config['grades'] if recipe['id']=='T1' else [config['grades'][0]]
            for grade in grades:
                name=f"{render['id']}_{recipe['id']}_EV{stops:+g}_{grade['id']}";file=output/(name+'.png');receipt=file.with_suffix('.json')
                identity={'render':render['sha256'],'recipe':recipe,'stops':stops,'grade':grade,'ocio':sha(ocio_path),'processor':request['code']}
                key=__import__('hashlib').sha256(json.dumps(identity,sort_keys=True).encode()).hexdigest()
                if file.exists() and receipt.exists():
                    old=json.loads(receipt.read_text())
                    if old.get('key')==key and old.get('sha256')==sha(file):records.append(old);continue
                if rgb is None:rgb=read_pass(render['file'],layer=render['pose'])
                encoded=display(rgb,recipe,stops,config,configuration,grade);write_png(file,encoded)
                record={'id':name,'pose':render['pose'],'light':render['light'],'transform':recipe['id'],'label':recipe['label'],'exposureStops':stops,'grade':grade['id'],'sourceExr':render['file'],'sourceSha256':render['sha256'],'file':str(file),'sha256':sha(file),'key':key,'colorSpace':'sRGB SDR','workingSpace':config['workingSpace'],'ocioVersion':ocio.__version__,'ocioConfigHash':sha(ocio_path),'renderer':'Cycles','samples':render['profile']['samples'],'seed':render['seed'],'denoised':True,'renderSeconds':render['seconds']}
                record['width']=render['profile']['width'];record['height']=render['profile']['height']
                save_json(receipt,record);records.append(record)
    print('AI560_DISPLAY_DONE='+render['id'],flush=True)
save_json(output/'processed.json',{'schemaVersion':1,'status':'validated','records':records,'seconds':time.perf_counter()-start,'ocioConfig':ocio_path,'ocioVersion':ocio.__version__,'colorSpace':'sRGB SDR'})
