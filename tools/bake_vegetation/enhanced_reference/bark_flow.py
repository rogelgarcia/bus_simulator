# Blends intact PBR projections at fork volumes instead of stretching independent UV charts.
import numpy as np


def junction_weights(points,paths):
    forks=set();weights=np.zeros(len(points))
    for path in paths:
        if ('growthRole' in path or path.get('rootCrown')) and path['parent']>=0:forks.add((path['parent'],path['parentNode']))
    for parent,node in forks:
        path=paths[parent];distance=np.linalg.norm(points-path['points'][node],axis=1)/path['radii'][node]
        w=np.clip((4-distance)/1.5,0,1);weights=np.maximum(weights,w*w*(3-2*w))
    return weights


def blend_junction_uv(obj,paths):
    from common import array
    weights=junction_weights(array(obj.data.vertices,'co',3),paths)
    attribute=obj.data.attributes.new('fork_bark_blend','FLOAT','POINT');attribute.data.foreach_set('value',weights.astype(np.float32))
    group=obj.vertex_groups.new(name='UV relief outside shared forks')
    for band in range(1,17):
        ids=np.flatnonzero(np.round((1-weights)*16)==band)
        if len(ids):group.add(ids.tolist(),band/16,'REPLACE')
    return group.name


def fork_material(mat,tile):
    nodes,links=mat.node_tree.nodes,mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    mask=nodes.new('ShaderNodeAttribute');mask.attribute_name='fork_bark_blend'
    coordinates=nodes.new('ShaderNodeTexCoord');scale=nodes.new('ShaderNodeVectorMath');scale.operation='SCALE';scale.inputs[3].default_value=1/tile;links.new(coordinates.outputs['Object'],scale.inputs[0])
    images={n.image.filepath.replace('\\','/').split('/')[-1]:n.image for n in nodes if n.type=='TEX_IMAGE'}
    def projected(file):
        n=nodes.new('ShaderNodeTexImage');n.image=images[file];n.projection='BOX';n.projection_blend=.30;n.extension='REPEAT';links.new(scale.outputs[0],n.inputs['Vector']);return n
    def blend(socket,other):
        old=bsdf.inputs[socket].links[0].from_socket;mix=nodes.new('ShaderNodeMixRGB');links.new(mask.outputs['Fac'],mix.inputs[0]);links.new(old,mix.inputs[1]);links.new(other,mix.inputs[2]);links.new(mix.outputs[0],bsdf.inputs[socket])
    blend('Base Color',projected('basecolor.png').outputs['Color'])
    split=nodes.new('ShaderNodeSeparateColor');links.new(projected('orm.png').outputs['Color'],split.inputs[0]);blend('Roughness',split.outputs['Green'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.008;bump.inputs['Strength'].default_value=.65;links.new(projected('height_16bit.png').outputs['Color'],bump.inputs['Height']);blend('Normal',bump.outputs['Normal'])
