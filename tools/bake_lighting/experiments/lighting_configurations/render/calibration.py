"""Separate reflectance-card/sphere scene; never appears in city beauty renders."""
import bpy,math,json,time
import numpy as np
from pathlib import Path
from lighting import apply_lighting,image_array,Y709

def render_cards(main,source,lighting,environments,output):
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    scene=bpy.data.scenes.new('Reflectance calibration');scene.render.engine='CYCLES';scene.cycles.device=main.cycles.device;scene.cycles.samples=128;scene.cycles.use_denoising=False
    scene.render.threads_mode='FIXED';scene.render.threads=main.render.threads
    scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='OPEN_EXR';scene.render.image_settings.color_depth='32';scene.view_settings.view_transform='AgX';scene.view_settings.look='None'
    camera=bpy.data.objects.new('Calibration camera',bpy.data.cameras.new('Calibration camera'));scene.collection.objects.link(camera);scene.camera=camera;camera.location=(0,0,6);camera.data.type='ORTHO';camera.data.ortho_scale=5
    cards=[('gray18',(-1.5,1.5),(.18,.18,.18)),('white90',(0,1.5),(.9,.9,.9)),('black02',(1.5,1.5),(.02,.02,.02)),('red',(-1.5,0),(.45,.04,.03)),('green',(0,0),(.04,.35,.06)),('blue',(1.5,0),(.025,.06,.4))]
    for name,(x,y),color in cards:
        mesh=bpy.data.meshes.new(name);mesh.from_pydata([(-.55,-.55,0),(.55,-.55,0),(.55,.55,0),(-.55,.55,0)],[],[(0,1,2,3)])
        obj=bpy.data.objects.new(name,mesh);obj.location=(x,y,0);scene.collection.objects.link(obj)
        mat=bpy.data.materials.new(name);mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();surface=nodes.new('ShaderNodeBsdfDiffuse');surface.inputs['Color'].default_value=(*color,1);surface.inputs['Roughness'].default_value=0;out=nodes.new('ShaderNodeOutputMaterial');mat.node_tree.links.new(surface.outputs[0],out.inputs['Surface']);mesh.materials.append(mat)
    # A sphere with its own mesh, linked only to this diagnostic scene.
    import bmesh
    mesh=bpy.data.meshes.new('Gloss sphere');bm=bmesh.new();bmesh.ops.create_uvsphere(bm,u_segments=48,v_segments=24,radius=.5);bm.to_mesh(mesh);bm.free();sphere=bpy.data.objects.new('Gloss sphere',mesh);sphere.location=(0,-1.4,.5);scene.collection.objects.link(sphere)
    for poly in mesh.polygons:poly.use_smooth=True
    material=bpy.data.materials.new('Neutral glossy metal');material.use_nodes=True;bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.8,.8,.8,1);bsdf.inputs['Metallic'].default_value=1;bsdf.inputs['Roughness'].default_value=.15;mesh.materials.append(material)
    records=[]
    for preset in lighting['configurations']:
        effective=apply_lighting(scene,source,lighting,preset,environments);file=output/(preset['id']+'_cards.exr');scene.render.filepath=str(file);start=time.perf_counter();bpy.ops.render.render(scene=scene.name,write_still=True)
        image=bpy.data.images.load(str(file),check_existing=False);image.colorspace_settings.name='Linear Rec.709';pixels=image_array(image);measurements={}
        for name,(x,y),color in cards:
            px=int((x/5+.5)*512);py=int((y/5+.5)*512);patch=pixels[py-12:py+12,px-12:px+12,:3];measurements[name]={'reflectance':color,'medianRgb':np.median(patch.reshape(-1,3),axis=0).tolist(),'meanLuminance':float((patch@Y709).mean())}
        scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_depth='8';bpy.data.images['Render Result'].save_render(str(file.with_suffix('.png')),scene=scene);scene.render.image_settings.file_format='OPEN_EXR';scene.render.image_settings.color_depth='32'
        expected=.18/math.pi*(effective['skyHorizontalTargetRelative']+effective['sunEnergyRelative']*environments['sun'][2])
        records.append({'light':preset['id'],'file':str(file),'seconds':time.perf_counter()-start,'measurements':measurements,'expectedGray18Lambert':expected if preset['environment']!='source' else None,'exposureToMapGray18ToLinear018':math.log2(.18/measurements['gray18']['meanLuminance'])})
    scene['calibration_policy']='Linear reflectance cards, no exposure normalization, not a measured color-checker chart. Sensor irradiance is relative, not SI lux.'
    # Saving also preserves the full city and the separate diagnostic scene for reuse.
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'calibration_scene.blend'),compress=True,copy=True)
    for obj in list(scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.scenes.remove(scene)
    result={'records':records,'policy':'Global exposure remains 0 EV for the comparison. Reported gray-card exposure is a recommendation for a later global change, never per-pose normalization.','referenceLight':'L01'}
    (output/'cards.json').write_text(json.dumps(result,indent=2));return result
