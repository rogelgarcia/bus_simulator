# Builds three-zone canopies while retaining the accepted wood and its photographic PBR maps.
import hashlib
import json
import shutil
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from common import clear_scene,activate,triangles,array,write_json
from source import load,prototypes
from leaf_mesh import templates,leaves,mesh_object
from placement import layout
from wood import pbr_material
from canopy import normalize_glb
from export import finish


def hash_mesh(mesh):
    h=hashlib.sha256();h.update(array(mesh.vertices,'co',3).tobytes());h.update(array(mesh.loops,'vertex_index',dtype=np.int32).tobytes())
    for uv in mesh.uv_layers:h.update(array(uv.data,'uv',2).tobytes())
    return h.hexdigest()


def card_object(model,cards,material):
    points=[];faces=[];uv=[]
    for card in cards:
        start=len(points);tile=card['tile'];xy=np.array([[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]])
        p=np.column_stack([xy*np.array(card['size']),np.zeros(4)])@np.array(card['basis']).T+card['center']
        points.extend(p);faces.extend([[start,start+1,start+2],[start,start+2,start+3]])
        texture=(xy+.5+[tile%4,tile//4])/4;uv.extend(texture[[0,1,2,0,2,3]])
    obj=mesh_object(model+' / interior cards',points,faces,uv,material);obj['surface']='foliage';obj['canopyRole']='interior';return obj


def stems(model,paths,selected,material):
    points=[];faces=[];uv=[]
    for path in paths:
        if path['group'] not in selected:continue
        p=np.array(path['points']);r=np.array(path['radii']);indices=[0,len(p)//2,len(p)-1]
        p=p[indices];r=r[indices]
        for i in range(2):
            direction=p[i+1]-p[i];direction/=np.linalg.norm(direction)
            axis=np.eye(3)[np.argmin(abs(direction))];u=np.cross(direction,axis);u/=np.linalg.norm(u);v=np.cross(direction,u);start=len(points)
            for center,radius in [(p[i],r[i]),(p[i+1],r[i+1])]:
                for j in range(3):points.append(center+radius*(u*np.cos(j*np.pi*2/3)+v*np.sin(j*np.pi*2/3)))
            for j in range(3):
                k=(j+1)%3;faces.extend([[start+j,start+k,start+3+k],[start+j,start+3+k,start+3+j]])
                uv.extend([[j/3,0],[(j+1)/3,0],[(j+1)/3,.1],[j/3,0],[(j+1)/3,.1],[j/3,.1]])
    obj=mesh_object(model+' / reduced curved branchlets',points,faces,uv,material);obj['surface']='wood';return obj


def run(options):
    for row in options['sources']:
        model=row['id'];species,variant=model.split('/');directory=Path(options['output'])/model;directory.mkdir(parents=True,exist_ok=True)
        if (directory/'model.json').exists():raise RuntimeError('Preserve completed model; select only remaining models or choose fresh output')
        clear_scene();objects,data=load(row);forms=prototypes(model);position=objects[0].location.copy()
        source_paths=json.loads(Path(row['shootFile']).read_text())['paths']
        atlas=json.loads((directory.parent/'canopy/atlas.json').read_text())
        recipe=json.loads((Path(options['root'])/'tools/bake_vegetation'/species/'recipe.json').read_text());kind=recipe['texture']['leaf']
        template,audit=templates(forms,kind,atlas)
        for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)
        seed=next(v['seed'] for v in recipe['variants'] if v['id']==variant)
        cards,detail,middle,selected,group_records=layout(data,source_paths,atlas,species,seed,options['card-scale'])
        images={}
        for channel in ['color','normal','orm']:
            image=bpy.data.images.load(str(directory.parent/'canopy'/f'leaf_{channel}.png'),check_existing=False)
            image.name='leaf_'+channel;image.colorspace_settings.name='sRGB' if channel=='color' else 'Non-Color';images[channel]=image
        cardmat=pbr_material(species+' / LOD0 spray cards',images,True);cardmat.use_backface_culling=False
        leafmat=pbr_material(species+' / opaque leaves',images,False);leafmat.use_backface_culling=False
        nodes,links=leafmat.node_tree.nodes,leafmat.node_tree.links
        color=nodes.new('ShaderNodeVertexColor');color.layer_name='Color';mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
        bsdf=nodes.get('Principled BSDF');links.new(bsdf.inputs['Base Color'].links[0].from_socket,mix.inputs[1]);links.new(color.outputs['Color'],mix.inputs[2]);links.new(mix.outputs[0],bsdf.inputs['Base Color'])
        core=card_object(model,cards,cardmat)
        outer=leaves(model,data,detail,template[0],leafmat,'detailed leaves')
        transition=leaves(model,data,middle,template[1],leafmat,'simple volume leaves')
        source=Path(options['wood'])/model
        with bpy.data.libraries.load(str(source/'wood.blend'),link=False) as (available,loaded):loaded.objects=[model+' / LOD0 wood']
        wood=loaded.objects[0];bpy.context.scene.collection.objects.link(wood);wood_hash=hash_mesh(wood.data)
        wood.location=(0,0,0)
        for channel in ['color','normal','orm']:
            shutil.copy2(source/f'bark_{channel}.png',directory/f'bark_{channel}.png')
        for name in ['wood.blend','wood.json']:shutil.copy2(source/name,directory/name)
        woody=stems(model,source_paths,selected,wood.data.materials[0])
        objects=[wood,woody,core,outer,transition]
        for obj in objects:
            obj['referenceModel']=model;obj['variant']=variant;obj['lodLevel']=0
        if hash_mesh(wood.data)!=wood_hash:raise RuntimeError('Accepted structural wood changed')
        activate(wood,objects[1:]);file=directory/(variant+'_lod0.glb')
        bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,
            export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_animations=False,export_cameras=False,export_lights=False)
        normalize_glb(file,True)
        finish(file)
        bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(directory/(variant+'_lod0.blend')),compress=True)
        counts=[triangles(obj.data) for obj in objects]
        if any(not np.isfinite(array(o.data.vertices,'co',3)).all() for o in objects):raise RuntimeError('Nonfinite output geometry')
        stats={'id':model,'revision':'hybrid-three-zone-v1','referenceSha256':row['sha256'],'codeIdentity':options['codeIdentity'],
            'woodTriangles':counts[0]+counts[1],'structuralWoodTriangles':counts[0],'branchletTriangles':counts[1],
            'canopyTriangles':sum(counts[2:]),'cardTriangles':counts[2],'detailedLeafTriangles':counts[3],'simpleLeafTriangles':counts[4],
            'totalTriangles':sum(counts),'detailedLeaves':len(detail),'simpleLeaves':len(middle),'cards':len(cards),'referenceLeaves':row['leafCount'],
            'acceptedWoodFingerprint':wood_hash,'acceptedWoodPreserved':True,'position':list(position),'atlasLayouts':8,'cardScale':options['card-scale'],
            'opaqueLeafTemplates':audit,'files':[file.name,variant+'_lod0.blend'],'glbBytes':file.stat().st_size,
            'materialDrawsPerModel':5,'leafGeometryDoubleSided':True,'sourceGroupsDisjoint':True,'wind':'Not rigged',
            'limitations':['Card placement uses an exposure proxy, not guaranteed occlusion for every viewpoint',
                'Alpha cards share the front tissue color on their reverse; leaf micro-serration is simplified',
                'Gameplay GPU time has not been measured; triangle and alpha-footprint metrics are workload proxies']}
        write_json(directory/'model.json',stats)
        write_json(directory/'layout.json',{'cards':cards,'meshGroups':group_records,'detailedLeafIndices':detail.tolist(),'simpleLeafIndices':middle.tolist()})
        print(f'[Hybrid] {model}: {counts} triangles; {len(detail)} detailed / {len(middle)} simple leaves / {len(cards)} cards',flush=True)
