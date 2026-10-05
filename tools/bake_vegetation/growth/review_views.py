# Frames the actual wood bounds and a matching textured/clay bark comparison.
import numpy as np
import bpy
from scene import camera


def add_growth_views(manifest,record,wood,points,field,variant):
    folder=record['species'];location=np.array(wood.location)
    low,high=points.min(axis=0)+location,points.max(axis=0)+location
    target=(low+high)*.5;span=high[2]-low[2]
    box=[(x,y,z) for x in [low[0],high[0]] for y in [low[1],high[1]] for z in [low[2],high[2]]]
    for suffix,clay in [('growth_wood',False),('growth_clay',True)]:
        position=target+np.array([span*.30,-span*1.2,span*.10])
        pose=camera(bpy.context.scene,folder+'_'+suffix,position.tolist(),target.tolist(),55,box)
        pose.update({'species':folder,'variant':record['variant'],'woodOnly':True,'clay':clay,
                     'label':'Growth form — '+('clay' if clay else 'textured')+', foliage hidden'})
        manifest['views'].append(pose)
    if folder=='london_plane':
        target=field(np.array([[0,0,variant['height']*.105]]))[0]+location
        for suffix,clay in [('bark_relief',False),('bark_relief_clay',True)]:
            pose=camera(bpy.context.scene,folder+'_'+suffix,(target+np.array([-1.6,-2.4,.22])).tolist(),target.tolist(),80)
            pose.update({'species':folder,'variant':record['variant'],'woodOnly':True,'clay':clay,'closeup':True,
                         'label':'Bark crevices — '+('untextured geometry' if clay else 'photographic material')})
            manifest['views'].append(pose)
