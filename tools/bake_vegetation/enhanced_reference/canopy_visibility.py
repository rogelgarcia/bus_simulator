# Measures visible foliage, exposed wood and sky gaps in one fixed reference crown envelope.
import numpy as np


def crown_envelope(alpha):
    ys,xs=np.nonzero(alpha>.5)
    if not len(xs):raise ValueError('Empty reference foliage mask')
    points=sorted(set((int(x),int(y)) for y in np.unique(ys) for x in [xs[ys==y].min(),xs[ys==y].max()]))
    cross=lambda a,b,c:(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    def half(seq):
        result=[]
        for p in seq:
            while len(result)>=2 and cross(result[-2],result[-1],p)<=0:result.pop()
            result.append(p)
        return result
    polygon=half(points)[:-1]+half(points[::-1])[:-1];mask=np.zeros(alpha.shape,bool)
    for y in range(int(ys.min()),int(ys.max())+1):
        intercepts=[]
        for a,b in zip(polygon,polygon[1:]+polygon[:1]):
            if a[1]<=y<b[1] or b[1]<=y<a[1]:intercepts.append(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
        if intercepts:mask[y,max(0,int(np.ceil(min(intercepts)))):int(np.floor(max(intercepts)))+1]=True
    return mask


def compare(previous,enhanced,envelope):
    def fractions(image,roi):
        opaque=image[:,:,3]>.5;leaf=opaque&(image[:,:,1]>image[:,:,0]);wood=opaque&~leaf
        return {'foliage':float(leaf[roi].mean()),'wood':float(wood[roi].mean()),'gaps':float((~opaque)[roi].mean())}
    ys,xs=np.nonzero(envelope);regions=[]
    for row,(y0,y1) in enumerate(zip(np.linspace(ys.min(),ys.max()+1,4).astype(int)[:-1],np.linspace(ys.min(),ys.max()+1,4).astype(int)[1:])):
        for col,(x0,x1) in enumerate(zip(np.linspace(xs.min(),xs.max()+1,4).astype(int)[:-1],np.linspace(xs.min(),xs.max()+1,4).astype(int)[1:])):
            roi=envelope[y0:y1,x0:x1]
            if roi.sum()<envelope.sum()*.015:continue
            a=fractions(previous[y0:y1,x0:x1],roi);b=fractions(enhanced[y0:y1,x0:x1],roi)
            regions.append({'rowFromBottom':row,'columnFromLeft':col,'previous':a,'enhanced':b,'foliageChangePoints':(b['foliage']-a['foliage'])*100})
    before=fractions(previous,envelope);after=fractions(enhanced,envelope)
    return {'previous':before,'enhanced':after,'referenceEnvelopePixels':int(envelope.sum()),
            'visibleFoliageRetention':after['foliage']/before['foliage'],'worstRegionChangePoints':min(r['foliageChangePoints'] for r in regions),'regions':regions}


def read_pixels(file):
    import bpy
    image=bpy.data.images.load(str(file));pixels=np.empty(len(image.pixels),np.float32);image.pixels.foreach_get(pixels)
    result=pixels.reshape(image.size[1],image.size[0],4);bpy.data.images.remove(image);return result


def finish(directory,records):
    from common import write_json
    rows=[]
    for view in ['front','side','rear']:
        pair=[next((r for r in records if r['state']==s and r['view']=='visibility_'+view),None) for s in ['previous','enhanced']]
        if any(r is None for r in pair):continue
        if pair[0]['camera']!=pair[1]['camera']:raise RuntimeError('Visibility cameras differ')
        alpha=read_pixels(directory/('previous_coverage_'+view+'.png'))[:,:,3]
        rows.append({'view':view,**compare(*[read_pixels(directory/(r['state']+'_visibility_'+view+'.png')) for r in pair],crown_envelope(alpha))})
    if rows:write_json(directory/'visibility.json',{'method':'Depth-tested green foliage / red wood / transparent gaps inside the previous foliage convex hull; fixed matched cameras; binary pixel classes',
                'limitations':'Convex hull includes natural spaces between branch clusters; fractions describe projected fullness, not biological leaf area or exact leaf intersections.','views':rows})


def begin(scene,objects):
    import bpy
    from spatial_poses import leaf_prototypes
    state={'slots':[],'transform':scene.view_settings.view_transform,'look':scene.view_settings.look,'exposure':scene.view_settings.exposure}
    for role,meshes in [('foliage',[o.data for o in leaf_prototypes(objects[0])]),('wood',[o.data for o in objects[1:]])]:
        material=bpy.data.materials.get('Visibility '+role) or bpy.data.materials.new('Visibility '+role);material.use_nodes=True
        nodes=material.node_tree.nodes;nodes.clear();emission=nodes.new('ShaderNodeEmission');output=nodes.new('ShaderNodeOutputMaterial')
        emission.inputs['Color'].default_value=(0,1,0,1) if role=='foliage' else (1,0,0,1);material.node_tree.links.new(emission.outputs[0],output.inputs[0])
        for mesh in meshes:
            state['slots'].append((mesh,list(mesh.materials)))
            for i in range(len(mesh.materials)):mesh.materials[i]=material
    scene.view_layers[0].material_override=None;scene.render.film_transparent=True;scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0
    bpy.data.objects['Neutral showroom floor'].hide_render=True
    return state


def end(scene,state):
    for mesh,materials in state['slots']:
        for i,material in enumerate(materials):mesh.materials[i]=material
    scene.view_settings.view_transform=state['transform'];scene.view_settings.look=state['look'];scene.view_settings.exposure=state['exposure']
