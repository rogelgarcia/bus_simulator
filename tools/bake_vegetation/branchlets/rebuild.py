# Reorients exterior branchlets and patches their geometry into immutable accepted GLB containers.
import copy
import hashlib
import json
import shutil
import struct
from pathlib import Path

import bpy
import numpy as np
from mathutils import Euler

from common import activate, clear_scene, foliage_data, load_reference, write_json
from core_atlas import read_images
from core_cards import mesh_for
from canopy import normalize_glb
from wood import pbr_material
from lod1_coverage import measure


def read_glb(file):
    raw=file.read_bytes(); length=struct.unpack_from('<I',raw,12)[0]
    return json.loads(raw[20:20+length]),raw[28+length:]


def save_glb(file,doc,blocks):
    binary=b''
    for view,block in zip(doc['bufferViews'],blocks):
        view['byteOffset']=len(binary); view['byteLength']=len(block)
        binary+=block+b'\0'*((-len(block))%4)
    doc['buffers'][0]['byteLength']=len(binary)
    encoded=json.dumps(doc,separators=(',',':')).encode(); encoded+=b' '*((-len(encoded))%4)
    file.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(binary))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(binary),b'BIN\0')+binary)


def patch_glb(source,outer,file,canopy):
    doc,bin=read_glb(source); new,new_bin=read_glb(outer)
    blocks=[bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']] for v in doc['bufferViews']]
    old_primitive=next(mesh['primitives'][0] for mesh in doc['meshes'] if 'outer' in mesh['name'])
    primitive=new['meshes'][0]['primitives'][0]
    mapping={}
    for index in list(primitive['attributes'].values())+[primitive['indices']]:
        accessor=copy.deepcopy(new['accessors'][index]); view=copy.deepcopy(new['bufferViews'][accessor['bufferView']])
        blocks.append(new_bin[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])
        accessor['bufferView']=len(doc['bufferViews']); doc['bufferViews'].append(view)
        mapping[index]=len(doc['accessors']); doc['accessors'].append(accessor)
    old_primitive['attributes']={key:mapping[value] for key,value in primitive['attributes'].items()}
    old_primitive['indices']=mapping[primitive['indices']]
    for image in doc['images']:
        if image['name'].startswith('leaf_'):
            channel=next(key for key in ['color','normal','orm'] if key in image['name'])
            blocks[image['bufferView']]=(canopy/f'leaf_{channel}.png').read_bytes()
    doc.setdefault('extras',{})['canopyRevision']='AI594 connected branchlets; wood/core accessors preserved'
    save_glb(file,doc,blocks)


def growth_directions(options,model):
    clear_scene(); foliage=load_reference({**options,'source':options['scene']},[model+' / solid leaves'])[0]
    data=foliage_data(foliage)
    recipe=json.loads((Path(options['root'])/'tools/bake_vegetation'/model.split('/')[0]/'recipe.json').read_text())
    ids=np.arange(1,len(data['forms']),recipe['texture']['leafCount']+2)
    directions=np.array([np.array(Euler(v).to_matrix())[:,1] for v in data['rotations'][ids]])
    centers=data['origins'][ids]+directions*data['scales'][ids,1:2]*.6
    clear_scene()
    return centers,directions


def placement(previous,centers,directions,old_images,new_images,atlas):
    layout=copy.deepcopy(previous); records={row['tile']:row for row in atlas['tiles'] if row['kind']=='outer'}
    old_tile=old_images['color'].shape[1]//8; new_tile=new_images['color'].shape[1]//8
    ratios={}
    for tile in records:
        x,y=tile%8*old_tile,tile//8*old_tile
        old=float(np.mean(old_images['color'][y:y+old_tile,x:x+old_tile,3]>=.5))
        ratios[tile]=min(1.38,max(.94,np.sqrt(old/max(records[tile]['alphaOccupancy'],.01))))
    for plane in layout['planes'][15:]:
        position=np.asarray(plane['center']); basis=np.asarray(plane['basis']); old_size=np.asarray(plane['size'])
        nearest=int(np.argmin(np.sum((centers-position)**2,axis=1)))
        growth=directions[nearest]; normal=basis[:,2]
        y=growth-normal*(normal@growth)
        if np.linalg.norm(y)<.10: y=basis[:,1]*(1 if basis[:,1]@growth>=0 else -1)
        y/=np.linalg.norm(y); x=np.cross(y,normal)
        aspect=records[plane['tile']]['physicalAspect']
        area=np.prod(old_size)*ratios[plane['tile']]**2
        size=np.sqrt(area*np.array([aspect,1/aspect]))
        shift=-y*(size[1]-old_size[1])*.32
        plane.update(center=(position+shift).tolist(),basis=np.column_stack([x,y,normal]).tolist(),size=size.tolist(),
                     growthDirection=growth.tolist(),referenceSpray=nearest,areaCompensation=ratios[plane['tile']])
    layout['revision']='AI594 connected branchlets aligned to original reference shoots'
    return layout


def build(options):
    for model in options['models']:
        centers,directions=growth_directions(options,model)
        for level in options['levels']:
            clear_scene(); source=Path(options[f'source{level}']); output=Path(options['output'])/f'lod{level}'
            directory=output/model; directory.mkdir(parents=True,exist_ok=True)
            species,variant=model.split('/'); canopy=output/species/'canopy'
            atlas=json.loads((canopy/'atlas.json').read_text()); previous=json.loads((source/model/'layout.json').read_text())
            layout=placement(previous,centers,directions,read_images(source/species/'canopy'),read_images(canopy),atlas)
            write_json(directory/'layout.json',layout)
            images={}
            for channel in ['color','normal','orm']:
                image=bpy.data.images.load(str(canopy/f'leaf_{channel}.png'),check_existing=False)
                image.colorspace_settings.name='sRGB' if channel=='color' else 'Non-Color'; images[channel]=image
            material=pbr_material(species+f' / LOD{level} spray cards',images,True); material.use_backface_culling=False
            outer=mesh_for(model,'outer',layout['planes'],material); activate(outer)
            temporary=directory/'outer.glb'
            bpy.ops.export_scene.gltf(filepath=str(temporary),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,
                export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_animations=False)
            normalize_glb(temporary,True)
            stem=variant+f'_lod{level}'; file=directory/(stem+'.glb')
            patch_glb(source/model/(stem+'_source.glb'),temporary,file,canopy)
            mesh_for(model,'core',layout['planes'],material)
            with bpy.data.libraries.load(str(source/model/'wood.blend'),link=False) as (available,loaded): loaded.objects=[model+f' / LOD{level} wood']
            wood=loaded.objects[0]; bpy.context.scene.collection.objects.link(wood)
            bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=str(directory/(stem+'.blend')),compress=True)
            for file_to_copy in ['wood.blend','wood.json','bark_color.png','bark_normal.png','bark_orm.png']:
                shutil.copy2(source/model/file_to_copy,directory/file_to_copy)
            stats=json.loads((source/model/'model.json').read_text())
            stats.update(lodLevel=level,files=[stem+'.glb',stem+'.blend'],glbBytes=file.stat().st_size,canopyRevision='AI594 branchlets',
                canopyMethod='Connected photographic leaf branchlets aligned with reference shoot growth',
                sourceGlbSha256=hashlib.sha256((source/model/(stem+'.glb')).read_bytes()).hexdigest(),
                limitations=['Flattened branchlet depth; same tissue color on reverse face','Wind and gameplay timing remain unmeasured'])
            stats.pop('textureCompression',None); write_json(directory/'model.json',stats)
            measure({**options,'source':str(source),'output':str(output)},model)
            print(f'[Branchlets] Rebuilt LOD{level} {model}; accepted wood/core retained',flush=True)
