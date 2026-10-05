# Orthographic Cycles material captures of real solid reference sprays, including both sides.
import math
import struct
import zlib
from pathlib import Path

import bpy
import numpy as np

from common import clear_scene, configure, load_reference, write_json
from sprays import spray_data, PATCHES

SAMPLES = 8
COLS, ROWS = 8, 6
FILL = .90


def bleed(pixels, mask, iterations=10):
    result = pixels.copy()
    known = mask.copy()
    for _ in range(iterations):
        total = np.zeros_like(result[:, :, :3])
        count = np.zeros_like(known, dtype=np.float32)
        for axis, shift in [(0, -1), (0, 1), (1, -1), (1, 1)]:
            neighbor = np.roll(known, shift, axis=axis)
            values = np.roll(result[:, :, :3], shift, axis=axis)
            if axis == 0: neighbor[0 if shift == 1 else -1, :] = False
            else: neighbor[:, 0 if shift == 1 else -1] = False
            total += values * neighbor[:, :, None]
            count += neighbor
        fill = ~known & (count > 0)
        result[fill, :3] = total[fill] / count[fill, None]
        known |= fill
    return result


def write_pixels(name, pixels, path, color=False):
    height, width = pixels.shape[:2]
    values = pixels.copy()
    if color:
        rgb = np.maximum(values[:, :, :3], 0)
        values[:, :, :3] = np.where(rgb <= .0031308, rgb * 12.92, 1.055 * rgb ** (1 / 2.4) - .055)
    channels = 4 if color else 3
    encoded = np.rint(np.clip(values[::-1, :, :channels], 0, 1) * 255).astype(np.uint8)
    # Explicit PNG encoding avoids applying Blender float-image color/alpha transforms twice.
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff)
    rows = b''.join(b'\x00' + row.tobytes() for row in encoded)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6 if color else 2, 0, 0, 0))
                     + chunk(b'IDAT', zlib.compress(rows, 6)) + chunk(b'IEND', b''))
    image = bpy.data.images.load(str(path), check_existing=False)
    image.name = name
    image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    return image


def capture_pass(scene, materials, channel, directory):
    for material in materials:
        nodes, links = material.node_tree.nodes, material.node_tree.links
        bsdf = nodes.get('Principled BSDF')
        emission = nodes.new('ShaderNodeEmission')
        if channel in ['color', 'roughness']:
            source = bsdf.inputs['Base Color' if channel == 'color' else 'Roughness']
            if source.is_linked: links.new(source.links[0].from_socket, emission.inputs['Color'])
            else:
                value = source.default_value
                emission.inputs['Color'].default_value = value if channel == 'color' else (value, value, value, 1)
        else:
            source = bsdf.inputs['Normal']
            normal = source.links[0].from_socket if source.is_linked else nodes.new('ShaderNodeNewGeometry').outputs['Normal']
            encode = nodes.new('ShaderNodeVectorMath'); encode.operation = 'MULTIPLY_ADD'
            links.new(normal, encode.inputs[0]); encode.inputs[1].default_value = (.5, .5, .5); encode.inputs[2].default_value = (.5, .5, .5)
            links.new(encode.outputs[0], emission.inputs['Color'])
        links.new(emission.outputs[0], nodes.get('Material Output').inputs['Surface'])
    scene.render.filepath = str(directory / ('capture_' + channel + '.exr'))
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(scene.render.filepath, check_existing=False)
    pixels = np.array(image.pixels[:], np.float32).reshape((scene.render.resolution_y, scene.render.resolution_x, 4))
    bpy.data.images.remove(image)
    return pixels


def mip_chain(directory, color, normal, orm):
    targets = np.array([[float(np.mean(color[y*256:(y+1)*256, x*256:(x+1)*256, 3] >= .5))
                         for x in range(COLS)] for y in range(ROWS)]) if color.shape[1] == COLS * 256 else None
    if targets is None:
        tile = color.shape[1] // COLS
        targets = np.array([[float(np.mean(color[y*tile:(y+1)*tile, x*tile:(x+1)*tile, 3] >= .5)) for x in range(COLS)] for y in range(ROWS)])
    records = []
    for level in range(1, 6):
        h, w = color.shape[:2]
        def down(value): return value.reshape(h//2, 2, w//2, 2, -1).mean(axis=(1, 3))
        alpha = color[:, :, 3:4]
        new_alpha = down(alpha)
        filtered = []
        for value in [color, normal, orm]:
            rgb = down(value[:, :, :3] * alpha) / np.maximum(new_alpha, 1e-8)
            filtered.append(np.concatenate([rgb, new_alpha.copy()], axis=2))
        color, normal, orm = filtered
        errors = []
        tile = color.shape[1] // COLS
        for row in range(ROWS):
            for column in range(COLS):
                patch = color[row*tile:(row+1)*tile, column*tile:(column+1)*tile, 3]
                target = targets[row, column]
                low, high = 0.0, 8.0
                best, error = 1.0, abs(float(np.mean(patch >= .5)) - target)
                for _ in range(18):
                    middle = (low + high) / 2
                    coverage = float(np.mean(patch * middle >= .5))
                    if abs(coverage - target) < error: best, error = middle, abs(coverage - target)
                    if coverage < target: low = middle
                    else: high = middle
                patch[:] = np.clip(patch * best, 0, 1)
                errors.append(error)
        interior = color[:, :, 3] > .9
        color = bleed(color, interior, 4)
        normal = bleed(normal, interior, 4)
        vector = normal[:, :, :3] * 2 - 1
        vector /= np.maximum(np.linalg.norm(vector, axis=2, keepdims=True), 1e-8)
        normal[:, :, :3] = vector * .5 + .5
        for channel, value in [('color', color), ('normal', normal), ('orm', orm)]:
            write_pixels(f'leaf {channel} mip {level}', value, directory / f'leaf_{channel}_mip{level}.png', channel == 'color')
        records.append({'level': level, 'size': [color.shape[1], color.shape[0]], 'maxTileCoverageError': float(max(errors)),
                        'meanTileCoverageError': float(np.mean(errors))})
    return records


def build_atlases(options):
    for species in dict.fromkeys(model.split('/')[0] for model in options['models']):
        clear_scene()
        model = species + '/mature_01'
        foliage = load_reference(options, [model + ' / solid leaves'])[0]
        data, prototypes, wings = spray_data(options, model, foliage)
        directory = Path(options['output']) / species / 'canopy'
        directory.mkdir(parents=True, exist_ok=True)
        spray_count = len(wings) // PATCHES
        # Stratification reuses actual, independently varied sprays throughout the reference crown.
        selected = np.linspace(17, spray_count - 19, SAMPLES, dtype=np.int32)
        vertices, faces, uvs, material_ids, records = [], [], [], [], []
        offset = 0
        material = prototypes[0]['material'].copy()
        for sample, spray in enumerate(selected):
            for side in range(PATCHES):
                wing = wings[int(spray) * PATCHES + side]
                basis, center = wing['basis'], wing['center']
                extent = float(max(wing['size']))
                for back in range(2):
                    tile = sample * PATCHES * 2 + side * 2 + back
                    column, row = tile % COLS, tile // COLS
                    flip = np.array([-1, 1, -1] if back else [1, 1, 1])
                    for index in wing['ids']:
                        template = prototypes[data['forms'][index]]
                        transform = data['matrices'][index] * data['scales'][index]
                        points = (template['points'] @ transform.T + data['origins'][index] - center) @ basis
                        points = points * flip * (FILL / extent) + [column + .5, row + .5, 0]
                        vertices.append(points); faces.append(template['faces'] + offset)
                        uvs.append(template['uv']); material_ids.extend([0] * len(template['faces']))
                        offset += len(points)
                    width, height = wing['size'] * (FILL / extent)
                    records.append({'sample': sample, 'sourceSpray': int(spray), 'side': side, 'back': bool(back),
                                    'tile': tile, 'rect': [float(v) for v in [(column + .5 - width / 2) / COLS, (row + .5 - height / 2) / ROWS,
                                                          (column + .5 + width / 2) / COLS, (row + .5 + height / 2) / ROWS]],
                                    'sourceSizeMetres': wing['size'].tolist(), 'sourceDepthMetres': wing['depth'], 'leafCount': len(wing['ids'])})
        mesh = bpy.data.meshes.new(species + ' / reference spray atlas')
        mesh.from_pydata(np.concatenate(vertices).tolist(), [], np.concatenate(faces).tolist())
        mesh.uv_layers.new(name='Photographic source UV').data.foreach_set('uv', np.concatenate(uvs).ravel())
        mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))
        mesh.materials.append(material)
        source = bpy.data.objects.new(species + ' / source solid sprays', mesh)
        bpy.context.scene.collection.objects.link(source)
        bpy.data.objects.remove(foliage, do_unlink=True)
        scene = configure(options)
        scene.cycles.samples = 16
        scene.cycles.use_denoising = False
        scene.cycles.use_adaptive_sampling = False
        scene.render.film_transparent = True
        scene.render.resolution_x = COLS * options['tile-size']
        scene.render.resolution_y = ROWS * options['tile-size']
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = 'OPEN_EXR'
        scene.render.image_settings.color_mode = 'RGBA'
        scene.render.image_settings.color_depth = '32'
        camera_data = bpy.data.cameras.new('Atlas orthographic camera')
        camera = bpy.data.objects.new('Atlas orthographic camera', camera_data)
        scene.collection.objects.link(camera)
        camera.location = (COLS / 2, ROWS / 2, 6)
        camera_data.type = 'ORTHO'; camera_data.ortho_scale = COLS
        camera_data.clip_start = .1; camera_data.clip_end = 20
        scene.camera = camera
        results = {channel: capture_pass(scene, [material], channel, directory) for channel in ['color', 'normal', 'roughness']}
        mask = results['color'][:, :, 3] >= .5
        # EXR stores associated alpha. Image pixels are straight RGBA in Blender's image API.
        interior = results['color'][:, :, 3] >= .98
        color = bleed(results['color'], interior)
        normal = bleed(results['normal'], interior)
        vectors = normal[:, :, :3] * 2 - 1
        lengths = np.linalg.norm(vectors, axis=2)
        vectors /= np.maximum(lengths[:, :, None], 1e-8)
        normal[:, :, :3] = vectors * .5 + .5
        normal[~(lengths > 0), :3] = [.5, .5, 1]
        normal[:, :, 3] = 1
        rough = bleed(results['roughness'], interior)
        orm = np.ones_like(rough); orm[:, :, 1] = rough[:, :, 0]; orm[:, :, 2] = 0
        write_pixels(species + ' / spray albedo', color, directory / 'leaf_color.png', True)
        write_pixels(species + ' / spray normal', normal, directory / 'leaf_normal.png')
        write_pixels(species + ' / spray ORM', orm, directory / 'leaf_orm.png')
        mips = mip_chain(directory, color.copy(), normal.copy(), orm.copy())
        occupancies = []
        for record in records:
            u0, v0, u1, v1 = record['rect']
            h, w = mask.shape
            crop = mask[round(v0 * h):round(v1 * h), round(u0 * w):round(u1 * w)]
            record['alphaOccupancy'] = float(crop.mean())
            occupancies.append(record['alphaOccupancy'])
        write_json(directory / 'atlas.json', {'species': species, 'sourceModel': model, 'samples': SAMPLES,
                   'grid': [COLS, ROWS], 'size': [scene.render.resolution_x, scene.render.resolution_y],
                   'tiles': records, 'meanDrawnRectangleCoverage': float(np.mean(occupancies)),
                   'normalSpace': 'card tangent / OpenGL +Y', 'lightingBaked': False,
                   'sourceLinearMeanRGB': results['color'][interior, :3].mean(axis=0).tolist(),
                   'mips': mips, 'mipIntegration': 'Explicit coverage-preserving mip images for later engine upload; core GLB stores base level only',
                   'materialChannels': ['RGBA albedo and geometric coverage', 'leaf surface normals including source normal map', 'ORM: neutral AO, baked roughness, zero metal'],
                   'patchesPerSpray': PATCHES, 'placement': options.get('placement', 'direction'),
                   'method': ('Compact spatial leaf clusters with fitted planes' if options.get('placement') == 'spatial' else 'Three leaf-direction patches per reference spray') + '; eight sampled sprays, front and underside captured separately'})
        print(f'[LOD0] Atlas ready {species}: {scene.render.resolution_x}x{scene.render.resolution_y}, card occupancy {np.mean(occupancies):.1%}', flush=True)
