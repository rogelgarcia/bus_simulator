# Shapes local branch collars and descending shoulders from parent/child growth axes.
import numpy as np
from architecture import unit
from junctions import at_distance


def shoulder_fields(paths):
    fields=[[] for _ in paths]
    for i,child in enumerate(paths):
        if 'growthRole' not in child or child['parent']<0 or child['radii'][0]<.10:continue
        parent=paths[child['parent']];node=child['parentNode'];joint=child['points'][0]
        radius=float(parent['radii'][node]);child_radius=float(child['radii'][0])
        incoming=unit(parent['points'][node]-parent['points'][max(0,node-2)])
        outgoing=unit(at_distance(child['points'],radius*4)-joint)
        outward=outgoing-incoming*np.dot(incoming,outgoing);opening=float(np.linalg.norm(outward))
        if opening<.08:continue
        outward/=opening;ratio=min(1,child_radius/radius)
        strength=.19*ratio**.8*opening**.5
        fields[child['parent']].append({'joint':joint,'axis':incoming,'out':outward,'radius':radius,'strength':strength,'role':'parent'})
        underside=unit(outgoing*np.dot(incoming,outgoing)-incoming)
        fields[i].append({'joint':joint,'axis':outgoing,'out':underside,'radius':radius,'strength':strength*.72,'role':'child'})
    return fields


def shoulder_growth(point,direction,fields):
    value=0.
    for field in fields:
        distance=float((point-field['joint'])@field['axis']/field['radius'])
        if field['role']=='parent':
            t=np.clip((distance+3.5)/4.2,0,1);envelope=np.sin(np.pi*t)**2
            facing=max(0.,float(direction@field['out']))**3
        else:
            t=np.clip(distance/4.0,0,1);envelope=np.sin(np.pi*t)**2
            facing=.25+.75*max(0.,float(direction@field['out']))**2
        value+=field['strength']*envelope*facing
    return min(value,.22)
