# Measures projected alpha coverage with fixed LOD0 framing from 24 directions, including bus-height angles.
import json
from pathlib import Path

import numpy as np

from core_atlas import read_images
from common import write_json
from lod1_canopy import arrays

RESOLUTION = 256


def measure(options, model):
    source = Path(options['source']); output = Path(options['output']); species = model.split('/')[0]
    old = arrays(json.loads((source/model/'layout.json').read_text())['planes'])
    new = arrays(json.loads((output/model/'layout.json').read_text())['planes'])
    alpha = [read_images(directory/species/'canopy')['color'][:, :, 3] for directory in [source, output]]
    records = []
    centers = np.array([p['center'] for p in old])
    extent = max(max(p['size']) for p in old)
    for elevation in [-12, 15, 40]:
        for azimuth in range(0, 360, 45):
            az, el = np.radians([azimuth, elevation])
            sight = np.array([np.cos(az)*np.cos(el), np.sin(az)*np.cos(el), np.sin(el)])
            right = np.array([-np.sin(az), np.cos(az), 0]); up = np.cross(sight, right)
            basis = np.column_stack([right, up]); projected = centers @ basis
            minimum = projected.min(axis=0)-extent/2
            scale = (RESOLUTION-2)/max(np.ptp(projected, axis=0)+extent)
            maps = []
            for planes, texture in zip([old, new], alpha):
                counts = np.zeros((RESOLUTION, RESOLUTION), np.int32)
                h, w = texture.shape
                for plane in planes:
                    axes = (plane['basis'][:, :2]*plane['size']).T @ basis * scale
                    if abs(np.linalg.det(axes)) < .01: continue
                    center = (plane['center'] @ basis-minimum)*scale+1
                    corners = np.array([[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]) @ axes+center
                    low = np.maximum(np.floor(corners.min(axis=0)).astype(int), 0)
                    high = np.minimum(np.ceil(corners.max(axis=0)).astype(int), RESOLUTION-1)
                    if np.any(high < low): continue
                    yy, xx = np.mgrid[low[1]:high[1]+1, low[0]:high[0]+1]
                    uv = (np.column_stack([xx.ravel()+.5, yy.ravel()+.5])-center) @ np.linalg.inv(axes)+.5
                    inside = np.all((uv >= 0) & (uv < 1), axis=1)
                    uv = uv[inside]; x, y = xx.ravel()[inside], yy.ravel()[inside]
                    tile = plane['tile']
                    tx = np.clip(((tile%8+uv[:, 0])*w/8).astype(int), 0, w-1)
                    ty = np.clip(((tile//8+uv[:, 1])*h/6).astype(int), 0, h-1)
                    opaque = texture[ty, tx] >= .5
                    counts[y[opaque], x[opaque]] += 1
                maps.append(counts)
            before, after = [m > 0 for m in maps]
            dilated = before.copy()
            for dy in range(-2, 3):
                for dx in range(-2, 3): dilated |= np.roll(before, (dy, dx), axis=(0,1))
            records.append({'azimuth': azimuth, 'elevation': elevation, 'lod0Pixels': int(before.sum()), 'lod1Pixels': int(after.sum()),
                            'coverageRatio': float(after.sum()/max(before.sum(), 1)),
                            'outsideLod0EnvelopeFraction': float((after & ~dilated).sum()/max(after.sum(), 1)),
                            'lod0OpaqueFragments': int(maps[0].sum()), 'lod1OpaqueFragments': int(maps[1].sum())})
    write_json(output/model/'coverage.json', {'resolution': RESOLUTION, 'views': records,
               'scope': 'Orthographic alpha coverage, not depth correctness or GPU frame time; envelope uses a two-pixel tolerance'})
    print(f'[LOD1] Coverage {model}: {min(r["coverageRatio"] for r in records):.1%}–{max(r["coverageRatio"] for r in records):.1%}', flush=True)
