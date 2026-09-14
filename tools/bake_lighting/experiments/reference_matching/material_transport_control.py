"""AI568 causal controls: unoccluded glossy environment and primary geometric normal."""
import sys,json
import numpy as np
import OpenImageIO as oiio
from pathlib import Path
import bpy
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'daylight_calibration'))
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'lighting_configurations/postprocess'))
from afternoon_render import render
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
    scene=bpy.data.scenes[0]
    if scene.cycles.samples!=r['samples']:raise RuntimeError('Reference sample configuration changed')
    changed_objects=0;changed_materials=0
    if variant['id']=='inputs':
        names={'Roughness':'VALUE','Base Color':'COLOR','Metallic':'VALUE'}
        for layer in scene.view_layers:
            for key,kind in names.items():
                aov=layer.aovs.add();aov.name='AI568 '+key;aov.type=kind
        audit=[]
        for mat in bpy.data.materials:
            if not mat.use_nodes:continue
            nodes,links=mat.node_tree.nodes,mat.node_tree.links
            for bsdf in [n for n in nodes if n.type=='BSDF_PRINCIPLED']:
                for key,kind in names.items():
                    aov=nodes.new('ShaderNodeOutputAOV');aov.aov_name='AI568 '+key
                    source=bsdf.inputs[key];target=aov.inputs['Color' if kind=='COLOR' else 'Value']
                    if source.is_linked:links.new(source.links[0].from_socket,target)
                    else:target.default_value=source.default_value
                if mat.name.startswith(('MAT_396_','MAT_459_','MAT_82_')):
                    audit.append({'material':mat.name,'inputs':[{ 'name':s.name,
                        'value':list(s.default_value) if hasattr(s.default_value,'__len__') else s.default_value,
                        'links':[{'node':l.from_node.name,'socket':l.from_socket.name} for l in s.links]}
                        for s in bsdf.inputs if hasattr(s,'default_value')],
                        'nodes':[{'name':n.name,'type':n.type,'image':getattr(getattr(n,'image',None),'name',None)} for n in nodes]})
        save_json(root/'material_inputs.json',audit)
    if variant['globalGlossy']:
        for obj in scene.objects:
            if obj.type=='MESH' and obj.visible_glossy:
                obj.visible_glossy=False;changed_objects+=1
    if variant['flat']:
        for mat in bpy.data.materials:
            if not mat.use_nodes:continue
            nodes,links=mat.node_tree.nodes,mat.node_tree.links
            for bsdf in [n for n in nodes if n.type=='BSDF_PRINCIPLED']:
                source=bsdf.inputs['Normal']
                if not source.is_linked:continue
                original=source.links[0].from_socket
                geo=nodes.new('ShaderNodeNewGeometry');path=nodes.new('ShaderNodeLightPath')
                mix=nodes.new('ShaderNodeMixRGB')
                links.new(path.outputs['Is Camera Ray'],mix.inputs[0])
                links.new(original,mix.inputs[1]);links.new(geo.outputs['True Normal'],mix.inputs[2])
                links.new(mix.outputs[0],source);changed_materials+=1
    for pose in r['poses']:
        scene.camera=bpy.data.objects[pose['id']]
        for layer in scene.view_layers:layer.use=layer.name==pose['id']
        if variant['id']=='matched_roughness':
            game=Path(r['capture'])/pose['id']
            metadata=json.loads((game/'metadata.json').read_text())
            data=np.flipud(np.fromfile(game/'roughness.rgba32f',dtype='<f4').reshape(metadata['height'],metadata['width'],4))[:,:,:3].copy()
            image_file=root/(pose['id']+'_roughness.exr');out=oiio.ImageOutput.create(str(image_file))
            out.open(str(image_file),oiio.ImageSpec(metadata['width'],metadata['height'],3,oiio.FLOAT));out.write_image(data);out.close()
            image=bpy.data.images.load(str(image_file));image.colorspace_settings.name='Non-Color'
            for mat in bpy.data.materials:
                if not mat.name.startswith(('MAT_396_','MAT_459_','MAT_82_')):continue
                nodes,links=mat.node_tree.nodes,mat.node_tree.links
                texture=nodes.get('AI568 measured roughness')
                if texture:texture.image=image;continue
                texture=nodes.new('ShaderNodeTexImage');texture.name='AI568 measured roughness';texture.image=image;texture.interpolation='Closest'
                coord=nodes.new('ShaderNodeTexCoord');links.new(coord.outputs['Window'],texture.inputs['Vector'])
                path_node=nodes.new('ShaderNodeLightPath')
                for bsdf in [n for n in nodes if n.type=='BSDF_PRINCIPLED']:
                    socket=bsdf.inputs['Roughness'];mix=nodes.new('ShaderNodeMixRGB')
                    if socket.is_linked:links.new(socket.links[0].from_socket,mix.inputs[1])
                    else:mix.inputs[1].default_value=(socket.default_value,)*3+(1,)
                    links.new(path_node.outputs['Is Camera Ray'],mix.inputs[0]);links.new(texture.outputs['Color'],mix.inputs[2]);links.new(mix.outputs[0],socket)
        raw=render(scene,root/variant['id']/(pose['id']+'.exr'),device,pose['id'])
        image=root/variant['id']/(pose['id']+'.png')
        write_png(image,three_aces(read_pass(raw['file'],layer=pose['id']),2**r['exposureEv']))
        records.append({**raw,'pose':pose['id'],'variant':variant,'changedObjects':changed_objects,
            'changedMaterials':changed_materials,'image':str(image)})
        save_json(root/'renders.json',records)
