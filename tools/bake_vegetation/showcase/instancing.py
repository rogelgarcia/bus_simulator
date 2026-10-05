# Reuses authored leaf geometry, exact deterministic transforms and per-leaf color.
import ast
import json
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix

from geometry import create_tree, create_shrub
from leaf_geometry import foliage_instances, bulk_mesh
from bark_appearance import warm_bark


def node_attribute(nodes, links, target, socket, name, kind):
    node = nodes.new('GeometryNodeInputNamedAttribute')
    node.data_type = kind
    node.inputs['Name'].default_value = name
    links.new(node.outputs['Attribute'], target.inputs[socket])


def point_instances(name, instances, templates, material, collection, twig_material=None):
    prototypes = bpy.data.collections.new(name + ' / leaf forms')
    for index, template in enumerate(templates):
        obj, _ = bulk_mesh(f'{name}_form_{index:02}', [(0, np.eye(3), np.zeros(3), np.ones(3))], [template],
                           twig_material if index == 8 and twig_material else material)
        for owner in list(obj.users_collection):
            owner.objects.unlink(obj)
        prototypes.objects.link(obj)
    count = len(instances)
    origins = np.array([row[2] for row in instances], np.float32)
    matrices = np.array([row[1] for row in instances], np.float32)
    scales = np.linalg.norm(matrices, axis=1)
    rotations = matrices / scales[:, None, :]
    if np.max(np.abs(np.linalg.det(rotations) - 1)) > 1e-5:
        raise RuntimeError('Foliage instance transform must be a proper rotation without shear')
    eulers = np.array([tuple(Matrix(row.tolist()).to_euler()) for row in rotations], np.float32)
    mesh = bpy.data.meshes.new(name + ' / canopy anchors')
    mesh.vertices.add(count)
    mesh.vertices.foreach_set('co', origins.ravel())
    attributes = [('leaf_form', 'INT', 'value', np.array([row[0] for row in instances], np.int32)),
                  ('leaf_rotation', 'FLOAT_VECTOR', 'vector', eulers),
                  ('leaf_scale', 'FLOAT_VECTOR', 'vector', scales),
                  ('leaf_tint', 'FLOAT_COLOR', 'color', np.column_stack([np.array([row[3] for row in instances]), np.ones(count)]))]
    for key, kind, field, values in attributes:
        attr = mesh.attributes.new(key, kind, 'POINT')
        attr.data.foreach_set(field, values.ravel())
    mesh.update()
    obj = bpy.data.objects.new(name + ' / solid leaves', mesh)
    collection.objects.link(obj)
    group = bpy.data.node_groups.new(name + ' / instance exact leaves', 'GeometryNodeTree')
    group.interface.new_socket(name='Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    group.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    nodes, links = group.nodes, group.links
    entry, output = nodes.new('NodeGroupInput'), nodes.new('NodeGroupOutput')
    source = nodes.new('GeometryNodeCollectionInfo')
    source.inputs['Collection'].default_value = prototypes
    source.inputs['Separate Children'].default_value = True
    source.inputs['Reset Children'].default_value = True
    scatter = nodes.new('GeometryNodeInstanceOnPoints')
    scatter.inputs['Pick Instance'].default_value = True
    links.new(entry.outputs['Geometry'], scatter.inputs['Points'])
    links.new(source.outputs['Instances'], scatter.inputs['Instance'])
    node_attribute(nodes, links, scatter, 'Instance Index', 'leaf_form', 'INT')
    node_attribute(nodes, links, scatter, 'Rotation', 'leaf_rotation', 'FLOAT_VECTOR')
    node_attribute(nodes, links, scatter, 'Scale', 'leaf_scale', 'FLOAT_VECTOR')
    links.new(scatter.outputs['Instances'], output.inputs['Geometry'])
    modifier = obj.modifiers.new('Full-detail instanced leaves', 'NODES')
    modifier.node_group = group
    return obj


def instance_material(material):
    nodes, links = material.node_tree.nodes, material.node_tree.links
    for vertex in list(nodes):
        if vertex.bl_idname != 'ShaderNodeVertexColor':
            continue
        attr = nodes.new('ShaderNodeAttribute')
        attr.attribute_type = 'INSTANCER'
        attr.attribute_name = 'leaf_tint'
        for link in list(vertex.outputs['Color'].links):
            links.new(attr.outputs['Color'], link.to_socket)
        nodes.remove(vertex)
    # Thin tissue scatters transmitted sunlight; geometry and source maps stay intact.
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Subsurface Weight'].default_value = .12
    bsdf.inputs['Subsurface Scale'].default_value = .012
    bsdf.inputs['Subsurface Radius'].default_value = (.3, 1, .2)


def add_family(root, folder, collection, center):
    directory = root / 'assets/public/vegetation' / folder
    recipe = json.loads((root / 'tools/bake_vegetation' / folder / 'recipe.json').read_text())
    manifest = json.loads((directory / 'index.json').read_text())
    inventory = []
    spacing = 6 if recipe['kind'] == 'shrub' else 19
    for index, variant in enumerate(recipe['variants']):
        record = next(row for row in manifest['variants'] if row['id'] == variant['id'])
        source = directory / record['woodyDetail']['sourceBlend']['file']
        with bpy.data.libraries.load(str(source), link=False) as (available, loaded):
            if 'bark' not in available.objects or 'foliage' not in available.materials:
                raise RuntimeError(f'Missing authored bark/foliage in {source}')
            loaded.objects = ['bark']
            loaded.materials = ['foliage']
        bark, material = loaded.objects[0], loaded.materials[0]
        collection.objects.link(bark)
        name = f'{folder}/{variant["id"]}'
        bark.name = name + ' / original wood'
        materials = {'bark': bark.data.materials[0], 'foliage': material}
        bark_appearance = warm_bark(materials['bark'], folder)
        generator = create_shrub if recipe['kind'] == 'shrub' else create_tree
        temporary, _ = generator(variant, recipe['profile'], materials,
                                 {**recipe['growth'], 'leavesPerCard': recipe['texture']['leafCount']})
        clusters = ast.literal_eval(temporary[1]['leaf_clusters'])
        instances, templates, leaf_count, _ = foliage_instances(clusters, variant, recipe)
        for obj in temporary:
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.meshes.remove(mesh)
        instance_material(material)
        foliage = point_instances(name, instances, templates, material, collection)
        low, high = np.full(3, np.inf), np.full(3, -np.inf)
        virtual_triangles = 0
        for form, matrix, origin, _ in instances:
            points = np.asarray(templates[form][0] @ matrix.T + origin, np.float32)
            low = np.minimum(low, points.min(axis=0)); high = np.maximum(high, points.max(axis=0))
            virtual_triangles += len(templates[form][1])
        expected = record['foliageDetail']
        error = float(max(np.max(np.abs(low - expected['bounds']['min'])), np.max(np.abs(high - expected['bounds']['max']))))
        if leaf_count != expected['leafCount'] or virtual_triangles != expected['leafTriangles'] or error > 2e-5:
            raise RuntimeError(f'Instance/source mismatch for {name}: bounds error {error}')
        location = (center[0] + (index - 1) * spacing, center[1], -.025)
        for obj in [bark, foliage]:
            obj.location = location
            obj['species'] = recipe['species']
            obj['variant'] = variant['id']
            obj['sourceBlend'] = str(source)
        inventory.append({'species': folder, 'variant': variant['id'], 'position': location,
                          'sourceBlend': str(source), 'leafCount': leaf_count,
                          'barkAppearance': bark_appearance,
                          'instances': len(instances), 'foliageTriangles': virtual_triangles,
                          'woodTriangles': sum(len(poly.vertices) - 2 for poly in bark.data.polygons),
                          'sourceBoundsErrorMetres': error})
        print(f'[Showcase] Ready {name}: {leaf_count:,} leaves, exact bounds verified', flush=True)
    return recipe, manifest, inventory
