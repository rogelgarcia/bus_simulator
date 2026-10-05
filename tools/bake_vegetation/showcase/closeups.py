# Frames the authored branch skeleton and basal flare without altering the model.
import ast
import math

import bpy
from mathutils import Vector


def add_closeups(scene, folder, recipe, camera):
    bark = bpy.data.objects[f'{folder}/mature_01 / original wood']
    origin = bark.location.copy()
    variant = recipe['variants'][0]
    shrub = recipe['kind'] == 'shrub'
    paths = ast.literal_eval(bark['wood_paths'])
    outward = Vector((-.5, -math.sqrt(.75), 0))
    if shrub:
        target = origin + Vector((0, 0, .62))
        trunk_span, root_span = 1.25, .80
        root_target = origin + Vector((0, 0, .25))
    else:
        radius = variant['trunkRadius']
        candidates = [row for row in paths[1:] if max(row['radii']) > radius * .28
                      and variant['height'] * .1 < row['points'][0][2] < variant['height'] * .55]
        if not candidates:
            raise RuntimeError(f'Cannot find a primary branch junction for {folder}')
        branch = min(candidates, key=lambda row: row['points'][0][2]
                     - .3 * Vector(row['points'][-1]).normalized().dot(outward))
        target = origin + Vector(branch['points'][0]) + Vector((0, 0, .16))
        trunk_span, root_span = max(2.2, radius * 5.3), max(1.45, radius * 3.6)
        root_target = origin + Vector((0, 0, radius * .8))
    views = []
    for suffix, label, center, span, vertical in [
        ('trunk_closeup', 'Trunk and branch junction', target, trunk_span, -.12),
        ('roots_closeup', 'Root flare and ground contact', root_target, root_span, .30)
    ]:
        # A 72 mm lens resolves bark detail; the vertical field spans the feature in metres.
        distance = span * 72 / 20.25
        position = center + outward * distance + Vector((0, 0, span * vertical))
        view = camera(scene, folder + '_' + suffix, position, center, 72)
        view.update({'species': folder, 'variant': 'mature_01', 'label': label,
                     'detailSpanMetres': span, 'closeup': True})
        views.append(view)
    return views
