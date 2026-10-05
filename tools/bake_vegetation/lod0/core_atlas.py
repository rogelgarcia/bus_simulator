# Bake overlapping crown interiors and separated individual-leaf exterior tiles from reference PBR.
import json
from pathlib import Path

import bpy
import numpy as np

from atlas import bleed, capture_pass, mip_chain, write_pixels
from common import clear_scene, configure, load_reference, write_json
from core_layout import layout, save_layout
from coverage import choose_tiles
from sprays import spray_data

TILE = 512
COLS, ROWS = 8, 6


def outer_tiles(options, prototypes, directory):
    sizes = np.array([np.ptp(p['points'], axis=0) for p in prototypes[:8]])
    physical_size = sizes[:, :2].max(axis=0) * [2.65, 3.65]
    vertices, faces, uvs = [], [], []
    offset = 0
    rng = np.random.default_rng(591)
    for tile in range(3):
        for cell in range(6):
            template = prototypes[(tile * 3 + cell) % 8]
            points = template['points'].copy()
            points -= (points.max(axis=0) + points.min(axis=0)) * .5
            angle = rng.uniform(-.45, .45) + (np.pi if (cell + tile) % 3 == 0 else 0)
            c, s = np.cos(angle), np.sin(angle)
            points = points @ np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])
            points[:, :2] /= physical_size
            span = np.ptp(points[:, :2], axis=0)
            points[:, :2] *= min(1., .43/span[0], .28/span[1])
            points[:, 2] /= max(physical_size)
            points += [tile + .25 + (cell % 2) * .5, 1/6 + (cell // 2)/3, 0]
            vertices.append(points); faces.append(template['faces'] + offset); uvs.append(template['uv'])
            offset += len(points)
    mesh = bpy.data.meshes.new('Separated six-leaf reference tiles')
    mesh.from_pydata(np.concatenate(vertices).tolist(), [], np.concatenate(faces).tolist())
    mesh.uv_layers.new().data.foreach_set('uv', np.concatenate(uvs).ravel())
    mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))
    material = prototypes[0]['material'].copy(); mesh.materials.append(material)
    obj = bpy.data.objects.new('Separated individual leaves', mesh); bpy.context.scene.collection.objects.link(obj)
    scene = configure(options)
    scene.cycles.samples = 16; scene.cycles.use_adaptive_sampling = False
    scene.render.film_transparent = True
    scene.render.resolution_x = TILE * 3; scene.render.resolution_y = TILE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'OPEN_EXR'; scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '32'
    camera = bpy.data.objects.new('Leaf orthographic capture', bpy.data.cameras.new('Leaf orthographic capture'))
    scene.collection.objects.link(camera); camera.location = (1.5, .5, 4)
    camera.data.type = 'ORTHO'; camera.data.ortho_scale = 3
    scene.camera = camera
    values = {channel: capture_pass(scene, [material], channel, directory) for channel in ['color', 'normal', 'roughness']}
    orm = np.ones_like(values['color']); orm[:, :, 1] = values['roughness'][:, :, 0]; orm[:, :, 2] = 0
    values['orm'] = orm
    bpy.data.objects.remove(obj, do_unlink=True)
    return values, physical_size


def read_images(directory):
    result = {}
    for channel in ['color', 'normal', 'orm']:
        image = bpy.data.images.load(str(directory / f'leaf_{channel}.png'), check_existing=False)
        image.colorspace_settings.name = 'sRGB' if channel == 'color' else 'Non-Color'
        values = np.empty(image.size[0] * image.size[1] * 4, np.float32)
        image.pixels.foreach_get(values)
        result[channel] = values.reshape((image.size[1], image.size[0], 4))
        if channel == 'color':
            rgb = result[channel][:, :, :3]
            result[channel][:, :, :3] = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
        bpy.data.images.remove(image)
    return result


def project_core(plane, wings, records, images):
    pixels = {channel: np.zeros((TILE, TILE, 4), np.float32) for channel in images}
    pixels['normal'][:, :, :3] = [.5, .5, 1]
    pixels['orm'][:, :, :3] = [1, .65, 0]
    basis, size, origin = plane['basis'], plane['size'], plane['center']
    candidates = np.random.default_rng(591 + plane['tile']).permutation(plane['ids'])
    selected, projected_area = [], 0.0
    for index in candidates:
        wing = wings[index]
        facing = abs(float(np.dot(wing['basis'][:, 2], basis[:, 2])))
        record = records[(wing['tileSample'], wing['tileSide'], 0)]
        projected_area += float(np.prod(wing['size']) * facing * record['alphaOccupancy'] / np.prod(size))
        selected.append(index)
        if projected_area >= .42: break
    ordered = sorted(selected, key=lambda i: np.dot(wings[i]['center'], basis[:, 2]))
    for index in ordered:
        wing = wings[index]
        back = np.dot(wing['basis'][:, 2], basis[:, 2]) < 0
        source_basis = wing['basis'] * ([-1, 1, -1] if back else [1, 1, 1])
        axes = (source_basis[:, :2] * wing['size']).T @ basis[:, :2] / size * (TILE - 8)
        if abs(np.linalg.det(axes)) < .02: continue
        center = (wing['center'] - origin) @ basis[:, :2] / size * (TILE - 8) + TILE / 2
        corners = np.array([[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]]) @ axes + center
        low = np.maximum(np.floor(corners.min(axis=0)).astype(int), 4)
        high = np.minimum(np.ceil(corners.max(axis=0)).astype(int), TILE - 5)
        if np.any(high < low): continue
        yy, xx = np.mgrid[low[1]:high[1]+1, low[0]:high[0]+1]
        uv = (np.column_stack([xx.ravel() + .5, yy.ravel() + .5]) - center) @ np.linalg.inv(axes) + .5
        inside = np.all((uv >= 0) & (uv <= 1), axis=1)
        uv = uv[inside]; x, y = xx.ravel()[inside], yy.ravel()[inside]
        record = records[(wing['tileSample'], wing['tileSide'], int(back))]
        u0, v0, u1, v1 = record['rect']
        h, w = images['color'].shape[:2]
        source_x = np.clip(((u0 + uv[:, 0]*(u1-u0))*w).astype(int), 0, w-1)
        source_y = np.clip(((v0 + uv[:, 1]*(v1-v0))*h).astype(int), 0, h-1)
        opaque = images['color'][source_y, source_x, 3] >= .5
        x, y, source_x, source_y = x[opaque], y[opaque], source_x[opaque], source_y[opaque]
        for channel in pixels:
            values = images[channel][source_y, source_x].copy()
            if channel == 'normal':
                normal = (values[:, :3]*2-1) @ source_basis.T @ basis
                normal[:, 2] = np.abs(normal[:, 2])
                values[:, :3] = normal * .5 + .5
            values[:, 3] = 1
            pixels[channel][y, x] = values
    return pixels


def build(options):
    for species in dict.fromkeys(model.split('/')[0] for model in options['models']):
        directory = Path(options['output']) / species / 'canopy'; directory.mkdir(parents=True, exist_ok=True)
        old_directory = Path(options['baseline']) / species / 'canopy'
        old_atlas = json.loads((old_directory / 'atlas.json').read_text())
        if old_atlas.get('placement') != 'spatial': raise RuntimeError('Core canopy requires the preserved spatial LOD0 PBR atlas')
        images = read_images(old_directory)
        records = {(r['sample'], r['side'], int(r['back'])): r for r in old_atlas['tiles']}
        output = {channel: np.zeros((ROWS*TILE, COLS*TILE, 4), np.float32) for channel in images}
        output['normal'][:, :, :3] = [.5, .5, 1]; output['orm'][:, :, :3] = [1, .65, 0]
        tiles, outer, template_size = [], None, None
        for variant in ['mature_01', 'mature_02', 'mature_03']:
            clear_scene()
            model = species + '/' + variant
            foliage = load_reference(options, [model + ' / solid leaves'])[0]
            position = list(foliage.location)
            data, prototypes, wings = spray_data({**options, 'placement': 'spatial'}, model, foliage)
            bpy.data.objects.remove(foliage, do_unlink=True)
            choose_tiles(wings, old_atlas, variant, True)
            if outer is None: outer, template_size = outer_tiles(options, prototypes, directory)
            leaf_scale = np.median(data['scales'][data['forms'] < 8], axis=0)[:2]
            physical_size = template_size * leaf_scale
            planes, masses = layout(options, model, wings)
            for plane in planes[:15]:
                pixels = project_core(plane, wings, records, images)
                tile = plane['tile']; x, y = tile % COLS * TILE, tile // COLS * TILE
                for channel in output: output[channel][y:y+TILE, x:x+TILE] = pixels[channel]
                tiles.append({'tile': tile, 'kind': 'core', 'model': model, 'cluster': plane['cluster'], 'axis': plane['axis'],
                              'alphaOccupancy': float(np.mean(pixels['color'][:, :, 3] >= .5))})
            for plane in planes[15:]: plane['size'] = physical_size * plane['scale']
            model_directory = Path(options['output']) / model; model_directory.mkdir(parents=True, exist_ok=True)
            save_layout(model_directory / 'layout.json', planes, masses)
            write_json(model_directory / 'placement.json', {'position': position})
            print(f'[LOD0] Core layout {model}: 15 core / {len(planes)-15} outer planes', flush=True)
        for i in range(3):
            tile = 45+i; x, y = tile % COLS*TILE, tile//COLS*TILE
            for channel in output: output[channel][y:y+TILE, x:x+TILE] = outer[channel][:, i*TILE:(i+1)*TILE]
            tiles.append({'tile': tile, 'kind': 'outer', 'individualLeaves': 6, 'nonOverlappingCells': [2, 3],
                          'alphaOccupancy': float(np.mean(outer['color'][:, i*TILE:(i+1)*TILE, 3] >= .5))})
        interior = output['color'][:, :, 3] >= .98
        alpha = output['color'][:, :, 3:4]
        for _ in range(2):
            weighted = np.zeros_like(output['normal'][:, :, :3]); total = np.zeros_like(alpha)
            for dy, dx, weight in [(0,0,4),(-1,0,2),(1,0,2),(0,-1,2),(0,1,2),(-1,-1,1),(-1,1,1),(1,-1,1),(1,1,1)]:
                mask = np.roll(alpha, (dy, dx), axis=(0,1)) * weight
                weighted += np.roll(output['normal'][:, :, :3], (dy, dx), axis=(0,1)) * mask
                total += mask
            output['normal'][:, :, :3] = np.where(total > 0, weighted / np.maximum(total, 1e-8), [.5,.5,1])
        for channel in output:
            output[channel] = bleed(output[channel], interior, 8)
        vector = output['normal'][:, :, :3]*2-1
        vector /= np.maximum(np.linalg.norm(vector, axis=2, keepdims=True), 1e-8)
        output['normal'][:, :, :3] = vector*.5+.5
        for channel, pixels in output.items(): write_pixels('leaf_'+channel, pixels, directory/f'leaf_{channel}.png', channel == 'color')
        mips = mip_chain(directory, output['color'], output['normal'], output['orm'])
        write_json(directory/'atlas.json', {'species': species, 'placement': 'core', 'size': [COLS*TILE, ROWS*TILE], 'grid': [COLS, ROWS],
                   'tiles': tiles, 'meanDrawnRectangleCoverage': float(np.mean(interior)), 'mips': mips,
                   'lightingBaked': False, 'normalSpace': 'card tangent / OpenGL +Y',
                   'interiorProjectedLeafAreaBudgetFraction': .42,
                   'colorEncoding': 'Source PNG sRGB decoded to linear; captured EXR already linear; final PNG encoded once to sRGB',
                   'normalFilter': 'Two alpha-weighted 3x3 tent passes, then normalization, before UASTC encoding',
                   'source': str(old_directory), 'outerSizeMetres': physical_size.tolist(),
                   'method': 'Five crown partitions per specimen, three orthogonal interior projections each; three non-overlapping six-leaf exterior tiles from solid reference tissue.',
                   'limitations': ['Interior plates flatten reference patch depth. Both sides use the same PBR tile with reversed surface normal; independent underside color is not retained.']})
        print('[LOD0] Core atlas completed ' + species, flush=True)
