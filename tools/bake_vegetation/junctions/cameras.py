# Frames exposed attachments without changing the saved tree geometry.
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'showcase'))
from scene import camera


def add_union_views(manifest,record,obj,recipe):
    folder=record['species']
    junctions=record['woodyDetail']['junctions']
    # Near-parallel scaffold bases remain buried until farther up the elm crown.
    candidates=[row for row in junctions if Vector(row['direction']).dot(Vector(row['axis']))<math.cos(math.radians(35))]
    def prominence(row):
        weight=1
        if folder=='american_elm':
            angle=Vector(row['direction']).angle(Vector(row['axis']))
            weight=math.hypot(*row['origin'][:2])*math.sin(angle)
        return row['branchRadius']*weight
    junction=max(candidates or junctions,key=prominence)
    origin=Vector(junction['origin'])+obj.location
    direction=Vector(junction['direction']);axis=Vector(junction['axis'])
    side=axis.cross(direction).normalized()
    target=origin+direction*(junction['parentRadius']*.65)
    span=max(.15 if recipe['kind']=='shrub' else .8,junction['parentRadius']*4.5)
    oblique=(side*.75+direction*.65).normalized()
    exposed=folder in ['silver_linden','american_elm','arrowwood_viburnum']
    front=(side*.95+direction*.32).normalized() if exposed else side
    if folder=='arrowwood_viburnum':front=(side*.5+direction*.85).normalized()
    for suffix,offset in [('junction_front',front),('junction_oblique',oblique),('junction_clay',oblique if exposed else side)]:
        name=folder+'_'+suffix
        if name in bpy.data.objects:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
        view=camera(bpy.context.scene,name,target+offset*span*2.7+axis*span*.2,target,60)
        hidden=exposed or suffix!='junction_front'
        view.update({'species':folder,'variant':record['variant'],'closeup':True,'woodOnly':hidden,
                     'label':'Branch union — '+suffix.split('_')[1]+(', foliage hidden' if hidden else '')})
        if suffix=='junction_clay':view.update({'clay':True,'label':'Branch union — untextured geometry, foliage hidden'})
        manifest['views']=[old for old in manifest['views'] if old['id']!=name]+[view]


def mesh_signature():
    digest=hashlib.sha256()
    for obj in sorted((obj for obj in bpy.data.objects if obj.type=='MESH'),key=lambda obj:obj.name):
        digest.update(obj.name.encode());digest.update(np.array(obj.matrix_world,dtype=np.float32).tobytes())
        coordinates=np.empty(len(obj.data.vertices)*3,np.float32)
        obj.data.vertices.foreach_get('co',coordinates);digest.update(coordinates.tobytes())
    return digest.hexdigest()


def main(source,output):
    manifest=json.loads((source/'scene.json').read_text())
    bpy.ops.wm.open_mainfile(filepath=str(source/manifest['scene']))
    before=mesh_signature()
    for record in manifest['inventory']:
        if record['variant']!='mature_01':continue
        folder=record['species'];recipe=json.loads((HERE.parent/folder/'recipe.json').read_text())
        obj=next(obj for obj in bpy.data.collections[folder].objects if obj.get('variant')=='mature_01' and 'wood_paths' in obj)
        add_union_views(manifest,record,obj,recipe)
    after=mesh_signature()
    if before!=after:raise RuntimeError('Camera revision changed mesh coordinates or transforms')
    manifest['cameraGeometryUnchanged']={'before':before,'after':after}
    scene=bpy.context.scene;scene.timeline_markers.clear();scene['views']=json.dumps(manifest['views'])
    for frame,view in enumerate(manifest['views'],1):scene.timeline_markers.new(view['id'],frame=frame).camera=bpy.data.objects[view['id']]
    scene.frame_end=len(manifest['views'])
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output/manifest['scene']),compress=True)
    (output/'scene.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('[Branch unions] Review cameras updated; all mesh coordinates and transforms unchanged',flush=True)


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:];main(Path(args[0]),Path(args[1]))
