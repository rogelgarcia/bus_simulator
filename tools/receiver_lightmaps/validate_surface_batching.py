import runpy,sys,json
from pathlib import Path
import bpy,numpy as np
root=Path.cwd()/ 'tools/receiver_lightmaps'
sys.path.insert(0,str(root/'blender'))
from bake_surface import install_surface_targets
from batch_surface import batch_surface_targets
from reconstruct import reconstruct_resolved_city
proof=runpy.run_path(str(root/'validate_transport_participants.py'))
destination=Path(sys.argv[sys.argv.index('--')+1]).resolve()
reports=[]
# Joining must preserve the source color and UV inputs seen by secondary rays.
bpy.ops.wm.read_factory_settings(use_empty=True)
selected=[]
for i in range(2):
    mesh=bpy.data.meshes.new('attributes'+str(i));mesh.from_pydata([(0,0,0),(1,0,0),(0,1,0)],[],[(0,1,2)])
    uv=mesh.uv_layers.new(name='sourceUV')
    for value in uv.data:value.uv=(.25,.5)
    mesh.uv_layers.new(name='AI533_Bake')
    colors=mesh.color_attributes.new(name='sourceColor',type='FLOAT_COLOR',domain='POINT')
    for value in colors.data:value.color=(.2,.3,.4,.5)
    obj=bpy.data.objects.new('attributes'+str(i),mesh);bpy.context.scene.collection.objects.link(obj)
    obj.select_set(True);selected.append(obj)
batch_surface_targets(selected)
mesh=bpy.context.object.data
assert set(layer.name for layer in mesh.uv_layers)=={'sourceUV','AI533_Bake'}
assert all(np.allclose(value.uv,(.25,.5)) for value in mesh.uv_layers['sourceUV'].data)
assert len(mesh.color_attributes['sourceColor'].data)==6
assert all(np.allclose(value.color,(.2,.3,.4,.5)) for value in mesh.color_attributes['sourceColor'].data)
for mirrored in [False,True]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=128;scene.cycles.seed=553
    scene.cycles.use_adaptive_sampling=False;scene.cycles.diffuse_bounces=4;scene.cycles.glossy_bounces=0
    scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.world=bpy.data.worlds.new('world');scene.world.use_nodes=True
    scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(1,1,1,1)
    package=proof['source_fixture']()
    package.manifest['receiverMappings'].append({**package.manifest['participantMappings'][1],'id':'receiver/wall'})
    if mirrored:package.manifest['meshInstances'][1]['matrixBlenderWorld']=[-1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
    reconstruct_resolved_city(package,destination,'indirect_irradiance')
    images=[bpy.data.images.new('page'+str(i),64,64,float_buffer=True) for i in range(2)]
    charts=[{'id':name,'instanceId':name,'page':i,'x':0,'y':0,'min':[-1,-1],
        'triangles':[{'offset':0,'uv':[[-1,-1],[1,-1],[1,1]]},{'offset':3,'uv':[[-1,-1],[1,1],[-1,1]]}]} for i,name in enumerate(['floor','wall'])]
    install_surface_targets(package,{'charts':charts,'profile':{'pageSize':64,'padding':4,'texelSizeMeters':2/55}},images)
    scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True;scene.render.bake.use_pass_color=False
    scene.render.bake.margin=4
    bpy.ops.object.bake(type='DIFFUSE',uv_layer='AI533_Bake')
    before=[np.array(image.pixels[:]).reshape(64,64,4) for image in images]
    before_polygons=sum(len(o.data.polygons) for o in bpy.context.selected_objects)
    batch_surface_targets(list(bpy.context.selected_objects))
    assert len(bpy.context.selected_objects)==1 and len(bpy.context.object.data.polygons)==before_polygons
    bpy.ops.object.bake(type='DIFFUSE',uv_layer='AI533_Bake')
    after=[np.array(image.pixels[:]).reshape(64,64,4) for image in images]
    error=max(float(np.mean(np.abs(a[8:56,8:56,:3]-b[8:56,8:56,:3]))) for a,b in zip(before,after))
    print('BATCH_DIAGNOSTICS '+json.dumps({'mirrored':mirrored,'before':[a[8:56,8:56,:3].mean(axis=(0,1)).tolist() for a in before],
        'after':[a[8:56,8:56,:3].mean(axis=(0,1)).tolist() for a in after],'error':error}),flush=True)
    assert error < .005, error
    reports.append({'mirrored':mirrored,'meanAbsoluteError':error,'triangles':before_polygons})
(destination/'batching.json').write_text(json.dumps(reports,indent=2))
print('BATCHING_PASS '+json.dumps(reports))
