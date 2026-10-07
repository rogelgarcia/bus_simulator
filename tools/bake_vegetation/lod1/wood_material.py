# Reprojects accepted photographic bark onto new UV charts and the reduced mesh's tangent basis.
import bpy

from common import activate, configure
from wood import unwrap_regions, save_image, pbr_material


def bake_material(options, model, high, low, error, directory):
    scene = configure(options); scene.render.threads = 2; scene.cycles.samples = 1
    occupancy = unwrap_regions(low, 1.35 if model.startswith('arrowwood_') else 5.0)
    target = bpy.data.materials.new('LOD1 bark projection target'); target.use_nodes = True
    low.data.materials.clear(); low.data.materials.append(target)
    active = target.node_tree.nodes.new('ShaderNodeTexImage'); target.node_tree.nodes.active = active
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = max(.06, error['p99Metres']*2.2)
    scene.render.bake.max_ray_distance = max(.16, error['maxMetres']*2.2)
    scene.render.bake.margin = 16; scene.render.bake.margin_type = 'EXTEND'
    originals = [(material, material.node_tree.nodes.get('Material Output').inputs['Surface'].links[0].from_socket)
                 for material in high.data.materials]
    images = {}
    for channel in ['color', 'normal', 'orm']:
        image = bpy.data.images.new(model+' / LOD1 bark_'+channel, 2048, 2048, alpha=False, float_buffer=True)
        image.colorspace_settings.name = 'sRGB' if channel == 'color' else 'Non-Color'
        active.image = image
        for material, socket in originals:
            nodes, links = material.node_tree.nodes, material.node_tree.links
            output = nodes.get('Material Output')
            if channel == 'normal': links.new(socket, output.inputs['Surface'])
            else:
                bsdf = nodes.get('Principled BSDF')
                source = bsdf.inputs['Base Color'].links[0].from_socket if channel == 'color' else bsdf.inputs['Roughness'].links[0].from_node.inputs[0].links[0].from_socket
                emission = nodes.new('ShaderNodeEmission'); links.new(source, emission.inputs['Color'])
                links.new(emission.outputs[0], output.inputs['Surface'])
        activate(low, [high])
        bpy.ops.object.bake(type='NORMAL' if channel == 'normal' else 'EMIT', normal_space='TANGENT', use_clear=True)
        save_image(image, directory/('bark_'+channel+'.png')); images[channel] = image
        print(f'[LOD1] Reprojected {model} bark {channel}', flush=True)
    for material, socket in originals:
        material.node_tree.links.new(socket, material.node_tree.nodes.get('Material Output').inputs['Surface'])
    low.data.materials.clear(); low.data.materials.append(pbr_material(model+' / baked bark', images))
    low['lod1UvOccupancy'] = occupancy
