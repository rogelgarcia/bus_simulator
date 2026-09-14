"""Rebuild the native surface UV binding from a saved scene without re-exporting the city."""
import sys,json,runpy
from pathlib import Path
import bpy
from mathutils import Matrix,Vector,Quaternion
import math
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/export_city'))
from surface_materials import restore_native_surface_uv

root=Path(sys.argv[sys.argv.index('--')+1]);r=json.loads((root/'request.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(Path(r['input'])/'source_city.blend'),load_ui=False)
changed=[];surfaces=[]
for obj in bpy.context.scene.objects:
    if obj.type!='MESH' or not any(s.material and s.material.get('bus_sim_surface_material') for s in obj.material_slots):continue
    surfaces.append(obj.name)
    if restore_native_surface_uv(obj):changed.append(obj.name)
    before=[tuple(x.vector) for x in obj.data.uv_layers[1].uv]
    if restore_native_surface_uv(obj) or before!=[tuple(x.vector) for x in obj.data.uv_layers[1].uv]:raise RuntimeError('Surface UV repair is not idempotent')
if sorted(surfaces)!=sorted(r['expectedSurfaces']):raise RuntimeError('Changed resolved surface inventory')
(root/'surface_uv_validation.json').write_text(json.dumps({'changed':changed,'surfaces':surfaces,'basis':'native-bottom-up','idempotent':True},indent=2))
if r.get('extraPoses'):
    scene=bpy.context.scene;basis=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
    source_layer=scene.view_layers[0]
    source_camera=bpy.data.objects[source_layer.name]
    original_root=bpy.data.objects[source_camera['bus_id']]
    for item in r['extraPoses']:
        col=bpy.data.collections.new(item['busId']);scene.collection.children.link(col)
        template=[original_root,*original_root.children_recursive];copies={o:o.copy() for o in template}
        for old,obj in copies.items():
            col.objects.link(obj);obj.parent=copies.get(old.parent);obj.matrix_parent_inverse=old.matrix_parent_inverse.copy();obj.matrix_basis=old.matrix_basis.copy()
        pose=item['pose'];p,q=pose['bus']['transform']['position'],pose['bus']['transform']['quaternion']
        bus=copies[original_root];bus.name=item['busId'];bus.matrix_world=basis@Matrix.LocRotScale(Vector(tuple(p[k] for k in 'xyz')),Quaternion(tuple(q[k] for k in 'wxyz')),Vector((1,1,1)))@basis.inverted()
        data=source_camera.data.copy();camera=bpy.data.objects.new(item['id'],data);scene.collection.objects.link(camera)
        p,q=pose['camera']['position'],pose['camera']['quaternion'];camera.matrix_world=basis@Matrix.LocRotScale(Vector(tuple(p[k] for k in 'xyz')),Quaternion(tuple(q[k] for k in 'wxyz')),Vector((1,1,1)))
        data.sensor_fit='VERTICAL';data.lens=data.sensor_height/(2*math.tan(math.radians(pose['camera']['fovDeg'])/2));camera['bus_id']=item['busId']
        for layer in scene.view_layers:layer.layer_collection.children[col.name].exclude=True
        layer=scene.view_layers.new(item['id'])
        for child in layer.layer_collection.children:
            if child.name.startswith('bus_'):child.exclude=child.name!=col.name
        for flag in ['z','normal','object_index','material_index','diffuse_direct','diffuse_indirect','diffuse_color','glossy_direct','glossy_indirect','glossy_color','emit','environment']:setattr(layer,'use_pass_'+flag,True)
        layer.cycles.denoising_store_passes=True
        for original in source_layer.aovs:
            aov=layer.aovs.add();aov.name=original.name;aov.type=original.type
bpy.ops.wm.save_as_mainfile(filepath=str(root/'source_city.blend'),compress=True)
runpy.run_path(str(Path(__file__).with_name('render_reference.py')),run_name='__main__')
