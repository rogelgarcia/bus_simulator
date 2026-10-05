# Revises closed leaf prototypes in a saved candidate scene without rebuilding accepted wood.
import json
import sys
from pathlib import Path
import bpy
import numpy as np
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'authoring'));sys.path.insert(0,str(HERE))
from leaf_geometry import bulk_mesh,LENGTH_RATIO
from leaves import template


def main(source,output):
    manifest=json.loads((source/'scene.json').read_text())
    recipes=json.loads((HERE/'recipes.json').read_text())
    bpy.ops.wm.open_mainfile(filepath=str(source/manifest['scene']))
    for folder,settings in recipes.items():
        recipe=json.loads((HERE.parent/folder/'recipe.json').read_text())
        paths={key:output/'pbr'/folder/('leaf_'+key+'.png') for key in ['color','roughness','height','normal','mask']}
        forms=[template(recipe['texture']['leaf'],i,paths,settings) for i in range(8)]
        material=None
        for variant in recipe['variants']:
            for i,form in enumerate(forms):
                obj=bpy.data.objects[f'{folder}/{variant["id"]}_form_{i:02}']
                material=obj.data.materials[0]
                replacement,_=bulk_mesh('Revised closed leaf',[(0,np.eye(3),np.zeros(3),np.ones(3))],[form],material)
                old=obj.data;obj.data=replacement.data;bpy.data.objects.remove(replacement,do_unlink=True)
                if not old.users:bpy.data.meshes.remove(old)
        study=next(obj for obj in bpy.data.collections[folder].objects if obj.get('leafStudy'))
        center=next(plot['center'] for plot in manifest['plots'] if plot['species']==folder)
        center=np.array([center[0],center[1]-18,1.6])
        width=sum(recipe['growth']['leafWidthMetres'])*.5;length=width*LENGTH_RATIO[recipe['texture']['leaf']]
        instances=[]
        for i in range(4):
            sign=-1 if i>=2 else 1
            matrix=np.array([[width*sign,0,0],[0,0,-length*sign],[0,length,0]])
            origin=center+[(i%2-.5)*width*1.6,0,(.5-i//2)*length*1.4]
            instances.append((i,matrix,origin,np.ones(3)))
        replacement,_=bulk_mesh('Revised specimen study',instances,forms,material)
        old=study.data;study.data=replacement.data;bpy.data.objects.remove(replacement,do_unlink=True)
        if not old.users:bpy.data.meshes.remove(old)
        for record in manifest['inventory']:
            if record['species']==folder:record['leafTemplateTriangles']=len(forms[0][1])
        print('[Photo PBR] Rebuilt closed leaf prototypes:',folder,flush=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(output/manifest['scene']),compress=True)
    manifest['leafRevision']='photo-shells-v2-unfolded-oak'
    (output/'scene.json').write_text(json.dumps(manifest,indent=2)+'\n')


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:];main(Path(args[0]),Path(args[1]))
