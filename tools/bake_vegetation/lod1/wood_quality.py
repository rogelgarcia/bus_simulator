# Measures reduced wood against source surfaces in the direction that detects new protruding triangles.
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from common import clear_scene, write_json
from wood import geometry_error


def reverse_error(high, low):
    tree = BVHTree.FromPolygons([v.co for v in high.data.vertices], [p.vertices[:] for p in high.data.polygons], all_triangles=True)
    vertices = [tree.find_nearest(v.co)[3] for v in low.data.vertices]
    hits = [tree.find_nearest(sum((low.data.vertices[i].co for i in p.vertices), Vector())/len(p.vertices)) for p in low.data.polygons]
    centers = [hit[3] for hit in hits]
    result = {'vertexMax': float(max(vertices)), 'vertexP99': float(np.quantile(vertices,.99)),
            'faceMax': float(max(centers)), 'faceP99': float(np.quantile(centers,.99))}
    return result


def inspect(options):
    for model in options['models']:
        clear_scene(); objects = []
        for root, lod in [(options['source'], 0), (options['output'], 1)]:
            with bpy.data.libraries.load(str(Path(root)/model/'wood.blend'), link=False) as (available, loaded):
                loaded.objects = [model+f' / LOD{lod} wood']
            obj = loaded.objects[0]; bpy.context.scene.collection.objects.link(obj); objects.append(obj)
        report = reverse_error(*objects)
        report['forward'] = geometry_error(*objects)
        write_json(Path(options['output'])/model/'reverse-geometry-error.json', report)
        print(f'[LOD1] Reverse surface error {model}: {report}', flush=True)
