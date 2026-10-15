# Validates grown scaffold graphs and renders bare-wood fork diagnostics before foliage construction.
import hashlib
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from architecture import scaffold
from wood import roots,build_wood
from surface import material
from render import setup
from common import write_json,triangles
from branchlets import plane_branchlets,branchlet_pose


def structure(o):
    rows=[]
    for model in o['models']:
        species,variant=model.split('/');p=o['profiles'][species];folder=Path(o['output'])/model;folder.mkdir(parents=True,exist_ok=True)
        if (folder/'wood.blend').exists():raise RuntimeError('Preserve existing structure review')
        bpy.ops.wm.read_factory_settings(use_empty=True)
        paths,lobes,rng,dimensions=scaffold(p,int(variant[-1]));growth=dimensions['growth'];paths=paths[:growth['structuralPaths']];roots(paths,p,rng)
        for path in paths[:growth['structuralPaths']]:
            if path['parent']>=0 and np.linalg.norm(path['points'][0]-paths[path['parent']]['points'][path['parentNode']])>1e-9:raise RuntimeError('Fork graph disconnect')
        if growth.get('architecture')=='distributed-plane':plane_branchlets(p,paths,lobes,rng)
        if growth.get('architecture')=='open-oak':
            from oak_branchlets import oak_branchlets
            _,growth['branchletSpacing']=oak_branchlets(p,paths,lobes,rng)
        clay_only=o['structure-surface']=='clay'
        mat,meta=material(o,species,'bark');wood,twigs=build_wood(model,paths,{**p,'woodVoxel':.04,'clayPreview':clay_only},mat,meta,rng)
        file=folder/'wood.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True)
        scene,camera=setup(o);clay=bpy.data.materials.new('Neutral clay');clay.use_nodes=True;clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.34,.30,.25,1);clay.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.8
        scene.view_layers[0].material_override=clay
        fork=np.array(growth['firstFork']);points=np.vstack([path['points'] for path in paths]);low=points.min(axis=0);high=points.max(axis=0);span=float(max(high-low)*1.24)
        views=[('wood_full',(low+high)*.5,[7,-32,3],span),('wood_fork',fork+[0,0,.5],[1,-10,.9],max(4.5,p['growth']['basalRadius']*8)),('wood_bark',fork+[0,0,.5],[1,-10,.9],max(4.5,p['growth']['basalRadius']*8))]
        if clay_only:views=views[:2]+[('wood_roots',[0,0,.9],[3,-8,2.0],p['growth']['basalRadius']*10)]
        if growth.get('architecture') in ['distributed-plane','open-oak']:
            pose=branchlet_pose(paths);views.append(('wood_branchlets',pose['target'],pose['offset'],pose['span']))
        if growth.get('architecture')=='open-oak':views.append(('wood_above',(low+high)*.5,[8,-10,32],span))
        if o['views']=='trunk':views=[view for view in views if view[0] in ['wood_fork','wood_bark']]
        renders=[]
        for name,target,offset,size in views:
            if name=='wood_bark':scene.view_layers[0].material_override=None
            camera.location=Vector(target)+Vector(offset);camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=size
            image=folder/(name+'.png');scene.render.filepath=str(image);bpy.ops.render.render(write_still=True)
            renders.append({'file':str(image.relative_to(o['output'])).replace('\\','/'),'sha256':hashlib.sha256(image.read_bytes()).hexdigest()})
        rows.append({'id':model,'surface':o['structure-surface'],'growth':growth,'woodTriangles':triangles(wood.data),'file':str(file.relative_to(o['output'])).replace('\\','/'),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'renders':renders})
        write_json(Path(o['output'])/'structure.json',{'models':rows});print('[Enhanced] Structure reviewed '+model,flush=True)
