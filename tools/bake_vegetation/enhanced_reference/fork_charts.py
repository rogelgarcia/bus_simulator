# Blends neighbouring branch-aligned bark charts across a narrow shared-surface seam.
import json
import numpy as np


def blend_weight(first,second,width):
    t=np.clip(.5+(first-second)/(2*width),0,1)
    return t*t*(3-2*t)


def chart_neighbours(paths,source_paths):
    indices={id(path):i for i,path in enumerate(source_paths)};neighbours=[[] for _ in source_paths]
    for i,path in enumerate(source_paths):
        if 'growthRole' not in path or path['parent']<0:continue
        parent=indices.get(id(paths[path['parent']]))
        if parent is not None:neighbours[i].append(parent);neighbours[parent].append(i)
    return neighbours


def alternate_chart(obj,source,valid,face_triangles,distances,centers,loop_points,counts,corners,chart,voxel):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from common import array
    from bark_projection import affine_uv
    mesh=source.data;polygon_ids=np.empty(len(mesh.loop_triangles),np.int32);mesh.loop_triangles.foreach_get('polygon_index',polygon_ids)
    owners=array(mesh.attributes['source_chart'].data,'value',1,np.int32).ravel()[polygon_ids[valid]]
    neighbours=json.loads(source['forkChartNeighbours']);trees={};triangle_groups={}
    for owner in np.unique(owners):
        ids=np.flatnonzero(owners==owner);triangle_groups[int(owner)]=ids
        vertices=corners[ids].reshape((-1,3));faces=np.arange(len(vertices)).reshape((-1,3))
        trees[int(owner)]=BVHTree.FromPolygons(vertices.tolist(),faces.tolist(),all_triangles=True)
    alternate=face_triangles.copy();weight=np.zeros(len(centers));width=max(.045,voxel*3)
    for i,(center,triangle,distance) in enumerate(zip(centers,face_triangles,distances)):
        closest=distance+width
        for other in neighbours[owners[triangle]]:
            hit=trees[other].find_nearest(Vector(center),closest)
            if hit[2] is not None and hit[3]<closest:
                closest=hit[3];alternate[i]=triangle_groups[other][hit[2]];weight[i]=blend_weight(distance,closest,width)
    triangle_ids=np.repeat(alternate,counts);uv=affine_uv(loop_points,corners[triangle_ids],chart[triangle_ids])
    if not np.isfinite(uv).all():raise RuntimeError('Non-finite alternate bark chart')
    obj.data.uv_layers.new(name='ForkAlternate').data.foreach_set('uv',uv.astype(np.float32).ravel())
    obj.data.uv_layers.active_index=0
    obj.data.attributes.new('fork_chart_blend','FLOAT','FACE').data.foreach_set('value',weight.astype(np.float32))
    obj['forkBlendedFaces']=int(np.count_nonzero(weight));obj['forkBlendWidth']=width


def material_charts(mat):
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    alternate=nodes.new('ShaderNodeUVMap');alternate.uv_map='ForkAlternate'
    mask=nodes.new('ShaderNodeAttribute');mask.attribute_name='fork_chart_blend'
    for texture in [node for node in nodes if node.type=='TEX_IMAGE']:
        targets=[link.to_socket for link in list(texture.outputs['Color'].links)]
        second=nodes.new('ShaderNodeTexImage');second.image=texture.image;second.extension=texture.extension
        links.new(alternate.outputs['UV'],second.inputs['Vector'])
        if texture.image.filepath.endswith('normal_opengl.png'):
            primary=targets[0].node;normal_targets=[link.to_socket for link in list(primary.outputs['Normal'].links)]
            normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='ForkAlternate';normal.inputs['Strength'].default_value=primary.inputs['Strength'].default_value
            links.new(second.outputs['Color'],normal.inputs['Color'])
            mix=nodes.new('ShaderNodeMixRGB');links.new(mask.outputs['Fac'],mix.inputs[0]);links.new(primary.outputs['Normal'],mix.inputs[1]);links.new(normal.outputs['Normal'],mix.inputs[2])
            normalize=nodes.new('ShaderNodeVectorMath');normalize.operation='NORMALIZE';links.new(mix.outputs[0],normalize.inputs[0])
            for target in normal_targets:links.new(normalize.outputs[0],target)
            continue
        mix=nodes.new('ShaderNodeMixRGB');links.new(mask.outputs['Fac'],mix.inputs[0])
        links.new(texture.outputs['Color'],mix.inputs[1]);links.new(second.outputs['Color'],mix.inputs[2])
        for target in targets:links.new(mix.outputs[0],target)
