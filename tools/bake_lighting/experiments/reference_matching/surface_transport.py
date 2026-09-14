"""Align camera Lambert transport with the exact bake world and source reconstruction."""
import sys,json,math,gc
from pathlib import Path
import bpy
import numpy as np
import OpenImageIO as oiio
from mathutils import Vector
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
sys.path.insert(0,str(HERE.parent/'daylight_calibration'))
sys.path.insert(0,str(HERE.parent/'lighting_configurations/postprocess'))
from afternoon_render import render
from sky import world
from color_pipeline import save_json,read_pass,three_aces,write_png,ExrPasses,Y
from transport_model import apply_source_world

root=Path(sys.argv[sys.argv.index('--')+1]);r=json.loads((root/'request.json').read_text())
job=json.loads((Path(r['bake'])/'job.json').read_text());records=[];audits=[]
source={'file':str(Path(r['bake'])/'source.bsib'),'sha256':job['packageSha256']}
if r['device']=='OPTIX':
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    selected=[d for d in prefs.devices if d.type=='OPTIX']
    if not selected:raise RuntimeError('OPTIX unavailable')
    for d in prefs.devices:d.use=d in selected
device='GPU' if r['device']=='OPTIX' else 'CPU'

def wall_mask(name):
    im=oiio.ImageInput.open(str(Path(r['control'])/'masks'/(name+'_shaded_facade.png')))
    mask=im.read_image(format=oiio.FLOAT)[:,:,0]>.5;im.close();return mask

def ray_audit(scene,name):
    mask=wall_mask(name);ys,xs=np.nonzero(mask);camera=scene.camera;frame=camera.data.view_frame(scene=scene)
    left,right=min(v.x for v in frame),max(v.x for v in frame);bottom,top=min(v.y for v in frame),max(v.y for v in frame)
    z=frame[0].z;matrix=camera.matrix_world;deps=bpy.context.evaluated_depsgraph_get();hits=[];mats=set()
    for at in np.linspace(0,len(xs)-1,128,dtype=int):
        x,y=int(xs[at]),int(ys[at]);direction=Vector((left+(x+.5)/r['width']*(right-left),top-(y+.5)/r['height']*(top-bottom),z))
        direction=matrix.to_3x3()@direction;direction.normalize()
        ok,p,n,face,obj,_=scene.ray_cast(deps,matrix.translation,direction)
        if not ok:raise RuntimeError('Frozen wall ray missed')
        material=obj.data.materials[obj.data.polygons[face].material_index];mats.add(material)
        hits.append({'pixel':[x,y],'object':obj.name,'material':material.name,'stableMaterial':material.get('bus_sim_stable_material_id'),
            'position':list(p),'normal':list(n),'face':face})
    return mats,hits

def primary_control(materials):
    for mat in materials:
        nodes,links=mat.node_tree.nodes,mat.node_tree.links;geo=nodes.new('ShaderNodeNewGeometry');light=nodes.new('ShaderNodeLightPath')
        for output in [n for n in nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output]:
            socket=output.inputs['Surface'];original=socket.links[0].from_socket
            diffuse=nodes.new('ShaderNodeBsdfDiffuse');diffuse.inputs['Color'].default_value=(.5,.5,.5,1);diffuse.inputs['Roughness'].default_value=0
            links.new(geo.outputs['True Normal'],diffuse.inputs['Normal'])
            mix=nodes.new('ShaderNodeMixShader');links.new(light.outputs['Is Camera Ray'],mix.inputs[0]);links.new(original,mix.inputs[1]);links.new(diffuse.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],socket)
        for name,sock in [('AI571 Position','Position'),('AI571 Mesh Normal','Normal'),('AI571 Face Normal','True Normal')]:
            aov=nodes.new('ShaderNodeOutputAOV');aov.aov_name=name;links.new(geo.outputs[sock],aov.inputs['Color'])

variants=['display_matched','display_source_world','display_static','bake_scene']
for variant in variants:
    bpy.ops.wm.open_mainfile(filepath=str(Path(r['nativeReference'])/'calibrated_city.blend'),load_ui=False)
    scene=bpy.context.scene;scene.camera=bpy.data.objects['pose_04']
    for layer in scene.view_layers:layer.use=layer.name=='pose_04'
    bpy.context.window.view_layer=scene.view_layers['pose_04']
    scene.cycles.samples=512;scene.cycles.seed=553;scene.cycles.use_animated_seed=False
    scene.cycles.use_adaptive_sampling=False;scene.cycles.use_denoising=False
    scene.cycles.diffuse_bounces=4;scene.cycles.max_bounces=8;scene.cycles.glossy_bounces=0;scene.cycles.transmission_bounces=4;scene.cycles.transparent_max_bounces=16
    scene.cycles.sample_clamp_direct=0;scene.cycles.sample_clamp_indirect=0
    directory=root/variant;directory.mkdir()
    if variant in ['display_static','bake_scene']:
        for collection in bpy.data.collections:
            if collection.name.startswith('bus_'):collection.hide_render=True
    sun=None;background=None
    if variant!='display_matched':
        if any(o.type=='LIGHT' for o in scene.objects):raise RuntimeError('Display scene has unexpected light')
        sun,background=apply_source_world(source,directory,variant=='bake_scene')
    bpy.context.view_layer.update()
    mats,hits=ray_audit(scene,'pose_04');primary_control(mats)
    for layer in scene.view_layers:
        for name in ['AI571 Position','AI571 Mesh Normal','AI571 Face Normal']:
            aov=layer.aovs.add();aov.name=name;aov.type='COLOR'
    mask=wall_mask('pose_04');ys,xs=np.nonzero(mask);h,w=mask.shape
    x0,x1=max(0,int(xs.min())-24),min(w,int(xs.max())+25);y0,y1=max(0,int(ys.min())-24),min(h,int(ys.max())+25)
    scene.render.use_border=True;scene.render.use_crop_to_border=False
    scene.render.border_min_x=x0/w;scene.render.border_max_x=x1/w;scene.render.border_min_y=1-y1/h;scene.render.border_max_y=1-y0/h
    audit={'variant':variant,'hits':hits,'primaryMaterials':[m.name for m in mats],'samples':scene.cycles.samples,'diffuseBounces':scene.cycles.diffuse_bounces,'glossyBounces':scene.cycles.glossy_bounces,'filterSize':scene.render.filter_size}
    audits.append(audit);save_json(root/'audit.json',audits)
    for mode in ['full','sun']:
        if mode=='sun':
            if sun:background.inputs['Strength'].default_value=0
            else:scene.world=world(r['defaults'],r['defaults']['profiles'][0],'sun')
        raw=render(scene,directory/(mode+'.exr'),device,'pose_04');image=directory/(mode+'.png')
        write_png(image,three_aces(read_pass(raw['file'],layer='pose_04'),2**r['exposureEv']))
        exr=ExrPasses(raw['file'],'pose_04');color=exr.read('Diffuse Color');direct=exr.read('Diffuse Direct')*color;indirect=exr.read('Diffuse Indirect')*color
        records.append({**raw,'variant':variant,'source':mode,'pose':'pose_04','image':str(image),
            'maskPixels':int(mask.sum()),'meanDirectY':float(np.mean(direct[mask]@Y)),'meanIndirectY':float(np.mean(indirect[mask]@Y)),
            'nonNeutralPixels':int(np.sum(np.max(np.abs(color[mask]-.5),axis=1)>1e-4))})
        del exr;color=None;direct=None;indirect=None;gc.collect();save_json(root/'renders.json',records)
        print(json.dumps(records[-1]),flush=True)
