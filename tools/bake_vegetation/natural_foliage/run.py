# Entrypoint for reference foliage research and isolated model revisions.
import json
import sys
from pathlib import Path
import bpy

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'authoring'));sys.path.insert(0,str(HERE.parent/'lod0'));sys.path.insert(0,str(HERE))
from common import write_json

options=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
output=Path(options['output'])
if options['phase']=='study':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    image=bpy.data.images.load(str(Path(options['root'])/'assets/trees/Textures/T_Leaf_Realistic9.TGA'))
    image.pixels[0]
    image.filepath_raw=str(output/'existing_game_branchlets.png');image.file_format='PNG';image.save()
    bpy.ops.import_scene.fbx(filepath=str(Path(options['root'])/'assets/trees/Models/Mobile/SM_M_Tree_1.FBX'))
    write_json(output/'existing_game_tree.json',{'textureSize':list(image.size),'objects':[{'name':obj.name,'vertices':len(obj.data.vertices),'polygons':len(obj.data.polygons),'materials':[mat.name for mat in obj.data.materials]} for obj in bpy.context.scene.objects if obj.type=='MESH']})
elif options['phase']=='coverage':
    from coverage import run
    run(options)
else:
    from build import run
    run(options)
