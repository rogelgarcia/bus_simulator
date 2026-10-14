# Makes spatial forks and individual blade curvature inspectable in the saved reference model.
import math
import bpy
from presentation_poses import rotated_offset


def leaf_prototypes(foliage):
    group=next(m.node_group for m in foliage.modifiers if m.type=='NODES')
    node=next(n for n in group.nodes if n.bl_idname=='GeometryNodeCollectionInfo')
    return sorted(node.inputs['Collection'].default_value.objects,key=lambda o:o.name)


def add_spatial_poses(poses,state,primary):
    full=poses['full']
    for name,angle in [('side',70),('rear',150)]:
        poses[('wood_' if state=='enhanced' else 'compare_')+name]={**full,'offset':rotated_offset(full['offset'],angle),'span':full['span']*1.10}
    if state=='enhanced':poses['bare']=full.copy()
    if primary:
        poses['blade']={'target':[0,0,2.23],'offset':[.45,-1,.28],'span':.73}
        poses['blade_edge']={'target':[0,0,2.23],'offset':[1,-.22,.17],'span':.73}


def isolate_blade(foliage):
    mesh=bpy.data.meshes.new('Isolated leaf instance');mesh.vertices.add(1);mesh.vertices[0].co=(0,0,2)
    for name,kind,field,value in [('leaf_form','INT','value',0),('leaf_scale','FLOAT_VECTOR','vector',(.3,.3,.3)),
                                 ('leaf_rotation','FLOAT_VECTOR','vector',(math.pi/2,0,0)),('leaf_tint','FLOAT_COLOR','color',(1,1,1,1))]:
        setattr(mesh.attributes.new(name,kind,'POINT').data[0],field,value)
    blade=foliage.copy();blade.data=mesh;blade.name='Actual saved leaf blade';bpy.context.scene.collection.objects.link(blade)
    blade.location=(0,0,0);blade.hide_render=True
    return blade
