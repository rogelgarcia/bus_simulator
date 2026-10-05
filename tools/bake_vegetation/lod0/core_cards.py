# Export actual single-surface double-sided core and exterior planes with the reduced wood.
import json
from pathlib import Path

import bpy
import numpy as np

from canopy import normalize_glb
from common import activate, clear_scene, triangles, write_json
from wood import pbr_material


def mesh_for(model, kind, planes, material):
    vertices, faces, uvs = [], [], []
    for plane in planes:
        if plane['kind'] != kind: continue
        width, height = plane['size']; tile = plane['tile']
        points = np.array([[-width/2, -height/2, 0], [width/2, -height/2, 0], [width/2, height/2, 0], [-width/2, height/2, 0]])
        points = points @ np.array(plane['basis']).T + plane['center']
        start = len(vertices); vertices.extend(points.tolist())
        faces.extend([(start, start+1, start+2), (start, start+2, start+3)])
        u0, v0, u1, v1 = tile % 8/8, tile//8/6, (tile%8+1)/8, (tile//8+1)/6
        uvs.extend([(u0,v0),(u1,v0),(u1,v1),(u0,v0),(u1,v1),(u0,v1)])
    mesh = bpy.data.meshes.new(model + ' / ' + kind + ' planes')
    mesh.from_pydata(vertices, [], faces)
    mesh.uv_layers.new(name='Core and separated leaf atlas').data.foreach_set('uv', np.asarray(uvs, np.float32).ravel())
    mesh.materials.append(material)
    obj = bpy.data.objects.new(model + ' / LOD0 ' + kind, mesh); bpy.context.scene.collection.objects.link(obj)
    obj['lodLevel'] = 0; obj['referenceModel'] = model; obj['variant'] = model.split('/')[1]
    obj['surface'] = 'foliage'; obj['canopyRole'] = kind
    return obj


def build(options):
    inspection = json.loads((Path(options['output'])/'inspection.json').read_text())
    for model in options['models']:
        clear_scene()
        species, variant = model.split('/'); directory = Path(options['output'])/model
        layout = json.loads((directory/'layout.json').read_text())
        images = {}
        for channel in ['color', 'normal', 'orm']:
            image = bpy.data.images.load(str(directory.parent/'canopy'/f'leaf_{channel}.png'), check_existing=True)
            image.colorspace_settings.name = 'sRGB' if channel == 'color' else 'Non-Color'
            images[channel] = image
        material = pbr_material(species+' / LOD0 spray cards', images, True)
        material.use_backface_culling = False
        core, outer = [mesh_for(model, kind, layout['planes'], material) for kind in ['core', 'outer']]
        with bpy.data.libraries.load(str(directory/'wood.blend'), link=False) as (available, loaded):
            loaded.objects = [model+' / LOD0 wood']
        wood = loaded.objects[0]; bpy.context.scene.collection.objects.link(wood)
        activate(wood, [core, outer])
        glb = directory/(variant+'_lod0.glb')
        bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
            export_extras=True, export_yup=True, export_texcoords=True, export_normals=True, export_tangents=True,
            export_materials='EXPORT', export_animations=False, export_cameras=False, export_lights=False)
        repairs = normalize_glb(glb, True)
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=str(directory/(variant+'_lod0.blend')), compress=True)
        wood_stats = json.loads((directory/'wood.json').read_text())
        atlas = json.loads((directory.parent/'canopy/atlas.json').read_text())
        previous = json.loads((Path(options['baseline'])/model/'model.json').read_text())
        reference = next(row for row in inspection if row['id'] == model)
        wood_count = triangles(wood.data); core_count = triangles(core.data); outer_count = triangles(outer.data)
        write_json(directory/'model.json', {'id': model, 'position': json.loads((directory/'placement.json').read_text())['position'],
            'placement': 'core', 'woodTriangles': wood_count, 'canopyTriangles': core_count+outer_count,
            'coreTriangles': core_count, 'outerTriangles': outer_count, 'totalTriangles': wood_count+core_count+outer_count,
            'previousWoodTriangles': previous['woodTriangles'], 'previousCanopyTriangles': previous['canopyTriangles'],
            'referenceWoodTriangles': reference['woodTriangles'], 'referenceFoliageTriangles': reference['foliageTriangles'],
            'coreCenters': 5, 'corePlanes': 15, 'outerPlanes': len(layout['planes'])-15, 'cards': len(layout['planes']),
            'sides': 'Single flat surfaces; glTF doubleSided=true, two triangles per plane including both visible sides',
            'geometryError': wood_stats['geometryError'], 'meanCardCoverage': atlas['meanDrawnRectangleCoverage'],
            'files': [glb.name, variant+'_lod0.blend'], 'glbBytes': glb.stat().st_size,
            'materialDrawsPerModel': 3, 'zeroTangentFallbacks': repairs, 'wind': 'Not yet rigged',
            'limitations': ['Large interior plates lose local depth and share front/back tissue color. Exterior cards retain six separate leaves per plane.',
                'Fine spray twigs are omitted; leaf petioles remain in the baked silhouettes.',
                'Full leaf response needs KHR_materials_diffuse_transmission. Gameplay timing and wind remain unmeasured.']})
        print(f'[LOD0] Core export {model}: {wood_count} wood + {core_count} core + {outer_count} outer triangles', flush=True)
