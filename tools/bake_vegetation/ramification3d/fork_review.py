# Selects a real major junction and cuts its connected saved surface for inspection.
import bpy
import bmesh
import numpy as np


def connected_vertices(start):
    found={start};pending=[start]
    while pending:
        vertex=pending.pop()
        for edge in vertex.link_edges:
            other=edge.other_vert(vertex)
            if other not in found:found.add(other);pending.append(other)
    return found


def make_fork(paths,wood,major_ids):
    ids=set(major_ids);candidates=[]
    for parent in paths:
        daughters=[paths[i] for i in parent['children'] if i in ids and abs(paths[i]['parentT']-1)<1e-8]
        if parent['id'] in ids and len(daughters)>=2:
            candidates.append((parent,daughters))
    if candidates:
        parent,daughters=max(candidates,key=lambda pair:min(p['baseRadius'] for p in pair[1]))
        center=parent['points'][-1];extent=max(min(p['span'] for p in daughters)*.55,parent['tipRadius']*8)
        selection={'kind':'daughter-fork','parentId':parent['id'],'parentT':1.,'childIds':[p['id'] for p in daughters]}
    else:
        candidates=[p for p in paths if p['id'] in ids and p['parent'] in ids and .1<p['parentT']<.98]
        if not candidates:raise RuntimeError('No connected major junction available for review')
        child=max(candidates,key=lambda p:p['baseRadius']);parent=paths[child['parent']]
        center=child['points'][0];extent=max(child['span']*.55,child['baseRadius']*10)
        selection={'kind':'lateral-junction','parentId':parent['id'],'parentT':child['parentT'],'childIds':[child['id']]}
    fork=wood.copy();fork.data=wood.data.copy();fork.name='Diagnostic / isolated saved fork';bpy.context.scene.collection.objects.link(fork)
    bm=bmesh.new();bm.from_mesh(fork.data)
    outside=[v for v in bm.verts if np.linalg.norm(np.array(v.co)-center)>extent]
    bmesh.ops.delete(bm,geom=outside,context='VERTS')
    if not bm.verts:raise RuntimeError('Empty junction crop')
    nearest=min(bm.verts,key=lambda v:np.linalg.norm(np.array(v.co)-center));keep=connected_vertices(nearest)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if v not in keep],context='VERTS')
    bm.to_mesh(fork.data);bm.free();fork.data.update();fork.hide_render=True;fork.hide_set(True)
    selection.update(center=[float(v) for v in center],radius=float(extent))
    return fork,selection
