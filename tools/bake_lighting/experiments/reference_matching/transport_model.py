"""Primary Lambert/true-normal control; secondary authored materials and alpha stay intact."""
import bpy
import sys
import uuid
from pathlib import Path

def apply_source_world(source,output,reconstruct=False):
    root=Path(__file__).resolve().parents[4]
    sys.path.insert(0,str(root/'tools/receiver_lightmaps/blender'))
    from bake import lighting,open_verified_package
    with open_verified_package(Path(source['file']),source['sha256']) as package:
        if reconstruct:
            from transport import resolve_transport,EnhancedTransportMaterialAdapter
            from reconstruct import reconstruct_resolved_city
            from directional_coverage import apply_directional_coverage
            bpy.data.batch_remove([obj for obj in bpy.data.objects if obj.type=='MESH'])
            print('AI562 source control: reconstructing authenticated scene',flush=True)
            resolve_transport(package)
            scratch=root/'tests/artifacts/screens/baking_tmp'/('transport-'+uuid.uuid4().hex[:12])
            scratch.mkdir(parents=True)
            reconstruct_resolved_city(package,scratch,'indirect_irradiance',EnhancedTransportMaterialAdapter)
            apply_directional_coverage(bpy.data.materials)
            print('AI562 source control: reconstruction complete',flush=True)
        return lighting(package,output)

def apply_primary_diffuse_control(scene):
    scene.cycles.glossy_bounces=0
    count=0
    for material in bpy.data.materials:
        if not material.use_nodes:continue
        nodes,links=material.node_tree.nodes,material.node_tree.links
        for principled in [node for node in nodes if node.type=='BSDF_PRINCIPLED']:
            outgoing=list(principled.outputs['BSDF'].links)
            path=nodes.new('ShaderNodeLightPath')
            primary=nodes.new('ShaderNodeMath');primary.operation='LESS_THAN'
            links.new(path.outputs['Ray Depth'],primary.inputs[0]);primary.inputs[1].default_value=.5
            color=nodes.new('ShaderNodeMixRGB');color.blend_type='MULTIPLY';color.inputs[0].default_value=1
            source=principled.inputs['Base Color']
            if source.is_linked:links.new(source.links[0].from_socket,color.inputs[1])
            else:color.inputs[1].default_value=source.default_value
            metal=principled.inputs['Metallic'];nonmetal=nodes.new('ShaderNodeMath');nonmetal.operation='SUBTRACT'
            nonmetal.inputs[0].default_value=1
            if metal.is_linked:links.new(metal.links[0].from_socket,nonmetal.inputs[1])
            else:nonmetal.inputs[1].default_value=metal.default_value
            links.new(nonmetal.outputs[0],color.inputs[2])
            diffuse=nodes.new('ShaderNodeBsdfDiffuse');diffuse.inputs['Roughness'].default_value=0
            links.new(color.outputs[0],diffuse.inputs['Color'])
            geometry=nodes.new('ShaderNodeNewGeometry');links.new(geometry.outputs['True Normal'],diffuse.inputs['Normal'])
            mix=nodes.new('ShaderNodeMixShader');links.new(primary.outputs[0],mix.inputs[0])
            links.new(principled.outputs[0],mix.inputs[1]);links.new(diffuse.outputs[0],mix.inputs[2])
            for connection in outgoing:links.new(mix.outputs[0],connection.to_socket)
            count+=1
    return {'primaryDiffuseMaterials':count,'glossyBounces':0,'normal':'True Normal','primaryRoughness':0,
        'limits':'Diagnostic primary BRDF only; retains secondary authored materials and alpha. Not a replacement for the full Cycles target.'}
