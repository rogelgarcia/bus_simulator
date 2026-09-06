"""Checks rasterized coverage at every declared triangle's centroid in the actual Cycles outputs."""
import json
import sys
from pathlib import Path
import numpy as np

stage = Path(sys.argv[1]).resolve()
atlas = json.loads((stage / 'atlas.json').read_text())
profile = atlas['profile']
if profile.get('irradianceRepresentation') != 'surface-diffuse-v1':
    raise ValueError('Expected complete surface bake')
images = [np.load(stage / f'sky.{page}.npy', mmap_mode='r') for page in range(atlas['pageCount'])]
report = {'triangles': 0, 'missingRasterCoverage': 0, 'missingBoundarySamples':0, 'examples': [], 'boundaryExamples':[], 'pages': []}
for page, data in enumerate(images):
    if not np.all(np.isfinite(data)) or np.min(data) < 0:
        raise ValueError('Invalid sky irradiance on page ' + str(page))
    report['pages'].append({'page': page, 'coveredPixels': int(np.count_nonzero(data[:, :, 3] > .5)),
        'maximumSky': float(np.max(data[:, :, :3]))})
with (stage / atlas['chartFile']).open() as source:
    for line in source:
        chart = json.loads(line)
        scale = chart['texelsPerMeter']
        for triangle in chart['triangles']:
            uv = np.asarray(triangle['uv'])
            points=np.concatenate([uv,(uv+np.roll(uv,1,axis=0))*.5,np.mean(uv,axis=0)[None,:]])
            pixels = (points - chart['min']) * scale + profile['padding'] + np.array(chart.get('pixelOffset',[.5,.5])) + np.array([chart['x'], chart['y']])
            cells=np.floor(pixels).astype(int); x,y=cells[-1]
            missing=images[chart['page']][cells[:,1],cells[:,0],3]<.5
            report['missingBoundarySamples']+=int(np.count_nonzero(missing[:6]))
            if missing[:6].any() and len(report['boundaryExamples'])<30:
                report['boundaryExamples'].append({'chart':chart['id'],'offset':triangle['offset'],'page':chart['page'],
                    'pixels':cells[:6][missing[:6]].tolist()})
            report['triangles'] += 1
            if images[chart['page']][y, x, 3] < .5:
                report['missingRasterCoverage'] += 1
                if len(report['examples']) < 30:
                    report['examples'].append({'chart': chart['id'], 'offset': triangle['offset'],
                        'page': chart['page'], 'pixel': [int(x), int(y)]})
(stage / 'raster-coverage.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
if report['missingRasterCoverage'] or report['missingBoundarySamples']:
    raise ValueError('Declared triangles sample unwritten bake texels; inspect raster-coverage.json')
