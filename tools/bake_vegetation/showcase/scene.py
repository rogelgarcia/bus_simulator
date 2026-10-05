# Builds a single editable arboretum scene; camera views isolate each original family.
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'authoring'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from instancing import add_family
from environment import add_ground, setup_sky
from closeups import add_closeups
from bark_appearance import REVISION

FAMILIES = [('london_plane', (-34, 34)), ('silver_linden', (34, 34)),
            ('northern_red_oak', (-34, -12)), ('american_elm', (34, -12)),
            ('arrowwood_viburnum', (0, -49))]


def camera(scene, name, position, target, lens=50, fit_box=None):
    data = bpy.data.cameras.new(name); data.lens = lens
    data.clip_end = 4000
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    if fit_box:
        for attempt in range(20):
            bpy.context.view_layer.update()
            points = [world_to_camera_view(scene, obj, Vector(point)) for point in fit_box]
            if all(.06 <= point.x <= .94 and .06 <= point.y <= .94 and point.z > 0 for point in points):
                break
            obj.location = Vector(target) + (obj.location - Vector(target)) * 1.08
        else:
            raise RuntimeError(f'Cannot fit the complete source bounds into camera {name}')
    marker = scene.timeline_markers.new(name, frame=len(scene.timeline_markers) + 1); marker.camera = obj
    return {'id': name, 'position': list(obj.location), 'target': list(target), 'lens': lens,
            'completeBoundsFit': bool(fit_box)}


def main(root, output, family_builder=None, detail_builder=None, surface_revision=None):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.name = 'Mature tree arboretum / five separated species plots'
    scene.render.engine = 'CYCLES'
    scene.unit_settings.system = 'METRIC'
    scene.render.resolution_x, scene.render.resolution_y = 2560, 1440
    scene.render.resolution_percentage = 100
    scene.render.threads_mode = 'FIXED'; scene.render.threads = 4
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = .3
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8; scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 4; scene.cycles.transmission_bounces = 6
    scene.cycles.use_adaptive_sampling = True; scene.cycles.adaptive_threshold = .015
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.film_transparent = False
    lighting = setup_sky(root, scene)
    add_ground(root, scene)
    inventory, views, plots = [], [], []
    for folder, center in FAMILIES:
        collection = bpy.data.collections.new(folder)
        scene.collection.children.link(collection)
        recipe, manifest, records = (family_builder or add_family)(root, folder, collection, center)
        inventory.extend(records)
        height = max(row['bounds']['max'][1] for row in manifest['variants'])
        shrub = recipe['kind'] == 'shrub'
        width = 20 if shrub else 56
        distance = width * 1.72
        x, y = center
        views.append({**camera(scene, folder + '_three_mature', (x, y - distance, height * .59), (x, y, height * .47), 52), 'species': folder})
        # The hero camera is fitted to the full near-side canopy as well as the root base.
        spacing = 6 if shrub else 19
        hero_x = x - spacing
        distance = height * 2.7
        bounds = manifest['variants'][0]['bounds']
        box = [(hero_x + xx, y - yy, zz - .025) for xx in [bounds['min'][0], bounds['max'][0]]
               for yy in [bounds['min'][2], bounds['max'][2]] for zz in [bounds['min'][1], bounds['max'][1]]]
        target = (hero_x + (bounds['min'][0] + bounds['max'][0]) / 2,
                  y - (bounds['min'][2] + bounds['max'][2]) / 2, height * .49)
        views.append({**camera(scene, folder + '_three_quarter', (hero_x - distance * .42, y - distance, height * .52), target, 43, box),
                      'species': folder, 'variant': 'mature_01'})
        views.extend(add_closeups(scene, folder, recipe, camera))
        plots.append({'species': folder, 'center': list(center), 'width': width, 'depth': 28 if not shrub else 12,
                      'commonName': recipe['commonName'], 'botanicalName': recipe['species']})
    views.insert(0, {**camera(scene, 'all_species_overview', (126, -179, 119), (0, 0, 5), 48), 'species': 'all'})
    # Labels sit flush with each plot's front edge, readable in the overview.
    label_mat = bpy.data.materials.new('Plot labels / pale limestone'); label_mat.diffuse_color = (.72, .66, .53, 1)
    for plot in plots:
        curve = bpy.data.curves.new(plot['commonName'], 'FONT'); curve.body = plot['commonName'].upper()
        curve.align_x = 'CENTER'; curve.size = 1.5 if plot['species'] != 'arrowwood_viburnum' else .7
        obj = bpy.data.objects.new(plot['commonName'] + ' / ground label', curve)
        scene.collection.children[plot['species']].objects.link(obj)
        obj.location = (plot['center'][0], plot['center'][1] - plot['depth'] / 2 - 2, .012)
        curve.materials.append(label_mat)
    if detail_builder:
        views.extend(detail_builder(scene, camera))
    scene.camera = bpy.data.objects['all_species_overview']
    scene.timeline_markers.clear()
    for frame, view in enumerate(views, 1):
        scene.timeline_markers.new(view['id'], frame=frame).camera = bpy.data.objects[view['id']]
    scene.frame_end = len(views)
    scene['sourceContract'] = 'Original wood geometry with warm brown bark material; exact solid leaf templates, transforms and tints; no alpha plates or decimation.'
    scene['barkAppearance'] = surface_revision or REVISION
    if surface_revision:
        scene['sourceContract'] = 'Photo PBR review revision; clean rebuilt wood, scan relief, solid photographed leaf shells, retained canopy anchors. Production assets unchanged.'
    scene['views'] = json.dumps(views)
    scene['plots'] = json.dumps(plots)
    bpy.ops.file.pack_all()
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'mature_tree_arboretum.blend'), compress=True)
    manifest = {'schema': 'vegetation-cycles-showcase-v3' if surface_revision else 'vegetation-cycles-showcase-v2', 'engine': 'CYCLES', 'inventory': inventory, 'barkAppearance': surface_revision or REVISION,
                'plots': plots, 'views': views, 'lighting': lighting, 'ground': 'pbr.brown_mud',
                'groundTileMetres': 1.3, 'units': 'metres', 'axis': 'Z-up', 'scene': 'mature_tree_arboretum.blend'}
    (output / 'scene.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'[Showcase] Saved all {len(inventory)} mature models and {len(views)} cameras', flush=True)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:]
    main(Path(args[0]), Path(args[1]))
