# Uses retained species maps with exportable metallic-roughness wiring and branch-aligned charts.
import json
import bpy
import numpy as np
from common import array
from wood import mesh_paths
from bark_projection import transfer
from mesh_adapter import adapt
from junctions import flow_surfaces


def bark(folder,species):
    metadata=json.loads((folder/'material.json').read_text())
    mat=bpy.data.materials.new(species+' / bark PBR');mat.use_nodes=True
    mat['source']='Retained AI-authored species maps; inferred data maps, not measured';mat['catalogMaterial']='pbr.tree_ai_'+species+'_bark'
    nodes,links=mat.node_tree.nodes,mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    textures={}
    for name,color in [('basecolor',True),('normal_opengl',False),('orm',False)]:
        node=nodes.new('ShaderNodeTexImage');node.name=name;node.image=bpy.data.images.load(str(folder/(name+'.png')),check_existing=True)
        node.image.colorspace_settings.name='sRGB' if color else 'Non-Color';node.image.pack();node.extension='REPEAT';textures[name]=node
    links.new(textures['basecolor'].outputs['Color'],bsdf.inputs['Base Color'])
    split=nodes.new('ShaderNodeSeparateColor');links.new(textures['orm'].outputs['Color'],split.inputs[0])
    links.new(split.outputs['Green'],bsdf.inputs['Roughness']);links.new(split.outputs['Blue'],bsdf.inputs['Metallic'])
    normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.65;links.new(textures['normal_opengl'].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
    bsdf.inputs['IOR'].default_value=1.42
    group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    node=nodes.new('ShaderNodeGroup');node.node_tree=group;links.new(split.outputs['Red'],node.inputs['Occlusion'])
    return mat,metadata


def assign(obj,material):
    obj.data.materials.clear();obj.data.materials.append(material)
    obj.data.polygons.foreach_set('material_index',np.zeros(len(obj.data.polygons),np.int32))


def apply_wood(graph,meta,material,tile):
    paths=flow_surfaces(adapt(graph));major=[p for p in paths if p['id'] in meta['majorIds']]
    source=mesh_paths('Temporary / original branch charts',major,material,tile,np.random.default_rng(graph['settings']['seed']),True)
    wood=bpy.data.objects[meta['wood']]
    if not wood.data.uv_layers:wood.data.uv_layers.new(name='UVMap')
    transfer(wood,source,meta['voxel']);assign(wood,material)
    bpy.data.objects.remove(source,do_unlink=True)
    for name in [meta['fine'],meta['subtree']]:
        obj=bpy.data.objects[name];uv=obj.data.uv_layers.active.data;uv.foreach_set('uv',(array(uv,'uv',2)/tile).ravel());assign(obj,material)
    fork=bpy.data.objects[meta['fork']]
    assign(fork,material)
    if not fork.data.uv_layers:fork.data.uv_layers.new(name='UVMap')
    transfer(fork,wood,meta['voxel'])


def audit_materials(meta):
    rows=[]
    for name in [meta['wood'],meta['fine'],meta['root']]:
        obj=bpy.data.objects[name];uv=obj.data.uv_layers.active
        values=array(uv.data,'uv',2) if uv else np.empty((0,2));material=obj.data.materials[0]
        nodes=material.node_tree.nodes;bsdf=nodes.get('Principled BSDF');images=[n.image for n in nodes if n.type=='TEX_IMAGE']
        row={'object':name,'uvLoops':len(values),'uvFinite':bool(np.isfinite(values).all()),'uvSpan':np.ptp(values,axis=0).tolist() if len(values) else [],
             'material':material.name,'packedImages':len(images),'imageDimensions':[list(i.size) for i in images],
             'imagesPacked':all(bool(i.packed_file) for i in images),'baseColorLinked':bsdf.inputs['Base Color'].is_linked,
             'roughnessLinked':bsdf.inputs['Roughness'].is_linked,'normalLinked':bsdf.inputs['Normal'].is_linked}
        row['passed']=len(values)==len(obj.data.loops) and row['uvFinite'] and len(images)==3 and row['imagesPacked'] and all(len(set(i.size))==1 and i.size[0]==1024 for i in images) and all(row[k] for k in ['baseColorLinked','roughnessLinked','normalLinked']) and min(row['uvSpan'])>0
        rows.append(row)
    return {'objects':rows,'passed':all(r['passed'] for r in rows),'workflow':'metallic-roughness','normalConvention':'OpenGL +Y','heightPolicy':'Normal texture retains inferred relief; no displacement of preserved branches'}
