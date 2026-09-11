"""Sampled texture diagnostics flag possible baked lighting without inferring an asset's history."""
import json,base64
from pathlib import Path
import numpy as np
import OpenImageIO as oiio

def texture_diagnostics(root,inventory,output):
    runtime=json.loads((root/'runtime_audit.json').read_text());results=[]
    for row in inventory['rows']:
        if not row.get('source'):continue
        maps=row['maps'];a=maps.get('map');b=maps.get('aoMap');item={'material':row['id'],'source':row['source'],'aoIntensity':row['runtime']['inputs'].get('aoMapIntensity'),'textureOnly':True}
        if not a or not b:item['correlationUnavailable']='No paired base-color/AO map. This does not exclude shader AO or baked detail in color.'
        elif not a.get('thumbnail') or not b.get('thumbnail'):item['correlationUnavailable']='CPU thumbnail unavailable for one texture.'
        elif any(a.get(k)!=b.get(k) for k in ['channel','repeat','offset','rotation','flipY']):item['correlationUnavailable']='UV transforms differ; unaligned texture correlation is not meaningful.'
        else:
            pixels=[]
            for role,t in [('color',a),('ao',b)]:
                path=output/'texture_samples'/(row['id']+'_'+role+'.png');path.parent.mkdir(exist_ok=True);path.write_bytes(base64.b64decode(t['thumbnail'].split(',')[1]))
                image=oiio.ImageInput.open(str(path));v=image.read_image(format=oiio.FLOAT)[:,:,:3];image.close()
                if t['colorSpace']=='srgb':v=np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
                pixels.append((v@np.array([.2126,.7152,.0722]) if role=='color' else v[:,:,0]).ravel())
            if min(np.std(v) for v in pixels)<1e-6:item['correlationUnavailable']='One map is constant; correlation undefined.'
            else:item['colorAoPearson']=float(np.corrcoef(*pixels)[0,1]);item['review']=abs(item['colorAoPearson'])>.5
        item['interpretation']='Correlation may reflect shared geometry or authoring, not necessarily duplicated illumination; verify source assets and shader terms before removing AO.';results.append(item)
    materials={m['id']:m for m in runtime['records']}
    encoding=[{**e,'interpretation':'Window shade shader consumes linear scalar fabric noise around unity; this is not an ordinary albedo texture. Export the shader meaning, not a blind sRGB conversion.' if materials[e['id']]['userData'].get('windowShade') else 'Unresolved encoding/source intent; no automatic gamma change.'} for e in inventory['colorEncodingReview']]
    return {'materials':results,'runtimeAoMapCount':sum('aoMap' in m['textures'] for m in runtime['records']),'runtimeLightMapCount':sum('lightMap' in m['textures'] for m in runtime['records']),'blendedAndCutoutMaterialIds':[m['id'] for m in runtime['records'] if m['inputs']['transparent'] and m['inputs']['alphaTest']>0],'alphaLimitation':'glTF chooses one alpha mode; simultaneous source blending and alpha testing needs an explicit adapter. Candidate opacity preservation alone is not complete cutout parity.','colorEncodingReview':encoding}
