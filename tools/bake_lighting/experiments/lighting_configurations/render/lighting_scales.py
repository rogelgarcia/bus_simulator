"""Relative source scaling, including emissive surfaces for the scale-invariance control."""
import bpy


def scale_emission(multiplier):
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            socket = node.inputs.get('Emission Strength') if node.type == 'BSDF_PRINCIPLED' else node.inputs.get('Strength') if node.type == 'EMISSION' else None
            if socket is None:
                continue
            if socket.is_linked:
                if multiplier != 1:
                    raise RuntimeError('Uniform-scale control requires an unlinked emission strength: ' + material.name)
                continue
            if 'experiment_original_emission' not in node:
                node['experiment_original_emission'] = socket.default_value
            socket.default_value = node['experiment_original_emission'] * multiplier
