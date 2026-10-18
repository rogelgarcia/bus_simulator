# Validates supplied data maps and builds physically separated upper/lower leaf materials.
import hashlib
import json
import struct
from pathlib import Path
import bpy
import numpy as np
from common import write_json


def pixels(file,color=False):
    image=bpy.data.images.load(str(file),check_existing=True)
    image.colorspace_settings.name='sRGB' if color else 'Non-Color'
    data=np.empty(image.size[0]*image.size[1]*4,np.float32);image.pixels.foreach_get(data)
    return data.reshape((image.size[1],image.size[0],4))


def validate_materials(o):
    rows=json.loads((Path(o['output'])/'material-staging.json').read_text())['materials'];proof=[];opacity={}
    for row in rows:
        folder=Path(row['directory']);meta=json.loads((folder/'material.json').read_text());sizes=[]
        for f in folder.glob('*.png'):
            header=f.read_bytes()[:26]
            if header[:8]!=b'\x89PNG\r\n\x1a\n':raise RuntimeError('Invalid source PNG '+str(f))
            w,h,bits,mode=struct.unpack('>IIBB',header[16:26]);sizes.append((w,h))
            if (w,h)!=(1024,1024):raise RuntimeError('Unexpected material dimensions')
            if f.name=='height_16bit.png' and bits!=16:raise RuntimeError('Height precision lost')
        orm=pixels(folder/'orm.png');ao=pixels(folder/'ao.png')[:,:,0];rough=pixels(folder/'roughness.png')[:,:,0]
        if np.max(abs(orm[:,:,0]-ao))>1/255 or np.max(abs(orm[:,:,1]-rough))>1/255 or np.max(orm[:,:,2])>1/255:raise RuntimeError('ORM channel mismatch')
        normal=pixels(folder/'normal_opengl.png')[:,:,:3]*2-1
        if np.max(abs(np.linalg.norm(normal,axis=2)-1))>.04:raise RuntimeError('Invalid tangent normals')
        if row['role']!='bark':
            alpha=pixels(folder/'opacity.png')[:,:,0];color=pixels(folder/'basecolor.png',True)
            if np.max(abs(alpha-color[:,:,3]))>1/255:raise RuntimeError('Color alpha/opacity differ')
            key=row['species'];fingerprint=hashlib.sha256(alpha.tobytes()).hexdigest()
            if key in opacity and opacity[key]!=fingerprint:raise RuntimeError('Leaf front/back silhouettes are not registered')
            opacity[key]=fingerprint
        files=[{'file':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size} for f in sorted(folder.iterdir()) if f.is_file()]
        proof.append({'slug':row['slug'],'files':files,'resolution':[1024,1024],'ormChannelsVerified':True,'normalConvention':'OpenGL +Y','heightBits':16,'source':'AI generated'})
        for image in list(bpy.data.images):bpy.data.images.remove(image)
        print('[Enhanced] Validated PBR '+row['slug'],flush=True)
    write_json(Path(o['output'])/'material-validation.json',{'validated':True,'materials':proof,'leafFrontBackRegistration':opacity})


def texture(nodes,folder,file,color=False):
    node=nodes.new('ShaderNodeTexImage');node.image=bpy.data.images.load(str(folder/file),check_existing=True)
    node.image.colorspace_settings.name='sRGB' if color else 'Non-Color';node.extension='REPEAT' if 'bark' in folder.name else 'EXTEND'
    return node


def material(o,species,role):
    folder=Path(o['root'])/'assets/public/pbr'/f'tree_ai_{species}_{role}'
    if not (folder/'material.json').exists():raise RuntimeError('Publish validated materials before reference authoring')
    meta=json.loads((folder/'material.json').read_text());p=o['profiles'][species]
    mat=bpy.data.materials.new(species+' / AI '+role);mat.use_nodes=True
    mat['catalogMaterial']='pbr.'+folder.name;mat['source']='AI generated'
    nodes,links=mat.node_tree.nodes,mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    color=texture(nodes,folder,'basecolor.png',True);normal=texture(nodes,folder,'normal_opengl.png');orm=texture(nodes,folder,'orm.png')
    split=nodes.new('ShaderNodeSeparateColor');links.new(orm.outputs['Color'],split.inputs[0]);links.new(split.outputs['Green'],bsdf.inputs['Roughness'])
    links.new(color.outputs['Color'],bsdf.inputs['Base Color']);bsdf.inputs['Metallic'].default_value=0;bsdf.inputs['IOR'].default_value=1.42
    normalmap=nodes.new('ShaderNodeNormalMap');normalmap.inputs['Strength'].default_value=p['barkStrength'] if role=='bark' else .38
    links.new(normal.outputs['Color'],normalmap.inputs['Color']);links.new(normalmap.outputs['Normal'],bsdf.inputs['Normal'])
    if role=='bark':
        height=texture(nodes,folder,'height_16bit.png');bump=nodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=meta['displacement']['scale_m'];bump.inputs['Strength'].default_value=.32
        links.new(height.outputs['Color'],bump.inputs['Height']);links.new(normalmap.outputs['Normal'],bump.inputs['Normal']);links.new(bump.outputs[0],bsdf.inputs['Normal'])
        if 'growth' in p and not p.get('forkShoulders',False):
            from bark_flow import fork_material
            fork_material(mat,p['barkTileMetres'])
        if p.get('forkShoulders',False):
            from fork_charts import material_charts
            material_charts(mat)
    else:
        attribute=nodes.new('ShaderNodeAttribute');attribute.attribute_name='leaf_tint';attribute.attribute_type='INSTANCER';multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
        links.new(color.outputs['Color'],multiply.inputs[1]);links.new(attribute.outputs['Color'],multiply.inputs[2]);links.new(multiply.outputs[0],bsdf.inputs['Base Color'])
        translucent=nodes.new('ShaderNodeBsdfTranslucent');links.new(multiply.outputs[0],translucent.inputs['Color'])
        trans=texture(nodes,folder,'translucency.png');weight=nodes.new('ShaderNodeMath');weight.operation='MULTIPLY';weight.inputs[1].default_value=.28
        links.new(trans.outputs['Color'],weight.inputs[0]);mix=nodes.new('ShaderNodeMixShader');links.new(weight.outputs[0],mix.inputs[0]);links.new(bsdf.outputs[0],mix.inputs[1]);links.new(translucent.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],nodes.get('Material Output').inputs['Surface'])
    return mat,meta
