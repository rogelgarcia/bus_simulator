# Reproject LOD0 crown interiors and cluster exterior leaf patches without changing the five crown masses.
import copy
import json
from pathlib import Path

import numpy as np

from atlas import bleed, mip_chain, write_pixels
from core_atlas import read_images
from common import write_json

TILE = 256
CHANNELS = ['color', 'normal', 'orm']


def arrays(planes):
    return [{**plane, **{key: np.asarray(plane[key], np.float64) for key in ['center', 'basis', 'size']}} for plane in planes]


def empty_patch():
    result = {channel: np.zeros((TILE, TILE, 4), np.float32) for channel in CHANNELS}
    result['normal'][:, :, :3] = [.5, .5, 1]
    result['orm'][:, :, :3] = [1, .65, 0]
    return result


def stamp(pixels, source, target, images):
    basis, size = target['basis'], target['size']
    axes = (source['basis'][:, :2] * source['size']).T @ basis[:, :2] / size * TILE
    if abs(np.linalg.det(axes)) < .03: return
    center = (source['center'] - target['center']) @ basis[:, :2] / size * TILE + TILE / 2
    corners = np.array([[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]]) @ axes + center
    low = np.maximum(np.floor(corners.min(axis=0)).astype(int), 2)
    high = np.minimum(np.ceil(corners.max(axis=0)).astype(int), TILE - 3)
    if np.any(high < low): return
    yy, xx = np.mgrid[low[1]:high[1]+1, low[0]:high[0]+1]
    uv = (np.column_stack([xx.ravel()+.5, yy.ravel()+.5]) - center) @ np.linalg.inv(axes) + .5
    inside = np.all((uv >= 0) & (uv < 1), axis=1)
    uv = uv[inside]; x, y = xx.ravel()[inside], yy.ravel()[inside]
    h, w = images['color'].shape[:2]; tile = source['tile']
    tx = np.clip(((tile % 8 + uv[:, 0]) * w / 8).astype(int), 0, w-1)
    ty = np.clip(((tile // 8 + uv[:, 1]) * h / 6).astype(int), 0, h-1)
    opaque = images['color'][ty, tx, 3] >= .5
    x, y, tx, ty = x[opaque], y[opaque], tx[opaque], ty[opaque]
    for channel in CHANNELS:
        values = images[channel][ty, tx].copy()
        if channel == 'normal':
            vectors = (values[:, :3] * 2 - 1) @ source['basis'].T @ basis
            vectors[vectors[:, 2] < 0] *= -1
            vectors /= np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-8)
            values[:, :3] = vectors * .5 + .5
        values[:, 3] = 1
        pixels[channel][y, x] = values


def patch_tiles(images, groups):
    target = {'center': np.zeros(3), 'basis': np.eye(3), 'size': np.ones(2)}
    output = []
    for count in groups:
        if count <= 3:
            centers = [[(0, 0)], [(-.15, -.15), (.15, .15)], [(-.18, -.15), (.18, -.14), (0, .19)]][count-1]
            scale = [1, .7, .59][count-1]
        else:
            columns = int(np.ceil(np.sqrt(count))); rows = int(np.ceil(count/columns))
            centers = [((i%columns+.5)/columns-.5, (i//columns+.5)/rows-.5) for i in range(count)]
            scale = .96/columns
        pixels = empty_patch()
        for i, center in enumerate(centers):
            angle = (i - (count-1)/2) * .13
            c, s = np.cos(angle), np.sin(angle)
            basis = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
            source = {'center': np.array([*center, i*.001]), 'basis': basis,
                      'size': np.full(2, scale), 'tile': 45+i%3}
            stamp(pixels, source, target, images)
        output.append(pixels)
    return output


def clustered_exterior(old, centers, count, groups):
    points = np.array([p['center'] for p in old])
    crown = np.mean(centers, axis=0)
    distance = np.full(len(points), np.inf)
    radial = np.linalg.norm(points - crown, axis=1)
    seeds, selected = [], int(np.argmax(radial))
    for _ in range(count):
        seeds.append(selected)
        distance = np.minimum(distance, np.sum((points-points[selected])**2, axis=1))
        distance[seeds] = -1
        selected = int(np.argmax(distance * (.8 + .2 * radial/max(radial.max(), 1e-5))))
    positions = points[seeds].copy()
    for _ in range(3):
        labels = np.argmin(np.sum((points[:, None]-positions[None])**2, axis=2), axis=1)
        positions = np.array([points[labels == i].mean(axis=0) if np.any(labels == i) else points[seed] for i, seed in enumerate(seeds)])
    result = []
    for index, seed in enumerate(seeds):
        ids = np.flatnonzero(labels == index)
        if not len(ids): ids = np.array([seed])
        anchor = old[seed]
        normal = anchor['basis'][:, 2].copy()
        normals = np.array([old[i]['basis'][:, 2] for i in ids])
        normals[normals @ normal < 0] *= -1
        normal = .55*normal + .45*normals.mean(axis=0); normal /= np.linalg.norm(normal)
        y = anchor['basis'][:, 1] - normal * (anchor['basis'][:, 1] @ normal); y /= np.linalg.norm(y)
        basis = np.column_stack([np.cross(y, normal), y, normal])
        # Sparse silhouette tips must not inherit the area of distant cards in their Voronoi cell.
        local = ids[np.linalg.norm(points[ids]-points[seed], axis=1) <= max(anchor['size'])*2.2]
        local_count = max(1, len(local))
        group_index = int(np.argmin(np.abs(np.array(groups)-local_count)))
        group = groups[group_index]
        size = np.mean([old[i]['size'] for i in ids], axis=0) * np.sqrt(group)
        center = points[seed]*.65 + (points[local].mean(axis=0) if len(local) else points[seed])*.35
        result.append({'kind': 'outer', 'center': center,
                       'basis': basis, 'size': size, 'tile': 45+group_index, 'sourceCards': ids.tolist()})
    return result


def build_canopies(options, species, models):
    source = Path(options['source']) / species
    directory = Path(options['output']) / species / 'canopy'; directory.mkdir(parents=True, exist_ok=True)
    images = read_images(source / 'canopy')
    ratios = []
    for model in models:
        old_stats = json.loads((Path(options['source'])/model/'model.json').read_text())
        wood = json.loads((Path(options['output'])/model/'wood.json').read_text())['woodTriangles']
        leaf_budget = (int((old_stats['woodTriangles']+old_stats['canopyTriangles'])*.4)-wood)//2*2
        ratios.append((old_stats['canopyTriangles']-30)/(leaf_budget-30))
    groups = [1, 2, 3] if max(ratios) <= 3.5 else [1, 3, 6] if max(ratios) <= 6.5 else [1, 4, 9]
    output = {channel: np.zeros((TILE*6, TILE*8, 4), np.float32) for channel in CHANNELS}
    output['normal'][:, :, :3] = [.5, .5, 1]; output['orm'][:, :, :3] = [1, .65, 0]
    tiles = []
    for i, pixels in enumerate(patch_tiles(images, groups)):
        tile = 45+i; x, y = tile % 8*TILE, tile//8*TILE
        for channel in CHANNELS: output[channel][y:y+TILE, x:x+TILE] = pixels[channel]
        tiles.append({'tile': tile, 'kind': 'outer', 'sourceCards': groups[i], 'leavesPerPatch': groups[i]*6})
    for model in models:
        variant = model.split('/')[1]
        previous = json.loads((source / variant / 'layout.json').read_text())
        old = arrays(previous['planes'])
        core = copy.deepcopy(old[:15]); outer = old[15:]
        centers = np.array([row['center'] for row in previous['centers']])
        points = np.array([p['center'] for p in outer])
        labels = np.argmin(np.sum((points[:, None]-centers[None])**2, axis=2), axis=1)
        for target in core:
            pixels = empty_patch()
            stamp(pixels, old[target['tile'] % 15], target, images)
            before = float(np.mean(pixels['color'][:, :, 3] >= .5))
            goal = min(.55, before + .07)
            ids = np.flatnonzero(labels == target['cluster'])
            ids = sorted(ids, key=lambda i: np.linalg.norm((points[i]-target['center']) / max(target['size'])))
            for index in ids:
                if abs(outer[index]['basis'][:, 2] @ target['basis'][:, 2]) < .18: continue
                stamp(pixels, outer[index], target, images)
                if np.mean(pixels['color'][:, :, 3] >= .5) >= goal: break
            tile = target['tile']; x, y = tile % 8*TILE, tile//8*TILE
            for channel in CHANNELS: output[channel][y:y+TILE, x:x+TILE] = pixels[channel]
            tiles.append({'tile': tile, 'kind': 'core', 'model': model, 'beforeCoverage': before,
                          'afterCoverage': float(np.mean(pixels['color'][:, :, 3] >= .5))})
        old_stats = json.loads((source/variant/'model.json').read_text())
        wood = json.loads((Path(options['output'])/model/'wood.json').read_text())['woodTriangles']
        leaf_budget = (int((old_stats['woodTriangles']+old_stats['canopyTriangles'])*.4)-wood)//2*2
        exterior = clustered_exterior(outer, centers, leaf_budget//2-15, groups)
        layout = {'centers': previous['centers'], 'planes': core+exterior, 'corePlanes': 15,
                  'outerPlanes': len(exterior), 'doubleSided': True, 'foliageTriangles': leaf_budget,
                  'sourceFoliageTriangles': len(old)*2}
        for plane in layout['planes']:
            for key in ['center', 'basis', 'size']: plane[key] = plane[key].tolist()
        write_json(Path(options['output']) / model / 'layout.json', layout)
        print(f'[LOD1] Reorganized {model}: {len(old)} -> {leaf_budget//2} cards', flush=True)
    for channel in CHANNELS:
        output[channel] = bleed(output[channel], output['color'][:, :, 3] >= .98, 5)
    vectors = output['normal'][:, :, :3]*2-1
    for _ in range(2 if groups[-1] > 3 else 1):
        vectors = .5*vectors + .125*sum(np.roll(vectors, shift, axis=axis) for axis in [0, 1] for shift in [-1, 1])
    vectors /= np.maximum(np.linalg.norm(vectors, axis=2, keepdims=True), 1e-8)
    output['normal'][:, :, :3] = vectors*.5+.5
    for channel in CHANNELS: write_pixels('leaf_'+channel, output[channel], directory/f'leaf_{channel}.png', channel == 'color')
    mips = mip_chain(directory, *[output[channel].copy() for channel in CHANNELS])
    write_json(directory/'atlas.json', {'species': species, 'lodLevel': 1, 'size': [TILE*8, TILE*6], 'grid': [8, 6], 'tiles': tiles,
               'mips': mips, 'lightingBaked': False, 'source': str(source/'canopy'), 'normalSpace': 'Tangent/OpenGL +Y',
               'method': 'Reprojected crown cores and adaptive compact leaf patches; exact LOD0 photographic PBR pixels'})
