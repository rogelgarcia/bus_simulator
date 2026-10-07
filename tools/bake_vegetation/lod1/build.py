# Builds LOD1 with protected lower trunks, reprojected photographic PBR and regrouped canopy patches.
import json
import shutil
from pathlib import Path

import bpy
import numpy as np

from common import activate, array, clear_scene, triangles, write_json
from wood import geometry_error, pbr_material
from core_cards import mesh_for
from lod1_canopy import build_canopies
from lod1_coverage import measure
from wood_material import bake_material
from wood_quality import reverse_error
from wood_reduce import simplify
from importlib.util import spec_from_file_location, module_from_spec

_spec = spec_from_file_location('lod0_canopy_export', Path(__file__).parent.parent/'lod0/canopy.py')
_export = module_from_spec(_spec); _spec.loader.exec_module(_export)


def reduce_wood(options, model, bake=True):
    source = Path(options['source'])/model
    with bpy.data.libraries.load(str(source/'wood.blend'), link=False) as (available, loaded):
        loaded.objects = [model+' / LOD0 wood']
    high = loaded.objects[0]; bpy.context.scene.collection.objects.link(high)
    low = high.copy(); low.data = high.data.copy(); bpy.context.scene.collection.objects.link(low)
    low.name = model+' / LOD1 wood'; low['lodLevel'] = 1
    budget = int(triangles(high.data)*.4)//2*2
    previous = json.loads((source/'model.json').read_text())
    wood_limit = min(triangles(high.data)-2, int((previous['woodTriangles']+previous['canopyTriangles'])*.4)-32)
    positions = array(low.data.vertices, 'co', 3)
    pinned = set(np.flatnonzero(positions[:, 2] < (0.10 if model.startswith('arrowwood_') else 5.0)).tolist())
    discarded = low.data; low.data = simplify(high, budget, pinned); bpy.data.meshes.remove(discarded)
    error = geometry_error(high, low)
    error['reverse'] = reverse_error(high, low)
    print(f'[LOD1] Wood candidate {model}: {triangles(low.data)} triangles, p99 {error["p99Metres"]:.3f}m / max {error["maxMetres"]:.3f}m / reverse {error["reverse"]["faceMax"]:.3f}m', flush=True)
    if triangles(low.data) > wood_limit or error['nonManifoldEdges'] or error['maxMetres'] > .35 or error['p99Metres'] > .15 or error['reverse']['faceMax'] > .09:
        raise RuntimeError(f'LOD1 wood budget or shape gate failed: {model}: {triangles(low.data)}/{budget}, {error}')
    low.vertex_groups.clear()
    for poly in low.data.polygons: poly.use_smooth = True
    directory = Path(options['output'])/model; directory.mkdir(parents=True, exist_ok=True)
    if bake and model in options['models']: bake_material(options, model, high, low, error, directory)
    bpy.data.objects.remove(high, do_unlink=True)
    return low, error


def build(options):
    source = Path(options['source']); output = Path(options['output'])
    for species in dict.fromkeys(model.split('/')[0] for model in options['models']):
        models = [species+'/mature_0'+str(i) for i in range(1, 4)]
        for model in models:
            clear_scene(); directory = output/model; directory.mkdir(parents=True, exist_ok=True)
            wood, error = reduce_wood(options, model)
            write_json(directory/'wood.json', {'woodTriangles': triangles(wood.data), 'geometryError': error})
            bpy.data.libraries.write(str(directory/'wood.blend'), {wood}, fake_user=True, compress=True)
        clear_scene()
        build_canopies(options, species, models)
        for model in [m for m in models if m in options['models']]:
            clear_scene(); directory = output/model; directory.mkdir(parents=True, exist_ok=True)
            variant = model.split('/')[1]
            layout = json.loads((directory/'layout.json').read_text())
            images = {}
            for channel in ['color', 'normal', 'orm']:
                image = bpy.data.images.load(str(directory.parent/'canopy'/f'leaf_{channel}.png'), check_existing=True)
                image.colorspace_settings.name = 'sRGB' if channel == 'color' else 'Non-Color'; images[channel] = image
            material = pbr_material(species+' / LOD1 spray cards', images, True); material.use_backface_culling = False
            core, outer = [mesh_for(model, kind, layout['planes'], material) for kind in ['core', 'outer']]
            for obj in [core, outer]: obj.name = obj.name.replace('LOD0', 'LOD1'); obj['lodLevel'] = 1
            with bpy.data.libraries.load(str(directory/'wood.blend'), link=False) as (available, loaded):
                loaded.objects = [model+' / LOD1 wood']
            wood = loaded.objects[0]; bpy.context.scene.collection.objects.link(wood)
            error = json.loads((directory/'wood.json').read_text())['geometryError']
            activate(wood, [core, outer])
            file = directory/(variant+'_lod1.glb')
            bpy.ops.export_scene.gltf(filepath=str(file), export_format='GLB', use_selection=True, export_extras=True,
                export_yup=True, export_texcoords=True, export_normals=True, export_tangents=True,
                export_materials='EXPORT', export_animations=False, export_cameras=False, export_lights=False)
            repaired = _export.normalize_glb(file, True)
            bpy.ops.file.pack_all()
            bpy.ops.wm.save_as_mainfile(filepath=str(directory/(variant+'_lod1.blend')), compress=True)
            previous = json.loads((source/model/'model.json').read_text())
            write_json(directory/'model.json', {'id': model, 'lodLevel': 1, 'position': previous['position'],
                'woodTriangles': triangles(wood.data), 'canopyTriangles': triangles(core.data)+triangles(outer.data),
                'totalTriangles': triangles(wood.data)+triangles(core.data)+triangles(outer.data),
                'lod0WoodTriangles': previous['woodTriangles'], 'lod0LeafTriangles': previous['canopyTriangles'],
                'coreTriangles': triangles(core.data), 'outerTriangles': triangles(outer.data), 'geometryError': error,
                'zeroTangentFallbacks': repaired, 'files': [file.name, variant+'_lod1.blend'], 'glbBytes': file.stat().st_size,
                'materialDrawsPerModel': 3, 'woodMaterial': 'LOD0 photographic bark reprojected into fresh LOD1 UV charts and tangent normals',
                'canopyMethod': 'Projected inner masses, clustered exterior patches; fixed double-sided planes',
                'limitations': ['Reduced card parallax and unchanged same-color back faces', 'Wood textures are projected from accepted LOD0 PBR, not directly from the high reference']})
            measure(options, model)
            print(f'[LOD1] Exported {model}: {triangles(wood.data)} wood / {triangles(core.data)+triangles(outer.data)} leaves', flush=True)
    for name in ['reference-sources.json', 'reference-material-approximations.json']:
        shutil.copy2(source/name, output/name)
