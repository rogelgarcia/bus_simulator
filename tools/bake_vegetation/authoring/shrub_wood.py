# Reshapes shrub wood below retained foliage anchors and grows continuous root crowns.
import math
import random

from mathutils import Vector


def shape_stems(paths, variant):
    rng = random.Random(variant['seed'] + 581)
    stems, sizes = [], []
    for path in paths:
        if abs(path['points'][0][2]) > .00001:
            continue
        points = [Vector(point) for point in path['points']]
        widths = path['radii']
        limit = min(.52, points[-1].z * .34)
        angle = rng.uniform(0, math.tau)
        offset = Vector((math.cos(angle), math.sin(angle), 0)) * rng.uniform(.025, .055)
        size = rng.uniform(.74, 1.42)
        shaped, radii = [], []
        for i in range(len(points) - 1):
            count = max(2, math.ceil((points[i + 1] - points[i]).length / .035))
            for step in range(count):
                t = step / count
                point = points[i].lerp(points[i + 1], t)
                progress = min(1, max(0, point.z / limit))
                point += offset * math.sin(math.pi * progress) ** 2
                radius = widths[i] * (1 - t) + widths[i + 1] * t
                radius *= 1 + (size - 1) * max(0, 1 - point.z / .95)
                radius *= 1 + .065 * math.sin(point.z * 13 + angle) * max(0, 1 - point.z / 1.2)
                shaped.append(tuple(point))
                radii.append(radius)
        shaped.append(tuple(points[-1]))
        radii.append(widths[-1])
        buried = Vector(shaped[0]); buried.z = -.075
        path.update(points=[tuple(buried)] + shaped, radii=[radii[0]] + radii,
                    basal=True, root_seed=rng.randrange(1000000), texture_v_metres=.32,
                    texture_v_offset=rng.random(), oval_phase=angle)
        stems.append(path)
        sizes.append(radii[0] * 2)
    for path in paths:
        path.setdefault('texture_v_metres', .32)
        path.setdefault('texture_v_offset', path['phase'] * 3.713)
    if len(stems) != variant['stemCount']:
        raise RuntimeError('Shrub basal stem count differs from the authored skeleton')
    return {'basalStemCount': len(stems), 'stemDiameterRangeMetres': [min(sizes), max(sizes)],
            'basalCurveOffsetRangeMetres': [.025, .055], 'rootFlareHeightMetres': .18}
