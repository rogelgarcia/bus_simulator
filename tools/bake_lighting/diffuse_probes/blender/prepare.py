"""Builds color-independent six-normal receivers in the authenticated static scene."""
import json
import math
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'tools/receiver_lightmaps/blender'))
from bake import open_verified_package, validate_resolved_city_contract, assert_blender_runtime, lighting
from transport import resolve_transport, EnhancedTransportMaterialAdapter
from reconstruct import reconstruct_resolved_city
from directional_coverage import apply_directional_coverage
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

AXES = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]


def to_blender(v):
    return Vector((v[0], -v[2], v[1]))


def oct_direction(x, y):
    v = Vector((x*2-1, y*2-1, 1-abs(x*2-1)-abs(y*2-1)))
    if v.z < 0:
        old_x = v.x
        v.x = (1-abs(v.y)) * (1 if old_x >= 0 else -1)
        v.y = (1-abs(old_x)) * (1 if v.y >= 0 else -1)
    return v.normalized()


def visibility_acceleration(scene, depsgraph, profile):
    """Build once; Scene.ray_cast repeats costly scene-instance traversal for every ray."""
    vertices, triangles = [], []
    regions = []
    for region in profile['regions']:
        low = region['origin']
        high = [low[c] + (region['size'][c]-1)*region['spacing'][c] for c in range(3)]
        a, b, distance = to_blender(low), to_blender(high), profile['maxDistance']
        regions.append(([min(a[c],b[c])-distance for c in range(3)], [max(a[c],b[c])+distance for c in range(3)]))
    for obj in scene.objects:
        if obj.type != 'MESH' or obj.hide_render: continue
        bounds = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        low = [min(v[c] for v in bounds) for c in range(3)]
        high = [max(v[c] for v in bounds) for c in range(3)]
        if not any(all(high[c] >= a[c] and low[c] <= b[c] for c in range(3)) for a,b in regions): continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            offset, matrix = len(vertices), evaluated.matrix_world
            vertices.extend(tuple(matrix @ vertex.co) for vertex in mesh.vertices)
            triangles.extend(tuple(offset + index for index in face.vertices) for face in mesh.loop_triangles)
            if len(vertices) > 4000000 or len(triangles) > 4000000:
                raise ValueError('Visibility geometry exceeds the bounded 4M vertex/triangle budget')
        finally:
            evaluated.to_mesh_clear()
    print(f'AI550 visibility acceleration: {len(vertices)} vertices, {len(triangles)} triangles', flush=True)
    return BVHTree.FromPolygons(vertices, triangles, all_triangles=True)


def main():
    stage = Path(sys.argv[sys.argv.index('--')+1]).resolve()
    job = json.loads((stage/'job.json').read_text())
    signature = assert_blender_runtime(job['archiveSha256'])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    start = time.monotonic()
    profile = job['profile']
    with open_verified_package(stage/'source.bsib', job['packageSha256']) as package:
        validate_resolved_city_contract(package, job['archiveSha256'])
        resolve_transport(package)
        reconstruction = reconstruct_resolved_city(package, stage, 'indirect_irradiance', EnhancedTransportMaterialAdapter)
        apply_directional_coverage(bpy.data.materials)
        lighting(package, stage, 4)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.render.threads_mode = 'FIXED'; scene.render.threads = profile['threads']
    depsgraph = bpy.context.evaluated_depsgraph_get()
    visibility = visibility_acceleration(scene, depsgraph, profile)
    positions, regions = [], []
    for source in profile['regions']:
        region = dict(source, offset=len(positions)); regions.append(region)
        origin, spacing, size = region['origin'], region['spacing'], region['size']
        for z in range(size[2]):
            for y in range(size[1]):
                for x in range(size[0]):
                    positions.append([origin[c] + (x,y,z)[c]*spacing[c] for c in range(3)])
    count, tile = len(positions), profile['tileSize']
    columns = 128
    rows = math.ceil(count*6/columns)
    width, height = columns*tile, rows*tile
    table = np.zeros((count,70,4), dtype='<f4')
    vertices, faces, uvs = [], [], []
    for index, position in enumerate(positions):
        p = to_blender(position)
        backfaces, too_close = 0, False
        for normal in AXES:
            d = to_blender(normal)
            location, hit_normal, _, distance = visibility.ray_cast(p, d, profile['maxDistance'])
            if location is not None:
                backfaces += int(hit_normal.dot(d) > .01)
                too_close = too_close or (location-p).length < .03
        valid = not too_close and backfaces < 4
        for y in range(8):
            for x in range(8):
                d = to_blender(oct_direction((x+.5)/8,(y+.5)/8))
                location, _, _, distance = visibility.ray_cast(p, d, profile['maxDistance'])
                table[index,6+y*8+x,0] = distance if location is not None else profile['maxDistance']
        for direction, normal in enumerate(AXES):
            table[index,direction,3] = int(valid)
            n = to_blender(normal)
            tangent = n.cross(Vector((0,0,1)) if abs(n.z)<.9 else Vector((0,1,0))).normalized()
            bitangent = n.cross(tangent)
            first = len(vertices)
            corners = [(-1,-1),(1,-1),(1,1),(-1,1)]
            for x,y in corners:
                vertices.append(tuple(p + .001*(tangent*x+bitangent*y)))
            faces.append(tuple(range(first,first+4)))
            chart = index*6+direction
            cx, cy = chart % columns, chart // columns
            for x,y in [(0,0),(1,0),(1,1),(0,1)]:
                uvs.append(((cx+x)/columns, (cy+y)/rows))
        if index % 256 == 0: print(f'AI550 visibility {index}/{count}', flush=True)
    mesh = bpy.data.meshes.new('AI550_ProbeTargets')
    mesh.from_pydata(vertices, [], faces); mesh.update()
    uv = mesh.uv_layers.new(name='AI550_Bake')
    for item, value in zip(uv.data, uvs): item.uv = value
    target = bpy.data.objects.new('AI550_ProbeTargets', mesh); scene.collection.objects.link(target)
    # The virtual receivers sample light but cannot cast shadows or feed it back.
    for name in ['visible_camera','visible_diffuse','visible_glossy','visible_transmission','visible_shadow','visible_volume_scatter']:
        setattr(target, name, False)
    # Keep the selected bake target camera-visible in the saved scene. Other
    # ray visibility stays off so virtual receivers never affect transport.
    target.visible_camera = True
    material = bpy.data.materials.new('AI550_UnitDiffuse'); material.use_nodes = True
    nodes = material.node_tree.nodes; nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial'); diffuse = nodes.new('ShaderNodeBsdfDiffuse')
    diffuse.inputs['Color'].default_value = (1,1,1,1)
    material.node_tree.links.new(diffuse.outputs[0], output.inputs['Surface'])
    image = bpy.data.images.new('AI550_Irradiance', width, height, alpha=True, float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    texture = nodes.new('ShaderNodeTexImage'); texture.image = image; nodes.active = texture
    mesh.materials.append(material)
    for obj in bpy.context.selected_objects: obj.select_set(False)
    target.select_set(True); bpy.context.view_layer.objects.active = target
    table.tofile(stage/'visibility.f32')
    descriptor = {'regions': regions, 'count':count, 'width':70, 'depthSize':8, 'maxDistance':profile['maxDistance'],
        'atlas':{'width':width,'height':height,'columns':columns,'rows':rows,'tile':tile},
        'validCount':int(table[:,0,3].sum()), 'signature':signature, 'reconstruction':reconstruction,
        'seconds':time.monotonic()-start}
    (stage/'layout.json').write_text(json.dumps(descriptor))
    # In particular, preserve the sun-separated generated HDR between passes.
    for image in bpy.data.images:
        if image.source == 'GENERATED': image.pack()
    bpy.ops.wm.save_as_mainfile(filepath=str(stage/'probes.blend'))


if __name__ == '__main__': main()
