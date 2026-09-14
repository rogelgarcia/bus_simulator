"""Compare actual GPU geometry to camera-matched Cycles position and mesh-normal AOVs."""
import sys,json,math,gc
from pathlib import Path
import bpy,numpy as np,OpenImageIO as oiio
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'daylight_calibration'))
sys.path.insert(0,str(HERE.parent/'lighting_configurations/postprocess'))
from afternoon_render import render
from color_pipeline import ExrPasses,Y,save_json,three_aces,write_png
root=Path(sys.argv[sys.argv.index('--')+1]);r=json.loads((root/'request.json').read_text());rows=[]
if r['device']=='OPTIX':
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices();selected=[d for d in prefs.devices if d.type=='OPTIX']
    if not selected:raise RuntimeError('OPTIX unavailable')
    for d in prefs.devices:d.use=d in selected
device='GPU' if r['device']=='OPTIX' else 'CPU'
bpy.ops.wm.open_mainfile(filepath=str(Path(r['nativeReference'])/'calibrated_city.blend'),load_ui=False)
scene=bpy.context.scene;scene.cycles.samples=128;scene.cycles.use_denoising=False
for layer in scene.view_layers:
    for name in ['AI571 Position','AI571 Mesh Normal','AI571 Face Normal']:
        aov=layer.aovs.add();aov.name=name;aov.type='COLOR'
for mat in bpy.data.materials:
    if not mat.name.startswith(('MAT_396_','MAT_1624_')) or not mat.use_nodes:continue
    nodes,links=mat.node_tree.nodes,mat.node_tree.links;geo=nodes.new('ShaderNodeNewGeometry');path=nodes.new('ShaderNodeLightPath')
    for bsdf in [n for n in nodes if n.type=='BSDF_PRINCIPLED']:
        socket=bsdf.inputs['Normal'];original=socket.links[0].from_socket if socket.is_linked else geo.outputs['Normal']
        mix=nodes.new('ShaderNodeMixRGB');links.new(path.outputs['Is Camera Ray'],mix.inputs[0]);links.new(original,mix.inputs[1]);links.new(geo.outputs['Normal'],mix.inputs[2]);links.new(mix.outputs[0],socket)
    for name,sock in [('AI571 Position','Position'),('AI571 Mesh Normal','Normal'),('AI571 Face Normal','True Normal')]:
        aov=nodes.new('ShaderNodeOutputAOV');aov.aov_name=name;links.new(geo.outputs[sock],aov.inputs['Color'])
for name in ['pose_02','pose_04']:
    scene.camera=bpy.data.objects[name]
    for layer in scene.view_layers:layer.use=layer.name==name
    bpy.context.window.view_layer=scene.view_layers[name]
    im=oiio.ImageInput.open(str(Path(r['control'])/'masks'/(name+'_shaded_facade.png')));mask=im.read_image(format=oiio.FLOAT)[:,:,0]>.5;im.close()
    records=json.loads((Path(r['reference'])/'renders.json').read_text())
    for variant in ['geometric_constant','normal_constant']:
        exr=ExrPasses(next(x['file'] for x in records if x['pose']==name and x['variant']==variant),name)
        mask&=np.abs(exr.read('AI570 Roughness',channels=['X'])[:,:,0]-.85)<1e-4;del exr
    ys,xs=np.nonzero(mask);h,w=mask.shape;x0,x1=max(0,int(xs.min())-24),min(w,int(xs.max())+25);y0,y1=max(0,int(ys.min())-24),min(h,int(ys.max())+25)
    scene.render.use_border=True;scene.render.use_crop_to_border=False;scene.render.border_min_x=x0/w;scene.render.border_max_x=x1/w;scene.render.border_min_y=1-y1/h;scene.render.border_max_y=1-y0/h
    raw=render(scene,root/(name+'.exr'),device,name);exr=ExrPasses(raw['file'],name)
    convert=lambda v:np.stack([v[:,:,0],v[:,:,2],-v[:,:,1]],axis=2)
    cp=convert(exr.read('AI571 Position'));cn=convert(exr.read('AI571 Mesh Normal'));cf=convert(exr.read('AI571 Face Normal'))
    capture=Path(r['geometryCapture'])/name;shape=(h,w,4)
    game=lambda key:np.flipud(np.memmap(capture/(key+'.rgba32f'),mode='r',dtype='<f4',shape=shape))[:,:,:3]
    gp=game('geometric__position');gn=game('geometric__normal')*2-1;gf=game('geometric__face_normal')
    norm=lambda v:v/np.maximum(np.linalg.norm(v,axis=-1,keepdims=True),1e-8)
    angles=lambda a,b:np.degrees(np.arccos(np.clip(np.sum(norm(a)*norm(b),axis=-1),-1,1)))
    distance=np.linalg.norm(gp-cp,axis=-1);normal_angle=angles(gn,cn);face_angle=angles(gf,cf)
    stats=lambda v,m:{'median':float(np.median(v[m])),'p95':float(np.percentile(v[m],95)),'maximum':float(v[m].max())}
    # Position agreement is a correspondence diagnostic, never a brightness gate.
    same=mask&(distance<.02)
    rows.append({'pose':name,'pixels':int(mask.sum()),'positionMeters':stats(distance,mask),'meshNormalDegrees':stats(normal_angle,mask),'faceNormalDegrees':stats(face_angle,mask),
        'within2cm':int(same.sum()),'normalOnSamePosition':stats(normal_angle,same),'gameMeshToFace':stats(angles(gn,gf),mask),'cyclesMeshToFace':stats(angles(cn,cf),mask)})
    candidates=np.flatnonzero((mask&(normal_angle>10)&(distance<.02)).ravel());examples=[]
    deps=bpy.context.evaluated_depsgraph_get();camera=scene.camera
    for i in candidates[np.linspace(0,max(len(candidates)-1,0),min(len(candidates),64),dtype=int)]:
        y,x=np.unravel_index(i,mask.shape)
        # Use the recorded world hit itself to avoid a second projection convention.
        target=cp[y,x];from mathutils import Vector
        point=Vector((float(target[0]),float(-target[2]),float(target[1])));ray=(point-camera.matrix_world.translation).normalized()
        ok,p,n,face,obj,matrix=scene.ray_cast(deps,camera.matrix_world.translation,ray)
        item={'pixel':[int(x),int(y)],'positionError':float(distance[y,x]),'gameNormal':gn[y,x].tolist(),'cyclesNormal':cn[y,x].tolist(),'cyclesFace':cf[y,x].tolist(),'gameFace':gf[y,x].tolist()}
        if ok:
            poly=obj.data.polygons[face];normal_matrix=obj.matrix_world.to_3x3().inverted().transposed()
            item.update(object=obj.name,face=face,smooth=poly.use_smooth,material=obj.data.materials[poly.material_index].name,
                cornerNormals=[list(normal_matrix@obj.data.corner_normals[j].vector) for j in poly.loop_indices],
                vertices=[list(obj.matrix_world@obj.data.vertices[j].co) for j in poly.vertices])
        examples.append(item)
    save_json(root/(name+'_geometry_examples.json'),examples)
    image=np.zeros((h,w,3),np.float32);image[mask]=np.stack([np.clip(normal_angle[mask]/45,0,1),np.clip(1-normal_angle[mask]/45,0,1),np.zeros(mask.sum())],axis=1)
    write_png(root/(name+'_normal_error.png'),image)
    save_json(root/'analysis.json',rows);print(json.dumps(rows[-1]),flush=True);del exr;gc.collect()
