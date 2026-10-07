# Captures original photographic leaf shells and attached branching twigs into the existing exterior atlas slots.
import json
from pathlib import Path

import bpy
import numpy as np

from anatomy import branchlet, twig_mesh, unit
from atlas import bleed, capture_pass, mip_chain, write_pixels
from common import array, clear_scene, configure, load_reference, write_json
from core_atlas import read_images

RATIOS = {'plane':1.02, 'linden':1.10, 'oak':1.85, 'elm':1.85, 'viburnum':1.35}


def prototypes(options, species):
    model = species+'/mature_01'
    objects = load_reference({**options, 'source': options['scene']}, [f'{model}_form_{i:02}' for i in range(9)])
    result = []
    for obj in objects:
        mesh = obj.data; mesh.calc_loop_triangles()
        loops = array(mesh.loop_triangles,'loops',3,np.int32)
        result.append({'points':array(mesh.vertices,'co',3), 'faces':array(mesh.loop_triangles,'vertices',3,np.int32),
                       'uv':array(mesh.uv_layers.active.data,'uv',2)[loops].reshape((-1,2)), 'material':mesh.materials[0]})
        bpy.data.objects.remove(obj,do_unlink=True)
    return result


def capture(options, species, level, source_atlas, directory):
    clear_scene(); forms = prototypes(options,species)
    recipe = json.loads((Path(options['root'])/'tools/bake_vegetation'/species/'recipe.json').read_text())
    kind = recipe['texture']['leaf']; tile_size = source_atlas['size'][0]//8
    source_tiles = sorted([row for row in source_atlas['tiles'] if row['kind']=='outer'], key=lambda row:row['tile'])
    counts = [8,9,10] if level == 0 else [max(8,row['leavesPerPatch']) for row in source_tiles]
    materials = [forms[0]['material'].copy(),forms[8]['material'].copy()]
    vertices, faces, uv, indices, colors, records = [],[],[],[],[],[]
    offset = 0
    for tile, count in enumerate(counts):
        graph = branchlet(count,5940+sum(map(ord,species))*7+tile*31,kind=='viburnum')
        pieces=[]
        for leaf in graph['leaves']:
            template=forms[leaf['form']]; p=template['points'].astype(np.float64).copy()
            base=p[np.argmin(p[:,1])].copy(); base[0]=0; base[2]=0
            width=leaf['width']; length=width*RATIOS[kind]
            direction=leaf['direction']; side=np.cross(direction,[0,0,1]); face=np.array([0.,0.,1.])
            roll=leaf['roll']; transverse=side*np.cos(roll)+face*np.sin(roll); normal=np.cross(transverse,direction)
            matrix=np.column_stack([transverse*width,direction*length,normal*length])
            points=(p-base)@matrix.T+leaf['attachment']
            pieces.append((points,template['faces'],template['uv'],0,leaf['tint']))
        pieces.append((*twig_mesh(graph,.0031 if level==0 else .0026),1,1.0))
        bounds=np.concatenate([piece[0] for piece in pieces]); low=bounds.min(axis=0); high=bounds.max(axis=0)
        span=high-low; center=(high+low)*.5
        for points, triangles, texture_uv, material, tint in pieces:
            p=points.copy(); p[:,:2]=(p[:,:2]-center[:2])/span[:2]*.92+[tile+.5,.5]
            p[:,2]=(p[:,2]-center[2])/max(span[:2])
            vertices.append(p); faces.append(triangles+offset); uv.append(texture_uv)
            indices.extend([material]*len(triangles)); colors.extend([[tint,tint,tint,1]]*len(p)); offset+=len(p)
        records.append({'tile':45+tile,'kind':'outer','leaves':count,'twigEdges':len(graph['edges']),
            'seed':graph['seed'],'arrangement':'opposite pairs' if graph['opposite'] else 'alternate leaves on irregular shoots',
            'nodes':[p.tolist() for p in graph['nodes']], 'edges':graph['edges'],
            'attachments':[{'position':leaf['attachment'].tolist(),'shoot':leaf['shoot'],'station':leaf['station']} for leaf in graph['leaves']],
            'rootUV':((graph['nodes'][0][:2]-center[:2])/span[:2]*.92+.5).tolist(),
            'tipUV':((graph['nodes'][graph['tip']][:2]-center[:2])/span[:2]*.92+.5).tolist(),
            'physicalAspect':float(span[0]/span[1])})
    mesh=bpy.data.meshes.new('Connected branchlets from original photo leaf shells')
    mesh.from_pydata(np.concatenate(vertices).tolist(),[],np.concatenate(faces).tolist())
    mesh.uv_layers.new().data.foreach_set('uv',np.concatenate(uv).ravel())
    mesh.polygons.foreach_set('use_smooth',[True]*len(mesh.polygons)); mesh.polygons.foreach_set('material_index',indices)
    mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT').data.foreach_set('color',np.asarray(colors,np.float32).ravel())
    for material in materials: mesh.materials.append(material)
    obj=bpy.data.objects.new('Original connected leafy branchlets',mesh); bpy.context.scene.collection.objects.link(obj)
    scene=configure(options); scene.render.threads=2; scene.cycles.samples=16; scene.cycles.use_adaptive_sampling=False
    scene.render.film_transparent=True; scene.render.resolution_x=tile_size*3; scene.render.resolution_y=tile_size
    scene.render.resolution_percentage=100; scene.render.image_settings.file_format='OPEN_EXR'
    scene.render.image_settings.color_mode='RGBA'; scene.render.image_settings.color_depth='32'
    camera=bpy.data.objects.new('Branchlet orthographic camera',bpy.data.cameras.new('Branchlet orthographic camera'))
    scene.collection.objects.link(camera); camera.location=(1.5,.5,4); camera.data.type='ORTHO'; camera.data.ortho_scale=3; scene.camera=camera
    bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=str(directory/'branchlets_source.blend'),compress=True)
    values={channel:capture_pass(scene,materials,channel,directory) for channel in ['color','normal','roughness']}
    values['orm']=np.ones_like(values['color']); values['orm'][:,:,1]=values['roughness'][:,:,0]; values['orm'][:,:,2]=0
    mask=values['color'][:,:,3]>.98
    for channel in ['color','normal','orm']: values[channel]=bleed(values[channel],mask,5)
    v=values['normal'][:,:,:3]*2-1
    for i,record in enumerate(records):
        aspect=record['physicalAspect']; v[:,i*tile_size:(i+1)*tile_size,:2]/=[min(1.,aspect),min(1.,1/aspect)]
    v/=np.maximum(np.linalg.norm(v,axis=2,keepdims=True),1e-8); values['normal'][:,:,:3]=v*.5+.5
    for i, record in enumerate(records): record['alphaOccupancy']=float(np.mean(values['color'][:,i*tile_size:(i+1)*tile_size,3]>=.5))
    write_pixels('Branchlet proof',values['color'],directory/'branchlets.png',True)
    return values,records


def build_atlases(options):
    for species in dict.fromkeys(model.split('/')[0] for model in options['models']):
        for level in options['levels']:
            source=Path(options[f'source{level}'])/species/'canopy'
            directory=Path(options['output'])/f'lod{level}'/species/'canopy'; directory.mkdir(parents=True,exist_ok=True)
            previous=json.loads((source/'atlas.json').read_text())
            values,records=capture(options,species,level,previous,directory)
            images=read_images(source); tile=images['color'].shape[1]//8
            for i in range(3):
                x,y=(45+i)%8*tile,(45+i)//8*tile
                for channel in images: images[channel][y:y+tile,x:x+tile]=values[channel][:,i*tile:(i+1)*tile]
            for channel,pixels in images.items(): write_pixels('leaf_'+channel,pixels,directory/f'leaf_{channel}.png',channel=='color')
            mips=mip_chain(directory,*[images[key].copy() for key in ['color','normal','orm']])
            write_json(directory/'atlas.json',{**previous,'tiles':[row for row in previous['tiles'] if row['kind']=='core']+records,
                'mips':mips,'method':'Connected branching twigs with attached original photographic 3D leaf shells; preserved interior pixels',
                'source':str(source),'revision':'AI594-branchlets','lightingBaked':False})
            print(f'[Branchlets] LOD{level} {species}: {[r["leaves"] for r in records]} leaves; coverage {[round(r["alphaOccupancy"],3) for r in records]}',flush=True)
