# Reprojects photographic bark into fresh coarse-stem UVs to avoid stretched source atlas charts.
import bpy
import numpy as np
from common import activate, configure
from atlas import bleed, write_pixels
from wood import pbr_material


def bake_image(name,width,height):
    image=bpy.data.images.new(name,width,height,alpha=True,float_buffer=True)
    # Cycles encodes even float sRGB bake targets. The PNG writer performs that conversion once.
    image.colorspace_settings.name='Non-Color'
    return image


def bake_stem(options, parts, low, directory):
    part=next(p for p in parts if not p['leaf'])
    mesh=bpy.data.meshes.new('Accepted bark projection source')
    points=part['points'].reshape((-1,3))
    mesh.from_pydata(points.tolist(),[],np.arange(len(points)).reshape((-1,3)).tolist())
    mesh.uv_layers.new().data.foreach_set('uv',part['uv'].astype(np.float32).ravel())
    mesh.polygons.foreach_set('use_smooth',[True]*len(mesh.polygons));mesh.normals_split_custom_set(part['normals'].reshape((-1,3)).tolist())
    original=part['material'].copy();mesh.materials.append(original)
    high=bpy.data.objects.new('Accepted bark projection source',mesh);bpy.context.scene.collection.objects.link(high)
    target=bpy.data.materials.new('Coarse stem bake target');target.use_nodes=True
    low.data.materials.clear();low.data.materials.append(target)
    active=target.node_tree.nodes.new('ShaderNodeTexImage');target.node_tree.nodes.active=active
    scene=configure(options);scene.render.threads=2;scene.cycles.samples=1
    scene.render.bake.use_selected_to_active=True;scene.render.bake.cage_extrusion=.7
    scene.render.bake.max_ray_distance=2.;scene.render.bake.margin=6;scene.render.bake.margin_type='EXTEND'
    nodes,links=original.node_tree.nodes,original.node_tree.links
    output=nodes.get('Material Output');surface=output.inputs['Surface'].links[0].from_socket
    bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');images={}
    for channel in ['color','normal','orm']:
        image=bake_image('Rebaked bark '+channel,256,512);active.image=image
        if channel=='normal':links.new(surface,output.inputs['Surface'])
        else:
            source=bsdf.inputs['Base Color' if channel=='color' else 'Roughness']
            emission=nodes.new('ShaderNodeEmission')
            if source.is_linked:links.new(source.links[0].from_socket,emission.inputs['Color'])
            else:
                value=source.default_value;emission.inputs['Color'].default_value=value if channel=='color' else (value,value,value,1)
            links.new(emission.outputs[0],output.inputs['Surface'])
        activate(low,[high]);bpy.ops.object.bake(type='NORMAL' if channel=='normal' else 'EMIT',normal_space='TANGENT',use_clear=True)
        pixels=np.array(image.pixels[:],np.float32).reshape((512,256,4))
        mask=np.linalg.norm(pixels[:,:,:3],axis=2)>.002
        if channel=='orm':pixels[:,:,1]=pixels[:,:,0];pixels[:,:,0]=1;pixels[:,:,2]=0
        if not mask.any():raise RuntimeError('Coarse stem bark projection missed the source')
        pixels=bleed(pixels,mask,256);pixels[:,:,3]=1
        if channel=='normal':
            # Bark ridges below a distant texel would otherwise shimmer and compress poorly.
            vectors=pixels[:,:,:3]*2-1
            filtered=vectors.copy()
            for axis,shift in [(0,-1),(0,1),(1,-1),(1,1)]:filtered+=np.roll(vectors,shift,axis=axis)*.5
            filtered/=np.maximum(np.linalg.norm(filtered,axis=2,keepdims=True),1e-6)
            pixels[:,:,:3]=filtered*.5+.5
        images[channel]=write_pixels('bark_'+channel,pixels,directory/f'bark_{channel}.png',channel=='color')
        bpy.data.images.remove(image)
    low.data.materials.clear();low.data.materials.append(pbr_material('Distant wood geometry',images))
    low['barkUvMethod']='Fresh cylindrical UVs and selected-to-active photographic PBR bake'
    bpy.data.objects.remove(high,do_unlink=True)
