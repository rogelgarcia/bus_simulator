"""Evaluate each saved view layer before reading its previously excluded bus matrices."""
import bpy,json,sys
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion

args=sys.argv[sys.argv.index('--')+1:]
manifest=json.loads(Path(args[0]).read_text())
source=json.loads(Path(manifest['sourceManifest']).read_text())
bpy.ops.wm.open_mainfile(filepath=manifest['scene'])
scene=bpy.context.scene
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
records=[]
def authored(transform,camera=False):
    p,q=transform['position'],transform['quaternion']
    matrix=C@Matrix.LocRotScale(Vector((p['x'],p['y'],p['z'])),Quaternion((q['w'],q['x'],q['y'],q['z'])),Vector((1,1,1)))
    return matrix if camera else matrix@C.inverted()
def error(a,b):
    return max(abs(a[i][j]-b[i][j]) for i in range(4) for j in range(4))
for pose in source['poses']:
    layer=scene.view_layers[pose['id']]
    for bus_id in {item['busId'] for item in source['poses']}:
        if layer.layer_collection.children[bus_id].exclude!=(bus_id!=pose['busId']):
            raise RuntimeError('View layer has incorrect bus visibility: '+pose['id'])
    bpy.context.window.view_layer=layer
    layer.update()
    bus=bpy.data.objects[pose['busId']]
    camera=bpy.data.objects[pose['id']]
    bus_error=error(bus.matrix_world,authored(pose['pose']['bus']['transform']))
    camera_error=error(camera.matrix_world,authored(pose['pose']['camera'],True))
    if max(bus_error,camera_error)>0.0001:raise RuntimeError('Saved pose transform differs from authored input: '+pose['id'])
    records.append({'pose':pose['id'],'busId':pose['busId'],'busWorldMatrix':[list(row) for row in bus.matrix_world],'cameraWorldMatrix':[list(row) for row in camera.matrix_world],'busMaximumMatrixError':bus_error,'cameraMaximumMatrixError':camera_error})
Path(args[1]).write_text(json.dumps({'schemaVersion':1,'status':'validated','scene':manifest['scene'],'poses':records,'policy':'Fresh file; each associated view layer evaluated before reading world matrices. Geometry and scene file were not modified.'},indent=2))
print('AI560_POSES_VERIFIED='+str(len(records)),flush=True)
