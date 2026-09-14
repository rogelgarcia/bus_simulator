"""Known metric relief proves when geometric visibility and AO would overlap."""
import sys,json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'daylight_calibration'))
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from afternoon_render import render
from color_pipeline import ExrPasses,write_png,three_aces,save_json,Y

root=Path(sys.argv[sys.argv.index('--')+1]);r=json.loads((root/'request.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.engine='CYCLES'
scene.cycles.samples=r['samples'];scene.cycles.seed=r['seed'];scene.cycles.use_denoising=False;scene.cycles.use_adaptive_sampling=False
scene.cycles.sample_clamp_direct=0;scene.cycles.sample_clamp_indirect=0;scene.cycles.max_bounces=8
scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=768;scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.render.image_settings.media_type='MULTI_LAYER_IMAGE';scene.render.image_settings.file_format='OPEN_EXR_MULTILAYER';scene.render.image_settings.color_depth='32'
scene.render.image_settings.use_exr_interleave=True
layer=scene.view_layers[0];layer.name='AOFixture'
layer.use_pass_diffuse_direct=True;layer.use_pass_diffuse_indirect=True;layer.use_pass_diffuse_color=True
scene.world=bpy.data.worlds.new('White');scene.world.use_nodes=True;bg=scene.world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(1,1,1,1);bg.inputs['Strength'].default_value=1
mat=bpy.data.materials.new('Neutral diffuse');mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
bsdf=nodes.new('ShaderNodeBsdfDiffuse');bsdf.inputs['Color'].default_value=(r['albedo'],)*3+(1,);bsdf.inputs['Roughness'].default_value=0
out=nodes.new('ShaderNodeOutputMaterial');links.new(bsdf.outputs[0],out.inputs['Surface'])
cam=bpy.data.objects.new('camera',bpy.data.cameras.new('camera'));scene.collection.objects.link(cam);cam.location=(0,0,3);cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=.72;cam.data.sensor_fit='HORIZONTAL';scene.camera=cam
if r['device']=='OPTIX':
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices();devices=[d for d in prefs.devices if d.type=='OPTIX']
    if not devices:raise RuntimeError('OPTIX unavailable')
    for d in prefs.devices:d.use=d in devices
device='GPU' if r['device']=='OPTIX' else 'CPU';rows=[];panels=[]
for depth in r['depthMeters']:
    for obj in list(scene.objects):
        if obj.type=='MESH':bpy.data.objects.remove(obj,do_unlink=True)
    bpy.ops.mesh.primitive_plane_add(size=4);base=bpy.context.object;base.name='Mortar';base.data.materials.append(mat)
    if depth:
        for row in range(-10,11):
            for col in range(-6,7):
                x=(col+.5*(row%2))*r['brickWidthMeters'];y=row*r['brickHeightMeters']
                bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,depth/2));obj=bpy.context.object;obj.name='Brick'
                obj.dimensions=(r['brickWidthMeters']-r['mortarMeters'],r['brickHeightMeters']-r['mortarMeters'],depth)
                bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.data.materials.append(mat)
    result=render(scene,root/('relief_'+str(round(depth*1000))+'.exr'),device,'AOFixture');exr=ExrPasses(result['file'],'AOFixture');beauty=exr.read()
    direct=exr.read('Diffuse Direct')*exr.read('Diffuse Color');bounce=exr.read('Diffuse Indirect')*exr.read('Diffuse Color');del exr
    visibility=(direct@Y)/r['albedo']
    if np.max(np.abs(beauty-direct-bounce))>1e-5:raise RuntimeError('Diffuse transport did not close')
    # Separate diagnostic: apply geometric AO again to the already-occluded beauty.
    doubled=beauty*visibility[:,:,None];mask=np.zeros(visibility.shape,dtype=bool);mask[24:-24,24:-24]=True
    row={'depthMeters':depth,'render':result,'meanPhysicalY':float(np.mean(beauty[mask]@Y)),'meanVisibility':float(visibility[mask].mean()),'meanBounceY':float(np.mean(bounce[mask]@Y)),
        'extraAoY':float(np.mean(doubled[mask]@Y)),'physicalMinY':float(np.percentile(beauty[mask]@Y,5))}
    rows.append(row);panels.append(np.concatenate([three_aces(beauty,1),three_aces(doubled,1)],axis=1));print(json.dumps(row),flush=True)
if abs(rows[0]['meanPhysicalY']/r['albedo']-1)>.015 or abs(rows[0]['meanVisibility']-1)>.001:raise RuntimeError('Flat Lambert/unit-world anchor failed')
if not all(row['meanPhysicalY']<rows[0]['meanPhysicalY'] and row['extraAoY']<row['meanPhysicalY'] for row in rows[1:]):raise RuntimeError('Relief/duplicate AO control failed')
write_png(root/'relief_comparison.png',np.concatenate(panels,axis=0));save_json(root/'analysis.json',{'rows':rows,'policy':r['policy'],'panels':'Rows: 0/5/10/20mm relief. Left: physical Cycles. Right: deliberately duplicated AO, diagnostic only.'})
bpy.ops.wm.save_as_mainfile(filepath=str(root/'fixture.blend'),compress=True)
