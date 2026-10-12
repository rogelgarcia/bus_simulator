# Authors planar connected branchlets and photographs their unlit PBR channels.
from pathlib import Path
import json
import bpy
import numpy as np
import atlas
from anatomy import branchlet,twig_mesh
from common import clear_scene,configure,write_json
from source import load,prototypes
from leaf_geometry import LENGTH_RATIO

COLS=ROWS=4
TILE=512


def assemble(forms,kind):
    vertices=[];faces=[];uv=[];materials=[];colors=[];records=[];offset=0
    for tile in range(16):
        pieces=[];graph=None
        if tile<8:
            count=[10,12,14,16,18,20,22,24][tile]
            graph=branchlet(count,12701+tile*137+sum(map(ord,kind)),kind=='viburnum')
            for node in graph['nodes']:node[2]=0
            for leaf in graph['leaves']:
                leaf['attachment'][2]=0;leaf['direction'][2]=0;leaf['direction']/=np.linalg.norm(leaf['direction'])
                p=forms[leaf['form']]['points'].copy();base=p[np.argmin(p[:,1])].copy();base[0]=base[2]=0
                aim=leaf['direction'];side=np.cross(aim,[0,0,1]);w=leaf['width'];length=w*LENGTH_RATIO[kind]
                matrix=np.column_stack([side*w,aim*length,np.array([0,0,1])*length])
                points=(p-base)@matrix.T+leaf['attachment'];pieces.append((points,forms[leaf['form']]['faces'],forms[leaf['form']]['uv'],0,leaf['tint']))
            pieces.append((*twig_mesh(graph,.0042),1,1.))
        else:
            f=forms[tile-8];pieces.append((f['points'].copy(),f['faces'],f['uv'],0,1.))
        bounds=np.concatenate([p[0] for p in pieces]);low=bounds.min(axis=0);high=bounds.max(axis=0);center=(low+high)*.5
        extent=float(max((high-low)[:2]));scale=.90/extent
        for points,tris,tex,material,tint in pieces:
            p=(points-center)*scale+[tile%4+.5,tile//4+.5,0]
            vertices.append(p);faces.append(tris+offset);uv.append(tex);materials.extend([material]*len(tris));colors.extend([[tint,tint,tint,1]]*len(p));offset+=len(p)
        records.append({'tile':tile,'kind':'branchlet' if tile<8 else 'single','leaves':len(graph['leaves']) if graph else 1,
            'center':center.tolist(),'extent':extent,'scale':scale,'size':(high-low).tolist(),
            'leafWidth':float(np.mean([l['width'] for l in graph['leaves']])) if graph else 1,
            'root':graph['nodes'][0].tolist() if graph else [0,0,0],
            'nodes':[p.tolist() for p in graph['nodes']] if graph else [],'edges':graph['edges'] if graph else [],
            'attachments':[l['attachment'].tolist() for l in graph['leaves']] if graph else [],
            'planarAttachmentError':max(abs(l['attachment'][2]) for l in graph['leaves']) if graph else 0})
    mesh=bpy.data.meshes.new('Flat branchlets and single reference leaves');mesh.from_pydata(np.concatenate(vertices).tolist(),[],np.concatenate(faces).tolist())
    mesh.uv_layers.new().data.foreach_set('uv',np.concatenate(uv).ravel());mesh.polygons.foreach_set('material_index',materials)
    mesh.polygons.foreach_set('use_smooth',[True]*len(mesh.polygons))
    mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT').data.foreach_set('color',np.asarray(colors,np.float32).ravel())
    mats=[forms[0]['material'].copy(),forms[8]['material'].copy()]
    for mat in mats:mesh.materials.append(mat)
    obj=bpy.data.objects.new('Flat atlas authoring',mesh);bpy.context.scene.collection.objects.link(obj)
    return mats,records


def run(options):
    for species in dict.fromkeys(r['id'].split('/')[0] for r in options['sources']):
        row=next(r for r in options['sources'] if r['id'].split('/')[0]==species)
        directory=Path(options['output'])/species/'canopy';directory.mkdir(parents=True,exist_ok=True)
        if (directory/'atlas.json').exists():raise RuntimeError('Preserve completed atlas; use a fresh output or proceed to build')
        clear_scene();objects,_=load(row);forms=prototypes(row['id'])
        for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)
        recipe=json.loads((Path(options['root'])/'tools/bake_vegetation'/species/'recipe.json').read_text());kind=recipe['texture']['leaf']
        mats,records=assemble(forms,kind)
        scene=configure(options);scene.render.threads=4;scene.cycles.samples=12;scene.cycles.use_adaptive_sampling=False
        scene.render.film_transparent=True;scene.render.resolution_x=COLS*TILE;scene.render.resolution_y=ROWS*TILE;scene.render.resolution_percentage=100
        scene.render.image_settings.file_format='OPEN_EXR';scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.color_depth='32'
        camera=bpy.data.objects.new('Flat atlas camera',bpy.data.cameras.new('Flat atlas camera'));scene.collection.objects.link(camera)
        camera.location=(2,2,6);camera.data.type='ORTHO';camera.data.ortho_scale=4;scene.camera=camera
        bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(directory/'flat_authoring.blend'),compress=True)
        values={c:atlas.capture_pass(scene,mats,c,directory) for c in ['color','normal','roughness']}
        mask=values['color'][:,:,3]>.98
        for c in values:values[c]=atlas.bleed(values[c],mask,12)
        normals=values['normal'][:,:,:3]*2-1;normals/=np.maximum(np.linalg.norm(normals,axis=2,keepdims=True),1e-8)
        values['normal'][:,:,:3]=normals*.5+.5
        values['orm']=np.ones_like(values['color']);values['orm'][:,:,1]=values['roughness'][:,:,0];values['orm'][:,:,2]=0
        for rec in records:
            x,y=rec['tile']%4*TILE,rec['tile']//4*TILE
            rec['alphaOccupancy']=float(np.mean(values['color'][y:y+TILE,x:x+TILE,3]>=.5))
            if rec['alphaOccupancy']<.025:raise RuntimeError('Empty atlas tile')
        for c in ['color','normal','orm']:atlas.write_pixels('leaf_'+c,values[c],directory/f'leaf_{c}.png',c=='color')
        atlas.COLS=COLS;atlas.ROWS=ROWS
        mips=atlas.mip_chain(directory,*[values[c].copy() for c in ['color','normal','orm']])
        write_json(directory/'atlas.json',{'sourceSha256':row['sha256'],'codeIdentity':options['codeIdentity'],'size':[2048,2048],
            'tiles':records,'mips':mips,'lightingBaked':False,'flatAttachments':True,
            'method':'Eight flat connected branchlet layouts and eight single photographed leaf forms; all shoot nodes and petiole attachments lie in the atlas plane'})
        print(f'[Hybrid] Baked flat {species} atlas: {[round(r["alphaOccupancy"],3) for r in records]}',flush=True)
