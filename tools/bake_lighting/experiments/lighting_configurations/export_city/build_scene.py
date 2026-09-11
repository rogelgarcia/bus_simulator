"""Import actual glTF source, preserve four bus placements and validate five cameras."""
import bpy, sys, json, math, shutil, hashlib
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion
from bpy_extras.object_utils import world_to_camera_view
sys.path.insert(0, str(Path(__file__).resolve().parents[4]/'illumination_bake_compiler/blender'))
from uv_tiling import insert_gltf_tiling

source = Path(sys.argv[sys.argv.index('--')+1]); data=json.loads(source.read_text())
output=Path(data['output']); bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene; scene.name='BigCity2_Lighting_Lab';scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
bpy.ops.import_scene.gltf(filepath=data['raw'], import_shading='NORMALS')
city=bpy.data.objects.get('CITY_SOURCE'); bus=bpy.data.objects.get('BUS_SOURCE')
if city is None or bus is None: raise RuntimeError('Imported city/bus source roots missing')
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
def transform(pose):
    p,q=pose['position'],pose['quaternion']
    return C @ Matrix.LocRotScale(Vector((p['x'],p['y'],p['z'])),Quaternion((q['w'],q['x'],q['y'],q['z'])),Vector((1,1,1))) @ C.inverted()
def collection(name):
    c=bpy.data.collections.new(name);scene.collection.children.link(c);return c
city_collection=collection('City — complete transport')
for obj in [city,*city.children_recursive]:
    for previous in list(obj.users_collection):previous.objects.unlink(obj)
    city_collection.objects.link(obj)
template=[bus,*bus.children_recursive];bus_collections={};bus_roots={}
for item in data['poses']:
    bus_id=item['busId']
    if bus_id in bus_roots:continue
    col=collection(bus_id);copies={obj:obj.copy() for obj in template}
    for old,obj in copies.items():
        col.objects.link(obj)
        obj.parent=copies.get(old.parent)
        obj.matrix_parent_inverse=old.matrix_parent_inverse.copy();obj.matrix_basis=old.matrix_basis.copy()
    root=copies[bus];root.name=bus_id;root.matrix_world=transform(item['pose']['bus']['transform'])
    bus_roots[bus_id]=root;bus_collections[bus_id]=col
for obj in template:bpy.data.objects.remove(obj,do_unlink=True)
# Source glTF performs geometry basis conversion; its root becomes identity here.
cameras=[];errors=[]
for item in data['poses']:
    cam_data=bpy.data.cameras.new(item['id']);cam=bpy.data.objects.new(item['id'],cam_data);scene.collection.objects.link(cam)
    p,q=item['pose']['camera']['position'],item['pose']['camera']['quaternion']
    cam.matrix_world=C @ Matrix.LocRotScale(Vector((p['x'],p['y'],p['z'])),Quaternion((q['w'],q['x'],q['y'],q['z'])),Vector((1,1,1)))
    cam_data.type='PERSP';cam_data.sensor_fit='VERTICAL';cam_data.sensor_height=24
    cam_data.lens=cam_data.sensor_height/(2*math.tan(math.radians(item['pose']['camera']['fovDeg'])/2));cam_data.clip_start=.1;cam_data.clip_end=2000;cam_data.dof.use_dof=False
    cam['bus_id']=item['busId'];cameras.append(cam.name)
    layer=scene.view_layers.new(item['id'])
    for bus_id,col in bus_collections.items():layer.layer_collection.children[col.name].exclude=bus_id!=item['busId']
    layer.use_pass_z=True;layer.use_pass_normal=True;layer.use_pass_object_index=True;layer.use_pass_material_index=True
    for flag in ['diffuse_direct','diffuse_indirect','diffuse_color','glossy_direct','glossy_indirect','glossy_color','transmission_direct','transmission_indirect','transmission_color','emit','environment']:
        setattr(layer,'use_pass_'+flag,True)
    layer.cycles.denoising_store_passes=True
    scene.camera=cam;scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
    bpy.context.view_layer.update()
    evidence=next(record for record in data['evidence'] if record['id']==item['id'])
    projection=Matrix([evidence['projectionMatrix'][i::4] for i in range(4)])
    world=Matrix([evidence['cameraWorldMatrix'][i::4] for i in range(4)])
    points=[record['positionThree'] for record in data['landmarks']]
    bounds=data['busBounds'];bus_transform=transform(item['pose']['bus']['transform'])
    for x in [bounds['min'][0],bounds['max'][0]]:
        for y in [bounds['min'][1],bounds['max'][1]]:
            for z in [bounds['min'][2],bounds['max'][2]]:
                points.append(list((C.inverted() @ bus_transform @ C @ Vector((x,y,z,1)))[:3]))
    for point in points:
        clip=projection @ world.inverted() @ Vector((*point,1))
        if clip.w<=0:continue
        three=(clip.x/clip.w,clip.y/clip.w)
        # Near-horizon offscreen projections are unbounded and amplify float32 error.
        # Pixel parity is defined on points inside the captured image.
        if abs(three[0])>1 or abs(three[1])>1:continue
        b=world_to_camera_view(scene,cam,C @ Vector(point))
        error=math.hypot((three[0]-(b.x*2-1))*960,(three[1]-(b.y*2-1))*540)
        errors.append(error)
if 'ViewLayer' in scene.view_layers:scene.view_layers.remove(scene.view_layers['ViewLayer'])
for index,obj in enumerate(o for o in scene.objects if o.type=='MESH'):obj.pass_index=(index%32766)+1
material_masks={}
for index,mat in enumerate(bpy.data.materials):mat.pass_index=index+1;material_masks[str(index+1)]=mat.name
uv_tiling_nodes = 0
for record in data['materials']:
    if not record.get('uvTiling'): continue
    material = bpy.data.materials.get(record['id'])
    if not material: raise RuntimeError('Imported UV override material missing: '+record['id'])
    uv_tiling_nodes += insert_gltf_tiling(material, record['uvTiling'])
# Explicit repair for Three's signed tangent-space normal scale where glTF keeps X only.
for record in data['materials']:
    scale=record.get('normalScale')
    if not scale or scale[0]*scale[1]>=0:continue
    mat=bpy.data.materials.get(record['id'])
    if not mat or not mat.use_nodes:continue
    for node in list(mat.node_tree.nodes):
        if node.type!='NORMAL_MAP' or not node.inputs['Color'].is_linked:continue
        source_socket=node.inputs['Color'].links[0].from_socket
        separate=mat.node_tree.nodes.new('ShaderNodeSeparateColor');combine=mat.node_tree.nodes.new('ShaderNodeCombineColor');invert=mat.node_tree.nodes.new('ShaderNodeMath');invert.operation='SUBTRACT';invert.inputs[0].default_value=1
        links=mat.node_tree.links;links.new(source_socket,separate.inputs[0]);links.new(separate.outputs['Green'],invert.inputs[1]);links.new(separate.outputs['Red'],combine.inputs['Red']);links.new(invert.outputs[0],combine.inputs['Green']);links.new(separate.outputs['Blue'],combine.inputs['Blue']);links.new(combine.outputs[0],node.inputs['Color'])
ocio_source=Path(bpy.utils.resource_path('LOCAL'))/'datafiles'/'colormanagement';ocio_target=output/'color_management'
shutil.copytree(ocio_source,ocio_target,dirs_exist_ok=True)
ocio_files=[str(p) for p in ocio_target.rglob('*') if p.is_file()]
scene.camera=bpy.data.objects[cameras[0]];scene.render.engine='CYCLES';scene.view_settings.view_transform='AgX';scene.view_settings.look='None';scene.render.film_transparent=False
scene.render.image_settings.media_type='MULTI_LAYER_IMAGE';scene.render.image_settings.file_format='OPEN_EXR_MULTILAYER';scene.render.image_settings.color_depth='32';scene.render.image_settings.exr_codec='ZIP';scene.render.image_settings.use_exr_interleave=True
scene.render.use_file_extension=True
if hasattr(scene.render,'use_motion_blur'):scene.render.use_motion_blur=False
scene['source_manifest']='//source_manifest.json';scene['pose_binding_policy']='Each pose view layer excludes all unrelated bus collections from every ray type.'
text=bpy.data.texts.new('Experiment_manifest.json');text.write(json.dumps({'poses':data['poses'],'lighting':data['lightingConfig'],'limitations':data['limitations']},indent=2))
bpy.ops.file.pack_all()
blend=output/'bigcity2_lighting_lab.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
receipt={'schemaVersion':1,'status':'validated','blender':bpy.app.version_string,'build':bpy.app.build_hash.decode(),'cameras':cameras,'busPlacements':list(bus_roots),
    'objects':len(bpy.data.objects),'meshes':len(bpy.data.meshes),'materials':len(bpy.data.materials),'images':len(bpy.data.images),'uvTilingTextureNodes':uv_tiling_nodes,
    'projection':{'maximumPixelError':max(errors),'checks':len(errors),'basis':'Three(x,y,z) -> Blender(x,-z,y)','resolution':[1920,1080]},
    'colorManagement':{'config':str(ocio_target/'config.ocio'),'files':ocio_files},'materialMasks':material_masks,
    'resources':'glTF images packed; OCIO bundled next to blend; original HDRI sibling file'}
(output/'build_receipt.json').write_text(json.dumps(receipt,indent=2))
print('AI560_SCENE_READY='+json.dumps({k:v for k,v in receipt.items() if k not in ['materialMasks','colorManagement']}),flush=True)
