# Closed leaf shells trace scan silhouettes, retaining aligned veins and tissue maps.
import math
from collections import Counter
import numpy as np
from leaf_geometry import tube_template, PETIOLE
from maps import read_pixels, sample


def template(kind, form, paths, recipe):
    if kind == 'oak':
        return oak_template(form, paths, recipe)
    mask = read_pixels(paths['mask'])[:, :, 0]
    mask = mask[:len(mask)//2]
    height = read_pixels(paths['height'])[:, :, 0]
    height = height[:len(height)//2]
    center = np.array(recipe['center'])
    rng = np.random.default_rng(58600 + form * 713)
    sectors, rings = 192, 10
    angles = np.arange(sectors) * math.tau / sectors
    directions = np.column_stack([np.cos(angles), -np.sin(angles)])
    steps = np.linspace(.002, .85, 900)
    samples = center + directions[:, None, :] * steps[None, :, None]
    values = sample(mask, samples.reshape(-1, 2)).reshape(sectors, -1)
    values[(samples[:, :, 0] < 0) | (samples[:, :, 0] > 1) | (samples[:, :, 1] < 0) | (samples[:, :, 1] > .972)] = 0
    # Follow the exterior silhouette; a photographed pinhole must not become a radial slit.
    edge = len(steps)-1-np.argmax(values[:, ::-1] > .52, axis=1)
    if np.any(edge < 8): raise RuntimeError('Leaf scan center lies outside its tissue mask')
    contour = center + directions * steps[np.maximum(edge-1, 1), None]
    base = np.array(recipe['base']); tip = np.array(recipe['tip'])
    length = base[1] - tip[1]
    width = np.ptp(contour[:, 0])
    uv = [center]
    for ring in range(1, rings+1): uv.extend(center + (contour-center) * ring/rings)
    uv = np.array(uv)
    xy = np.column_stack([(uv[:, 0] - base[0])/width, (base[1]-uv[:, 1])/length])
    if kind == 'elm': xy[:,1] += np.sign(xy[:,0])*.055*(1-np.clip(xy[:,1],0,1))**2
    shape_controls = rng.uniform(.96,1.04,9);shape_controls[-1]=shape_controls[0]
    variations = np.interp(angles,np.linspace(0,math.tau,9),shape_controls)
    for ring in range(rings):
        ids = slice(1+ring*sectors,1+(ring+1)*sectors)
        xy[ids] = xy[0]+(xy[ids]-xy[0])*variations[:,None]
    # Independent seeded control values perturb the form, avoiding periodic identical folds.
    control = rng.uniform(-.018,.018,7)
    bend = np.interp(np.clip(xy[:,1],0,1), np.linspace(0,1,7), control)
    curl, twist = rng.uniform(-.13,.10), rng.uniform(-.10,.10)
    relief = (sample(height, uv) - .5) * .014
    z = bend + curl * xy[:,1]**2 + twist * xy[:,0]*xy[:,1] + .14*xy[:,0]**2 + relief
    if kind in ['linden','viburnum']:
        edge_ids = np.arange(1+(rings-1)*sectors, 1+rings*sectors)
        tooth_count = 36 if kind == 'linden' else 24
        irregular = rng.uniform(.5,1.3,tooth_count)
        cycle = (angles/math.tau*tooth_count) % 1
        serration = np.maximum(0,1-np.abs(cycle-.35)/.26)*irregular[(angles/math.tau*tooth_count).astype(int)]
        xy[edge_ids] += (xy[edge_ids]-xy[0]) * (serration*.045)[:,None]
    top = np.column_stack([xy,z])
    faces=[]
    for j in range(sectors): faces.append((0,1+j,1+(j+1)%sectors))
    for ring in range(rings-1):
        a,b=1+ring*sectors,1+(ring+1)*sectors
        for j in range(sectors):
            k=(j+1)%sectors;faces.extend([(a+j,b+j,b+k),(a+j,b+k,a+k)])
    return shell(top, faces, uv, kind)


def shell(top, faces, uv, kind):
    count=len(top)
    points=np.concatenate([top,top+[0,0,-.0017]])
    edge_counts=Counter(tuple(sorted((int(t[i]),int(t[(i+1)%3])))) for t in faces for i in range(3))
    boundary=[(t[i],t[(i+1)%3]) for t in faces for i in range(3) if edge_counts[tuple(sorted((t[i],t[(i+1)%3]))) ]==1]
    faces += [(c+count,b+count,a+count) for a,b,c in faces.copy()]
    for a,b in boundary: faces.extend([(a,a+count,b+count),(a,b+count,b)])
    # Texture Y uses Blender's bottom-up UV convention.
    top_uv=np.column_stack([uv[:,0],1-uv[:,1]*.5]);bottom_uv=top_uv-[0,.5]
    uvs=np.concatenate([top_uv,bottom_uv])
    stalk, stalk_faces, stalk_uv, _ = tube_template(PETIOLE[kind],.006,7)
    stalk[:,1]-=PETIOLE[kind];stalk_uv[:]=(.5,.501)
    faces=np.concatenate([np.array(faces,np.int32),stalk_faces+len(points)])
    points=np.concatenate([points,stalk]);uvs=np.concatenate([uvs,stalk_uv])
    normals=np.zeros_like(points)
    area=np.cross(points[faces[:,1]]-points[faces[:,0]],points[faces[:,2]]-points[faces[:,0]])
    # A winding check fixes the radial parameterization once for both closed surfaces.
    if np.mean(area[:100,2])<0: faces=faces[:,::-1];area=-area
    for column in range(3): np.add.at(normals,faces[:,column],area)
    normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-12)
    edges=Counter(tuple(sorted((int(t[i]),int(t[(i+1)%3])))) for t in faces for i in range(3))
    if any(v!=2 for v in edges.values()) or not np.all(np.isfinite(points)) or np.min(np.linalg.norm(area,axis=1))<1e-12:
        raise RuntimeError('Photographed leaf shell failed closed topology/finite-area validation')
    return points.astype(np.float32),faces,uvs.astype(np.float32),normals.astype(np.float32)


def oak_template(form, paths, recipe):
    mask=read_pixels(paths['mask'])[:,:,0];mask=mask[:len(mask)//2]
    height=read_pixels(paths['height'])[:,:,0];height=height[:len(height)//2]
    valid=mask>.52
    left=np.argmax(valid,axis=1)/(mask.shape[1]-1)
    right=(mask.shape[1]-1-np.argmax(valid[:,::-1],axis=1))/(mask.shape[1]-1)
    anchors=np.array([0,.03,.12,.20,.25,.33,.39,.48,.53,.60,.67,.73,.79,.85,.89,.94,1.])
    widths=[np.array([0,.10,.26,.29,.25,.38,.32,.47,.36,.46,.37,.39,.24,.30,.17,.10,0]),
            np.array([0,.08,.23,.31,.27,.40,.34,.50,.38,.49,.39,.41,.27,.29,.18,.13,0])]
    rng=np.random.default_rng(58600+form*713)
    widths=[w*rng.uniform(.96,1.04,len(w)) for w in widths]
    stations=np.unique(np.concatenate([np.linspace(.008,.992,125),anchors[1:-1]]))
    base,tip=np.array(recipe['base']),np.array(recipe['tip'])
    length=base[1]-tip[1]
    xy=[[0,0]];uv=[base];rows=[[0]]
    for t in stations:
        v=base[1]-t*length;row=min(len(mask)-1,max(0,round(v*(len(mask)-1))))
        middle=base[0]+(tip[0]-base[0])*t
        ring=[]
        for f in np.linspace(-1,1,25):
            side=0 if f<0 else 1
            edge=(left if side==0 else right)[row]
            x=abs(f)*np.interp(t,anchors,widths[side])*(-1 if f<0 else 1)
            ring.append(len(xy));xy.append([x,t]);uv.append([middle+(edge-middle)*abs(f)*.99,v])
        rows.append(ring)
    rows.append([len(xy)]);xy.append([0,1]);uv.append(tip)
    faces=[]
    for a,b in zip(rows[:-1],rows[1:]):
        if len(a)==1:
            faces.extend((a[0],b[i+1],b[i]) for i in range(len(b)-1))
        elif len(b)==1:
            faces.extend((a[i],a[i+1],b[0]) for i in range(len(a)-1))
        else:
            for i in range(len(a)-1):faces.extend([(a[i],a[i+1],b[i+1]),(a[i],b[i+1],b[i])])
    xy=np.array(xy);uv=np.array(uv);f=np.array(faces)
    a,b=xy[f[:,1]]-xy[f[:,0]],xy[f[:,2]]-xy[f[:,0]]
    signed=a[:,0]*b[:,1]-a[:,1]*b[:,0]
    if np.min(signed)<=0:raise RuntimeError('Oak blade contains a folded or collapsed triangle')
    curl,twist=rng.uniform(-.13,.10),rng.uniform(-.10,.10)
    bend=np.interp(xy[:,1],np.linspace(0,1,7),rng.uniform(-.018,.018,7))
    z=bend+curl*xy[:,1]**2+twist*xy[:,0]*xy[:,1]+.14*xy[:,0]**2+(sample(height,uv)-.5)*.014
    return shell(np.column_stack([xy,z]),faces,uv,'oak')
