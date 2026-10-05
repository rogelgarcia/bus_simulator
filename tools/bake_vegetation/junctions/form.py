# Adds asymmetric growth collars and descending shoulders to existing branch skeletons.
import math
import random
import numpy as np
from mathutils import Vector


def parent_frame(path, parent):
    origin = Vector(path['points'][0])
    nearest = None
    for i in range(len(parent['points']) - 1):
        a, b = Vector(parent['points'][i]), Vector(parent['points'][i + 1])
        t = max(0, min(1, (origin-a).dot(b-a)/(b-a).length_squared))
        center = a.lerp(b, t)
        radius = parent['radii'][i]*(1-t)+parent['radii'][i+1]*t
        distance = (origin-center).length
        if nearest is None or distance < nearest[0]:
            nearest = (distance, center, (b-a).normalized(), radius)
    return nearest[1:]


def append_shell(vertices, faces, rings):
    indices = []
    for ring in rings:
        indices.append(list(range(len(vertices),len(vertices)+len(ring))))
        vertices.extend(tuple(point) for point in ring)
    for a,b in zip(indices[:-1],indices[1:]):
        for i in range(len(a)):
            j=(i+1)%len(a)
            faces.append((a[i],a[j],b[j],b[i]))
    faces.append(tuple(reversed(indices[0])));faces.append(tuple(indices[-1]))


def grow_unions(vertices, faces, paths, variant, recipe):
    records=[]
    for index,path in enumerate(paths):
        if path['parent'] < 0 or path.get('basal'): continue
        radius=path['radii'][0]
        if radius < (.0075 if recipe['kind']=='shrub' else .055): continue
        parent=paths[path['parent']]
        origin,axis,parent_radius=parent_frame(path,parent)
        branch=(Vector(path['points'][1])-Vector(path['points'][0])).normalized()
        cosine=max(-.98,min(.98,branch.dot(axis)))
        sine=math.sqrt(1-cosine*cosine)
        if sine < .24: continue
        outward=(branch-axis*cosine).normalized()
        side=branch.cross(axis).normalized()
        upper=side.cross(branch).normalized()
        rng=random.Random(variant['seed']+index*619+587)
        ratio=radius/parent_radius
        spread=rng.uniform(.88,1.15)+max(0,ratio-.6)*.6
        imbalance=rng.uniform(-.16,.16)
        knots=[rng.uniform(-1,1) for _ in range(13)];knots[-1]=knots[0]
        rings=[]
        for s in np.linspace(-2.3,3.2,31):
            ring=[]
            for spoke in range(64):
                angle=math.tau*spoke/64
                radial=upper*math.cos(angle)+side*math.sin(angle)
                v=radial*radius
                perpendicular=v-axis*v.dot(axis)
                d=branch-axis*cosine
                b=d.dot(perpendicular)
                c=perpendicular.length_squared-parent_radius*parent_radius
                intersection=(-b+math.sqrt(max(0,b*b-sine*sine*c)))/(sine*sine)
                top=(math.cos(angle)+1)*.5
                bottom=1-top
                irregular=float(np.interp(spoke/64*12,range(13),knots))
                width=(.40+bottom*1.40)*spread
                center=.06+bottom*.25+imbalance*math.sin(angle)
                swelling=(.085+bottom*.25)*(1+.16*irregular)*math.exp(-((s-center)/width)**2)
                crest=.13*top*(1+.3*irregular)*math.exp(-((s-.09-.11*irregular)/.25)**2)
                distance=max(0,intersection+s*radius)
                base=max(radius*.60,radius*(1-.055*max(distance,0)/radius))
                base*=.72+.28*min(1,max(0,(s+2.3)/1.1))
                ring.append(origin+branch*distance+radial*base*(1+swelling+crest))
            rings.append(ring)
        append_shell(vertices,faces,rings)
        shoulder=[]
        length=radius*rng.uniform(2.4,3.4)
        for t in np.linspace(0,1,24):
            center=(origin-axis*length*(1-t)**2+outward*(parent_radius+radius*.9)*t)
            center+=axis*cosine/sine*(parent_radius+radius*.9)*t
            width=radius*(.20+.80*math.sin(math.pi*t)**.8)
            bury=(.52+.15*math.sin(math.pi*t))
            ring=[]
            for spoke in range(40):
                angle=math.tau*spoke/40
                ring.append(center+side*math.sin(angle)*width*.82+outward*math.cos(angle)*width*bury)
            shoulder.append(ring)
        append_shell(vertices,faces,shoulder)
        records.append({'branch':index,'parent':path['parent'],'origin':list(origin),'axis':list(axis),
                        'direction':list(branch),'branchRadius':radius,'parentRadius':parent_radius,
                        'spread':spread,'imbalance':imbalance,'shoulderLength':length})
    if not records: raise RuntimeError('No substantive branch unions were refined')
    return {'junctionRevision':'anatomical-unions-v1','junctionCount':len(records),'junctions':records,
            'junctionMethod':'Asymmetric collars, upper bark ridges and descending parent shoulders fused into continuous wood'}


def ridge_relief(coordinates,information):
    depth=np.zeros(len(coordinates),np.float32)
    for joint in information['junctions']:
        origin=np.array(joint['origin']);axis=np.array(joint['axis']);branch=np.array(joint['direction'])
        radius=joint['branchRadius'];parent_radius=joint['parentRadius']
        cosine=float(np.dot(axis,branch));sine2=1-cosine*cosine
        extent=(parent_radius+radius*3)/math.sqrt(sine2)
        selected=np.flatnonzero(np.all(np.abs(coordinates-origin)<extent,axis=1))
        if not len(selected):continue
        q=coordinates[selected]-origin;along=q@branch
        radial=q-along[:,None]*branch
        radial_length=np.linalg.norm(radial,axis=1)
        direction=radial/np.maximum(radial_length[:,None],1e-8)
        upper=axis-branch*cosine;upper/=np.linalg.norm(upper)
        top=np.clip((direction@upper+.65)/1.65,0,1)
        v=direction*radius;perpendicular=v-(v@axis)[:,None]*axis
        b=perpendicular@(branch-axis*cosine)
        c=np.sum(perpendicular**2,axis=1)-parent_radius**2
        boundary=(-b+np.sqrt(np.maximum(0,b*b-sine2*c)))/sine2
        side=np.cross(branch,axis);side/=np.linalg.norm(side)
        angle=np.arctan2(direction@side,direction@upper)
        waviness=.11*np.sin(angle*3+joint['imbalance']*7)+.05*np.sin(angle*7+joint['spread']*4)
        distance=(along-boundary)/radius-waviness
        crest=.075*radius*np.exp(-((distance-.04)/.25)**2)
        crease=.022*radius*np.exp(-((distance+.32)/.15)**2)
        shell=np.exp(-((radial_length/radius-1)/.65)**4)
        depth[selected]+=((crest-crease)*top*shell).astype(np.float32)
    return depth
