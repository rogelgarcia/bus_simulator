"""Primary-ray normal/roughness factorial and geometric Lambert delivery control."""
import sys,json
from pathlib import Path
import bpy
import numpy as np
import OpenImageIO as oiio
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'daylight_calibration'))
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from afternoon_render import render
from sky import world
from color_pipeline import save_json,read_pass,three_aces,write_png

root=Path(sys.argv[sys.argv.index('--')+1]);r=json.loads((root/'request.json').read_text())
if r['device']=='OPTIX':
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    selected=[d for d in prefs.devices if d.type=='OPTIX']
    if not selected:raise RuntimeError('OPTIX unavailable')
    for d in prefs.devices:d.use=d in selected
device='GPU' if r['device']=='OPTIX' else 'CPU'
records=[]
for variant in r['variants']:
    bpy.ops.wm.open_mainfile(filepath=str(Path(r['input'])/'calibrated_city.blend'),load_ui=False)
    scene=bpy.context.scene
    if scene.cycles.samples!=r['samples']:raise RuntimeError('Reference samples changed')
    for layer in scene.view_layers:
        for name,kind in [('AI570 Normal','COLOR'),('AI570 Roughness','VALUE')]:
            aov=layer.aovs.add();aov.name=name;aov.type=kind
    changed=[]
    for mat in bpy.data.materials:
        if not mat.name.startswith(('MAT_396_','MAT_1624_')):continue
        if not mat.use_nodes:continue
        nodes,links=mat.node_tree.nodes,mat.node_tree.links
        path=nodes.new('ShaderNodeLightPath');geo=nodes.new('ShaderNodeNewGeometry')
        for bsdf in [n for n in nodes if n.type=='BSDF_PRINCIPLED']:
            if variant in ['geometric','geometric_constant']:
                socket=bsdf.inputs['Normal'];original=socket.links[0].from_socket if socket.is_linked else geo.outputs['Normal']
                mix=nodes.new('ShaderNodeMixRGB');links.new(path.outputs['Is Camera Ray'],mix.inputs[0])
                # Match Three's unperturbed interpolated mesh normal. True Normal
                # would also remove authored smoothing, confounding this test.
                links.new(original,mix.inputs[1]);links.new(geo.outputs['Normal'],mix.inputs[2]);links.new(mix.outputs[0],socket)
            if variant in ['normal_constant','geometric_constant']:
                socket=bsdf.inputs['Roughness'];mix=nodes.new('ShaderNodeMixRGB')
                if socket.is_linked:links.new(socket.links[0].from_socket,mix.inputs[1])
                else:mix.inputs[1].default_value=(socket.default_value,)*3+(1,)
                mix.inputs[2].default_value=(r['roughness'],)*3+(1,)
                links.new(path.outputs['Is Camera Ray'],mix.inputs[0]);links.new(mix.outputs[0],socket)
            aov=nodes.new('ShaderNodeOutputAOV');aov.aov_name='AI570 Roughness';socket=bsdf.inputs['Roughness']
            if socket.is_linked:links.new(socket.links[0].from_socket,aov.inputs['Value'])
            else:aov.inputs['Value'].default_value=socket.default_value
            # Encode the actual primary normal, not the original normal texture AOV.
            socket=bsdf.inputs['Normal'];normal=socket.links[0].from_socket if socket.is_linked else geo.outputs['Normal']
            encode=nodes.new('ShaderNodeVectorMath');encode.operation='MULTIPLY_ADD'
            links.new(normal,encode.inputs[0]);encode.inputs[1].default_value=(.5,)*3;encode.inputs[2].default_value=(.5,)*3
            aov=nodes.new('ShaderNodeOutputAOV');aov.aov_name='AI570 Normal';links.new(encode.outputs[0],aov.inputs['Color'])
            changed.append(mat.name)
        if variant=='lambert':
            for output in [n for n in nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output]:
                socket=output.inputs['Surface']
                if not socket.is_linked:continue
                original=socket.links[0].from_socket
                diffuse=nodes.new('ShaderNodeBsdfDiffuse');diffuse.inputs['Color'].default_value=(.5,.5,.5,1);diffuse.inputs['Roughness'].default_value=0
                links.new(geo.outputs['True Normal'],diffuse.inputs['Normal'])
                mix=nodes.new('ShaderNodeMixShader');links.new(path.outputs['Is Camera Ray'],mix.inputs[0])
                links.new(original,mix.inputs[1]);links.new(diffuse.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],socket)
    save_json(root/(variant+'_materials.json'),sorted(set(changed)))
    for pose in r['poses']:
        if variant=='lambert' and pose['id']!='pose_04':continue
        name=pose['id'];scene.camera=bpy.data.objects[name]
        for layer in scene.view_layers:layer.use=layer.name==name
        im=oiio.ImageInput.open(str(Path(r['control'])/'masks'/(name+'_shaded_facade.png')))
        mask=im.read_image(format=oiio.FLOAT)[:,:,0]>.5;im.close();ys,xs=np.nonzero(mask)
        height,width=mask.shape
        if (width,height)!=(r['width'],r['height']):raise RuntimeError('Mask projection dimensions differ')
        x0,x1=max(0,int(xs.min())-24),min(width,int(xs.max())+25)
        y0,y1=max(0,int(ys.min())-24),min(height,int(ys.max())+25)
        scene.render.use_border=True;scene.render.use_crop_to_border=False
        scene.render.border_min_x=x0/width;scene.render.border_max_x=x1/width
        scene.render.border_min_y=1-y1/height;scene.render.border_max_y=1-y0/height
        for source in (['full','sun'] if variant=='lambert' else ['full']):
            if source=='sun':scene.world=world(r['defaults'],r['defaults']['profiles'][0],'sun')
            file=root/variant/(name+('_sun' if source=='sun' else '')+'.exr')
            raw=render(scene,file,device,name);image=file.with_suffix('.png')
            write_png(image,three_aces(read_pass(file,layer=name),2**r['exposureEv']))
            records.append({**raw,'pose':name,'variant':variant,'source':source,'image':str(image),'exposureEv':r['exposureEv'],'regionPixels':[x0,y0,x1,y1]})
            save_json(root/'renders.json',records)
