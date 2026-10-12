# Simplifies the actual reference blade surface into two curved opaque leaf representations.
import bpy
import numpy as np
from common import activate,array
from leaf_geometry import PETIOLE

TARGETS={'plane':(24,8),'oak':(28,10),'linden':(14,6),'elm':(14,6),'viburnum':(14,6)}


def templates(forms,kind,atlas):
    result={};audit=[]
    for level in [0,1]:
        result[level]=[]
        for form in range(8):
            source=forms[form];count=(len(source['points'])-10)//2
            faces=source['faces'][np.max(source['faces'],axis=1)<count]
            mesh=bpy.data.meshes.new('Leaf surface reduction');mesh.from_pydata(source['points'][:count].tolist(),[],faces.tolist())
            obj=bpy.data.objects.new('Leaf surface reduction',mesh);bpy.context.scene.collection.objects.link(obj);activate(obj)
            modifier=obj.modifiers.new('Curved blade reduction','DECIMATE');modifier.ratio=TARGETS[kind][level]/len(faces);modifier.use_collapse_triangulate=True
            bpy.ops.object.modifier_apply(modifier=modifier.name);mesh=obj.data;mesh.calc_loop_triangles()
            p=array(mesh.vertices,'co',3);f=array(mesh.loop_triangles,'vertices',3,np.int32)
            width=.009 if level==0 else .007
            start=len(p);petiole=np.array([[-width,-PETIOLE[kind],0],[width,-PETIOLE[kind],0],[width,.012,.001],[-width,.012,.001]])
            p=np.concatenate([p,petiole]);f=np.concatenate([f,[[start,start+1,start+2],[start,start+2,start+3]]])
            tile=atlas['tiles'][8+form];uv=((p[:,:2]-np.array(tile['center'])[:2])*tile['scale']+.5+[form%4,(8+form)//4])/4
            area=float(np.abs(np.cross(p[f[:,1],:2]-p[f[:,0],:2],p[f[:,2],:2]-p[f[:,0],:2])).sum()*.5)
            rect=float(np.prod(np.ptp(p[:,:2],axis=0)))
            result[level].append((p,f,uv))
            audit.append({'form':form,'detail':level,'triangles':len(f),'bladeTriangles':len(f)-2,'opaque':True,
                'projectedArea':area,'tightRectangleArea':rect,'rectangleToOpaqueArea':rect/max(area,1e-9),
                'individualAlphaQuadTriangles':2,'sharedBackfaceGeometry':True})
            bpy.data.objects.remove(obj,do_unlink=True)
    return result,audit


def mesh_object(name,vertices,faces,uv,material,colors=None):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(np.asarray(vertices).tolist(),[],np.asarray(faces).tolist())
    mesh.uv_layers.new(name='Hybrid PBR').data.foreach_set('uv',np.asarray(uv,np.float32).ravel())
    mesh.polygons.foreach_set('use_smooth',[True]*len(mesh.polygons));mesh.materials.append(material)
    if colors is not None:
        mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT').data.foreach_set('color',np.asarray(colors,np.float32).ravel())
    mesh.update();obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj)
    obj['lodLevel']=0;return obj


def leaves(model,data,indices,templates,material,role):
    points=[];faces=[];uv=[];colors=[];offset=0
    for i in indices:
        p,f,texture=templates[int(data['forms'][i])];points.append(p@data['matrices'][i].T+data['origins'][i]);faces.append(f+offset)
        uv.append(texture[f.ravel()]);colors.extend([data['tints'][i]]*len(p));offset+=len(p)
    obj=mesh_object(model+' / '+role,np.concatenate(points),np.concatenate(faces),np.concatenate(uv),material,colors)
    obj['surface']='foliage';obj['canopyRole']=role;return obj
