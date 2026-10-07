# Captures unlit color, tangent-frame normals and roughness from photographic source geometry into guarded tiles.
import math
from pathlib import Path
import bpy
import numpy as np
from atlas import bleed, write_pixels
from common import configure


def basis(azimuth, elevation=0):
    a, e = np.radians([azimuth, elevation])
    normal = np.array([np.cos(a)*np.cos(e), np.sin(a)*np.cos(e), np.sin(e)])
    right = np.array([-np.sin(a), np.cos(a), 0.])
    up = np.cross(normal, right)
    return np.column_stack([right, up, normal])


def panel(parts, azimuth, elevation=0, **extra):
    axes = basis(azimuth, elevation)
    points = np.concatenate([p['points'].reshape((-1,3)) for p in parts])
    projected = points @ axes
    low, high = projected.min(axis=0), projected.max(axis=0)
    center = (low+high)*.5
    if extra.get('role')=='wood':
        roots=points[points[:,2]<=points[:,2].min()+.15]
        center[2]=np.median(roots,axis=0)@axes[:,2]
    size = (high-low)[:2]*1.055
    return {'parts': parts, 'basis': axes, 'center': axes@center, 'size': size,
            'azimuthDegrees': float(azimuth), 'elevationDegrees': float(elevation), **extra}


def surface_material(original, channel):
    material = original.copy()
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    emission = nodes.new('ShaderNodeEmission')
    if channel in ['color', 'orm']:
        socket = bsdf.inputs['Base Color' if channel == 'color' else 'Roughness']
        if socket.is_linked:
            links.new(socket.links[0].from_socket, emission.inputs['Color'])
        else:
            value = socket.default_value
            emission.inputs['Color'].default_value = value if channel == 'color' else (value,value,value,1)
    else:
        socket = bsdf.inputs['Normal']
        normal = socket.links[0].from_socket if socket.is_linked else nodes.new('ShaderNodeNewGeometry').outputs['Normal']
        split = nodes.new('ShaderNodeSeparateXYZ'); links.new(normal, split.inputs[0])
        absolute = nodes.new('ShaderNodeMath'); absolute.operation='ABSOLUTE'; links.new(split.outputs['Z'], absolute.inputs[0])
        combined = nodes.new('ShaderNodeCombineXYZ')
        links.new(split.outputs['X'], combined.inputs['X']); links.new(split.outputs['Y'], combined.inputs['Y']); links.new(absolute.outputs[0], combined.inputs['Z'])
        encode = nodes.new('ShaderNodeVectorMath'); encode.operation='MULTIPLY_ADD'
        links.new(combined.outputs[0], encode.inputs[0]); encode.inputs[1].default_value=(.5,.5,.5); encode.inputs[2].default_value=(.5,.5,.5)
        links.new(encode.outputs[0], emission.inputs['Color'])
    if bsdf.inputs['Alpha'].is_linked:
        threshold=nodes.new('ShaderNodeMath'); threshold.operation='GREATER_THAN'; threshold.inputs[1].default_value=.5
        links.new(bsdf.inputs['Alpha'].links[0].from_socket, threshold.inputs[0])
        transparent=nodes.new('ShaderNodeBsdfTransparent'); mix=nodes.new('ShaderNodeMixShader')
        links.new(threshold.outputs[0],mix.inputs[0]); links.new(transparent.outputs[0],mix.inputs[1]); links.new(emission.outputs[0],mix.inputs[2])
        output=mix.outputs[0]
    else:
        output=emission.outputs[0]
    links.new(output,nodes.get('Material Output').inputs['Surface'])
    return material


def capture_tiles(options, panels, directory, tile_size, normal_filter=False, prefix='distant'):
    directory=Path(directory); directory.mkdir(parents=True,exist_ok=True)
    cols=4; rows=math.ceil(len(panels)/cols)
    created=[]; originals=[]
    for index, item in enumerate(panels):
        span=float(max(item['size'])); col,row=index%cols,index//cols
        half=item['size']/span*.5
        item['tile']=index
        item['uv']=[(col+.5-half[0])/cols,(row+.5-half[1])/rows,(col+.5+half[0])/cols,(row+.5+half[1])/rows]
        for part in item['parts']:
            positions=(part['points']-item['center'])@item['basis']/span
            positions[:,:,:2]+=[col+.5,row+.5]
            mesh=bpy.data.meshes.new(f'Tile {index} source')
            mesh.from_pydata(positions.reshape((-1,3)).tolist(),[],np.arange(positions.size//3).reshape((-1,3)).tolist())
            mesh.uv_layers.new().data.foreach_set('uv',part['uv'].astype(np.float32).ravel())
            mesh.polygons.foreach_set('use_smooth',[True]*len(mesh.polygons))
            mesh.normals_split_custom_set((part['normals']@item['basis']).reshape((-1,3)).tolist())
            mesh.materials.append(part['material'])
            obj=bpy.data.objects.new(f'Tile {index} source',mesh); bpy.context.scene.collection.objects.link(obj)
            created.append(obj); originals.append(part['material'])
    scene=configure(options); scene.render.threads=2; scene.cycles.samples=4; scene.cycles.use_adaptive_sampling=False
    scene.cycles.transparent_max_bounces=128; scene.cycles.max_bounces=0
    scene.render.film_transparent=True; scene.render.resolution_x=cols*tile_size; scene.render.resolution_y=rows*tile_size
    scene.render.resolution_percentage=100; scene.render.image_settings.file_format='OPEN_EXR'
    scene.render.image_settings.color_mode='RGBA'; scene.render.image_settings.color_depth='32'
    scene.world=bpy.data.worlds.new('Material capture world'); scene.world.use_nodes=True
    scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(0,0,0,1)
    camera=bpy.data.objects.new('Material atlas camera',bpy.data.cameras.new('Material atlas camera'))
    bpy.context.scene.collection.objects.link(camera); camera.location=(cols/2,rows/2,100)
    camera.data.type='ORTHO'; camera.data.ortho_scale=max(cols,rows); camera.data.clip_end=200; scene.camera=camera
    images={}; mask=None
    for channel in ['color','normal','orm']:
        cache={}
        for obj, original in zip(created, originals):
            key=original.as_pointer()
            if key not in cache: cache[key]=surface_material(original,channel)
            obj.data.materials[0]=cache[key]
        scene.render.filepath=str(directory/f'capture_{channel}.exr')
        bpy.ops.render.render(write_still=True)
        image=bpy.data.images.load(scene.render.filepath,check_existing=False)
        values=np.array(image.pixels[:],np.float32).reshape((rows*tile_size,cols*tile_size,4))
        bpy.data.images.remove(image)
        alpha=values[:,:,3:4].copy()
        values[:,:,:3]/=np.maximum(alpha,1e-6)
        if channel=='color':
            mask=alpha[:,:,0]>.9
            for index,item in enumerate(panels):
                x,y=index%cols*tile_size,index//cols*tile_size
                patch=alpha[y:y+tile_size,x:x+tile_size,0]
                occupancy=float(np.mean(patch>=.5))
                if occupancy<.002 or np.any(np.r_[patch[0],patch[-1],patch[:,0],patch[:,-1]]>=.5):
                    raise RuntimeError(f'Atlas tile {index} is empty or clipped: {occupancy}')
                item['alphaOccupancy']=occupancy
        if channel=='normal':
            normal=values[:,:,:3]*2-1
            if normal_filter:
                weighted=normal*alpha; weight=alpha.copy()
                for axis,shift in [(0,-1),(0,1),(1,-1),(1,1)]:
                    weighted+=np.roll(normal*alpha,shift,axis=axis)*.5
                    weight+=np.roll(alpha,shift,axis=axis)*.5
                normal=weighted/np.maximum(weight,1e-6)
            normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-6)
            values[:,:,:3]=normal*.5+.5
        if channel=='orm':
            values[:,:,1]=values[:,:,0]; values[:,:,0]=1; values[:,:,2]=0
        values=bleed(values,mask,6)
        images[channel]=write_pixels(prefix+'_'+channel,values,directory/f'{prefix}_{channel}.png',channel=='color')
        for material in cache.values(): bpy.data.materials.remove(material)
    for obj in created: bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.objects.remove(camera,do_unlink=True)
    return images


def serial_panel(item):
    return {k:(v.tolist() if isinstance(v,np.ndarray) else v) for k,v in item.items() if k!='parts'}
