# Builds species-specific mature crowns and shrubs from shared efficient tube and leaf-card primitives.
import math
import random

import bpy
from mathutils import Vector


class MeshBuilder:
    def __init__(self):
        self.positions = []
        self.faces = []
        self.uvs = []
        self.colors = []
        self.wood_paths = []
        self.leaf_clusters = []

    def point(self, position, uv, color=(1, 1, 1, 1)):
        self.positions.append(tuple(position))
        self.uvs.append(uv)
        self.colors.append(color)
        return len(self.positions) - 1

    def mesh(self, name, material):
        data = bpy.data.meshes.new(name)
        data.from_pydata(self.positions, [], self.faces)
        data.materials.append(material)
        uv = data.uv_layers.new(name='UVMap')
        color = data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='POINT')
        for index, value in enumerate(self.colors):
            color.data[index].color = value
        for polygon in data.polygons:
            polygon.use_smooth = True
            for loop_index in polygon.loop_indices:
                uv.data[loop_index].uv = self.uvs[data.loops[loop_index].vertex_index]
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        return obj


def basis(direction):
    direction = direction.normalized()
    reference = Vector((0, 0, 1)) if abs(direction.z) < .9 else Vector((1, 0, 0))
    side = direction.cross(reference).normalized()
    return side, direction.cross(side).normalized()


def curve(a, b, bend, segments):
    return [a.lerp(b, index / segments) + bend * math.sin(math.pi * index / segments) for index in range(segments + 1)]


def tube(mesh, points, radii, sides, uv_phase, flare=0, color=(1, 1, 1, 1)):
    mesh.wood_paths.append({'points': [tuple(point) for point in points], 'radii': list(radii), 'phase': uv_phase})
    rings = []
    distance = 0
    for index, (point, radius) in enumerate(zip(points, radii)):
        if index:
            distance += (point - points[index - 1]).length
        direction = points[min(index + 1, len(points) - 1)] - points[max(0, index - 1)]
        side, across = basis(direction)
        ring = []
        for spoke in range(sides + 1):
            angle = math.tau * spoke / sides
            ridge = 1 + flare * (max(0, math.sin(angle * 5 + uv_phase)) ** 2) * math.exp(-index * 1.3)
            offset = (side * math.cos(angle) + across * math.sin(angle)) * radius * ridge
            position = point + offset
            if point.z == 0:
                position.z = 0
            ring.append(mesh.point(position, (uv_phase + spoke / sides * math.tau * max(radii[0], .07) / 1.65, distance / 2.2), color))
        rings.append(ring)
    for lower, upper in zip(rings[:-1], rings[1:]):
        for spoke in range(sides):
            mesh.faces.append((lower[spoke], lower[spoke + 1], upper[spoke + 1], upper[spoke]))
    mesh.faces.append(tuple(reversed(rings[0][:-1])))
    mesh.faces.append(tuple(rings[-1][:-1]))


def card(mesh, center, direction, rng, tier, size=.76, attachment=None):
    upward = direction.normalized()
    normal = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-.45, 1.3))).normalized()
    side = upward.cross(normal).normalized()
    across = side.cross(normal).normalized()
    angle = rng.uniform(-math.pi, math.pi)
    u = side * math.cos(angle) + across * math.sin(angle)
    v = -side * math.sin(angle) + across * math.cos(angle)
    width, height = size * rng.uniform(.79, .94), size * rng.uniform(.92, 1.14)
    tile = rng.randrange(2 if tier['twoSidedAtlas'] else 4)
    tint = rng.uniform(.84, 1.13)
    color = (tint * rng.uniform(.97, 1.02), tint, tint * rng.uniform(.94, 1.06), 1)
    mesh.leaf_clusters.append({'center': tuple(center), 'u': tuple(u), 'v': tuple(v), 'normal': tuple(normal),
                              'width': width, 'height': height, 'color': color,
                              'attachment': tuple(center if attachment is None else attachment)})
    inset = .004
    def vertex(x, y, bend, tile_index=tile):
        uv = ((tile_index % 2 + inset + (x + .5) * (1 - 2 * inset)) / 2,
              (1 - tile_index // 2 - inset - (y + .5) * (1 - 2 * inset)) / 2 + .5)
        return mesh.point(center + u * x * width + v * y * height + normal * bend, uv, color)
    folded = tier['cardFold'] and rng.random() < .55
    fold = size * rng.uniform(.025, .075) if folded else 0
    if folded:
        a, b, c = vertex(-.5, -.5, 0), vertex(0, -.5, fold), vertex(.5, -.5, 0)
        d, e, f = vertex(-.5, .5, 0), vertex(0, .5, fold), vertex(.5, .5, 0)
        mesh.faces.extend([(a, b, e, d), (b, c, f, e)])
    elif tier['twoSidedAtlas']:
        corners = [(-.5, -.5), (.5, -.5), (.5, .5), (-.5, .5)]
        front = [vertex(x, y, 0) for x, y in corners]
        back = [vertex(x, y, 0, tile + 2) for x, y in corners]
        mesh.faces.extend([(front[2], front[1], front[0]), (front[3], front[2], front[0]),
                           (back[0], back[1], back[2]), (back[0], back[2], back[3])])
    else:
        mesh.faces.append((vertex(-.5, -.5, 0), vertex(.5, -.5, 0), vertex(.5, .5, 0), vertex(-.5, .5, 0)))
    return folded


def create_tree(recipe, tier, materials, growth):
    rng = random.Random(recipe['seed'])
    bark, foliage = MeshBuilder(), MeshBuilder()
    height, radius = recipe['height'], recipe['radius']
    trunk_radius = recipe['trunkRadius']
    trunk = []
    for index in range(15):
        f = index / 14
        trunk.append(Vector((math.sin(f * 4.4) * trunk_radius * 1.5 * f,
                             math.sin(f * 6.1 + .3) * trunk_radius * f, f * height * growth['leaderFraction'])))
    trunk_radii = [trunk_radius * (1 - index / 14) ** .8 + .002 for index in range(15)]
    tube(bark, trunk, trunk_radii, tier['radialSegments'], .31, .65)
    for root in range(6):
        angle = root * math.tau / 6 + rng.uniform(-.25, .25)
        direction = Vector((math.cos(angle), math.sin(angle), 0))
        tangent = Vector((-direction.y, direction.x, 0))
        length = trunk_radius * rng.uniform(1.7, 2.5)
        width = trunk_radius * .38
        a = bark.point(direction * trunk_radius * .7 - tangent * width, (0, 0))
        b = bark.point(direction * trunk_radius * .7 + tangent * width, (.2, 0))
        c = bark.point(direction * length + tangent * width * .3, (.2, .12))
        d = bark.point(direction * length - tangent * width * .3, (0, .12))
        e = bark.point(direction * trunk_radius * .75 + Vector((0, 0, trunk_radius * 1.5)), (.1, .35))
        f = bark.point(direction * length * .72 + Vector((0, 0, trunk_radius * .15)), (.1, .10))
        bark.faces.extend([(a, b, e), (a, e, f, d), (b, c, f, e), (d, f, c)])
    primary_count = recipe['scaffolds']
    twig_count, card_count, folded_count = 0, 0, 0
    scaffold_paths = []
    main_count = recipe['mainLimbs']
    for primary in range(primary_count):
        f = (primary + .5) / primary_count
        angle = primary * 2.399963 + rng.uniform(-.25, .25)
        outward = Vector((math.cos(angle), math.sin(angle), 0))
        tangential = Vector((-outward.y, outward.x, 0))
        branch_index = primary if growth['habit'] == 'pyramidal' else primary % main_count
        start_h = height * (growth['branchBase'] + branch_index * growth['branchStep'] + rng.uniform(-.025, .025))
        start = Vector((math.sin(start_h / height * 4.4) * trunk_radius * .8, 0, start_h))
        end_h = height * (growth['crownBand'][0] + growth['crownBand'][1] * f + rng.uniform(-.025, .025))
        crown_profile = math.sqrt(max(.08, 1 - ((end_h / height - growth['crownCenter']) / growth['crownHalfHeight']) ** 2))
        if growth['habit'] == 'pyramidal':
            crown_profile = .12 + (1 - f) ** .60
        center_radius = radius * crown_profile * rng.uniform(.74, .94)
        if primary % 5 == 4 and growth['habit'] != 'pyramidal':
            center_radius *= .40
        end = outward * center_radius
        end.z = end_h
        end += tangential * rng.uniform(-.12, .12) * radius
        bend = outward * radius * .075 + Vector((0, 0, height * -.025))
        if growth['habit'] == 'vase':
            # Elm scaffolds rise steeply before arching outward into the elevated crown.
            bend = outward * radius * -.13 + Vector((0, 0, height * .075))
        branch_radius = trunk_radius * rng.uniform(.37, .56)
        if primary >= main_count:
            split = start.lerp(end, .40) + bend * math.sin(math.pi * .40)
            candidates = scaffold_paths[:main_count]
            parent = min(candidates, key=lambda item: (item['start'].lerp(item['end'], .65)
                         + item['bend'] * math.sin(math.pi * .65) - split).length_squared)
            start = parent['start'].lerp(parent['end'], .65) + parent['bend'] * math.sin(math.pi * .65)
            branch_radius = min(branch_radius, parent['radius'] * .56)
            bend = outward * radius * .04 + Vector((0, 0, height * .012))
            if growth['habit'] == 'vase':
                bend = outward * radius * -.055 + Vector((0, 0, height * .035))
        primary_points = curve(start, end, bend, tier['branchSegments'])
        scaffold_paths.append({'start': start, 'end': end, 'bend': bend, 'radius': branch_radius})
        radii = [branch_radius * (1 - i / (len(primary_points) - 1)) ** .8 + .014 for i in range(len(primary_points))]
        tube(bark, primary_points, radii, max(5, tier['radialSegments'] - 2), rng.random())
        for secondary in range(recipe['secondary']):
            secondary_start = growth.get('secondaryStart', .32)
            sf = min(.99, max(secondary_start - .04, secondary_start + (.99 - secondary_start) * secondary / (recipe['secondary'] - 1) + rng.uniform(-.04, .04)))
            origin = start.lerp(end, sf) + bend * math.sin(math.pi * sf)
            phi = secondary * 2.399963 + rng.uniform(-.5, .5)
            elevation = rng.uniform(-.90, 1.0)
            cluster_direction = Vector((math.cos(phi), math.sin(phi), elevation))
            cluster_direction.normalize()
            secondary_end = origin + outward * radius * .09 + cluster_direction * radius * rng.uniform(.12, .22)
            secondary_end.z = max(height * recipe['crownBase'] + .8, secondary_end.z)
            secondary_points = curve(origin, secondary_end, Vector((0, 0, -.10)), 4 if tier['cardFold'] else 3)
            count = len(secondary_points)
            radii = [(branch_radius * .23 * (1 - i / (count - 1)) + .002) for i in range(count)]
            tube(bark, secondary_points, radii, tier['secondarySides'], rng.random(), color=(.75, .72, .65, 1))
            for tertiary in range(recipe['tertiary']):
                tf = rng.uniform(.25, 1)
                twig_start = origin.lerp(secondary_end, tf)
                twist = rng.uniform(0, math.tau)
                twig_direction = Vector((math.cos(twist), math.sin(twist), rng.uniform(-.8, .9)))
                twig_direction.normalize()
                twig_end = twig_start + twig_direction * rng.uniform(*growth['twigLength']) * (height / 15) ** .30
                twig_count += 1
                twig_uv_phase = rng.random()
                if tier['twigSides']:
                    tube(bark, curve(twig_start, twig_end, Vector((0, 0, -.04)), 2), [.006, .003, .0006], tier['twigSides'], twig_uv_phase, color=(.55, .49, .39, 1))
                for leaf in range(recipe['cardsPerTwig']):
                    lf = (leaf + .5) / recipe['cardsPerTwig']
                    spread = growth['jitter']
                    jitter = Vector((rng.uniform(-spread, spread), rng.uniform(-spread, spread), rng.uniform(-spread * .87, spread * .87)))
                    center = twig_start.lerp(twig_end, lf) + jitter
                    keep = rng.random() <= tier['cardKeep']
                    card_seed = rng.randrange(2 ** 30)
                    if keep:
                        folded_count += int(card(foliage, center, twig_direction, random.Random(card_seed), tier, growth['cardSize'], twig_start))
                        card_count += 1
    for peel in range(tier['peelFins']):
        angle = rng.uniform(0, math.tau)
        z = rng.uniform(.5, height * .37)
        radial = trunk_radius * (1 - z / (height * .67)) ** .8 + .002
        normal = Vector((math.cos(angle), math.sin(angle), 0))
        tangent = Vector((-normal.y, normal.x, 0))
        center = Vector((math.sin(z / (height * .67) * 4.4) * trunk_radius * 1.5 * z / (height * .67),
                         math.sin(z / (height * .67) * 6.1 + .3) * trunk_radius * z / (height * .67), z)) + normal * radial
        w, h = rng.uniform(.03, .065), rng.uniform(.11, .32)
        a = bark.point(center - tangent * w, (angle / math.tau, z / 2.2))
        b = bark.point(center + tangent * w, (angle / math.tau + w, z / 2.2))
        c = bark.point(center + Vector((0, 0, h)) + normal * .012, (angle / math.tau + w, (z + h) / 2.2))
        bark.faces.append((a, b, c))
    objects = [bark.mesh('bark', materials['bark']), foliage.mesh('foliage', materials['foliage'])]
    objects[0]['wood_paths'] = str(bark.wood_paths)
    objects[1]['leaf_clusters'] = str(foliage.leaf_clusters)
    lowest = min(vertex.co.z for obj in objects for vertex in obj.data.vertices)
    for obj in objects:
        for vertex in obj.data.vertices:
            vertex.co.z -= lowest
    return objects, {'twigCount': twig_count, 'cardCount': card_count, 'nominalLeavesPerCard': growth['leavesPerCard'],
                     'leafWidthMetres': growth['leafWidthMetres'], 'cardTrianglesRange': [4, 4] if tier['twoSidedAtlas'] else [2, 2],
                     'flatCardCount': card_count - folded_count, 'foldedCardCount': folded_count,
                     'foldedCardFraction': folded_count / card_count, 'peelFins': tier['peelFins'],
                     'scaffoldCount': primary_count, 'mainLimbCount': main_count}


def create_shrub(recipe, profile, materials, growth):
    rng = random.Random(recipe['seed'])
    bark, foliage = MeshBuilder(), MeshBuilder()
    height, radius = recipe['height'], recipe['radius']
    card_count = 0
    for stem in range(recipe['stemCount']):
        angle = stem * 2.399963 + rng.uniform(-.28, .28)
        outward = Vector((math.cos(angle), math.sin(angle), 0))
        start = outward * rng.uniform(.02, .24) * radius
        f = (stem + .5) / recipe['stemCount']
        reach = radius * (.25 + .70 * math.sqrt(max(0, 1 - (2 * f - 1) ** 2)))
        end = outward * reach
        end.z = height * (.45 + .43 * f) * (1 + recipe['asymmetry'] * math.sin(angle))
        start.x *= recipe['spread'][0]
        start.y *= recipe['spread'][1]
        end.x *= recipe['spread'][0]
        end.y *= recipe['spread'][1]
        bend = outward * radius * -.12 + Vector((0, 0, height * .12))
        stem_points = curve(start, end, bend, 5)
        tube(bark, stem_points, [.035 * (1 - k / 5) + .003 for k in range(6)], 5, rng.random())
        for shoot in range(recipe['secondary']):
            sf = .24 + .73 * shoot / (recipe['secondary'] - 1)
            origin = start.lerp(end, sf) + bend * math.sin(math.pi * sf)
            direction = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-.12, .75))).normalized()
            shoot_end = origin + direction * rng.uniform(.35, .65)
            tube(bark, curve(origin, shoot_end, Vector((0, 0, .05)), 2), [.009, .0045, .001], 3, rng.random())
            for leaf in range(recipe['cardsPerTwig']):
                lf = (leaf + .5) / recipe['cardsPerTwig']
                spread = growth['jitter']
                center = origin.lerp(shoot_end, lf) + Vector((rng.uniform(-spread, spread), rng.uniform(-spread, spread), rng.uniform(-spread, spread)))
                center.z = max(growth['cardSize'] * .47, center.z)
                card(foliage, center, direction, rng, profile, growth['cardSize'], origin.lerp(shoot_end, lf))
                card_count += 1
    objects = [bark.mesh('bark', materials['bark']), foliage.mesh('foliage', materials['foliage'])]
    objects[0]['wood_paths'] = str(bark.wood_paths)
    objects[1]['leaf_clusters'] = str(foliage.leaf_clusters)
    lowest = min(vertex.co.z for obj in objects for vertex in obj.data.vertices)
    for obj in objects:
        for vertex in obj.data.vertices:
            vertex.co.z -= lowest
    return objects, {'stemCount': recipe['stemCount'], 'twigCount': recipe['stemCount'] * recipe['secondary'],
                     'cardCount': card_count, 'nominalLeavesPerCard': growth['leavesPerCard'], 'leafWidthMetres': growth['leafWidthMetres'],
                     'cardTrianglesRange': [2, 2], 'flatCardCount': card_count, 'foldedCardCount': 0,
                     'foldedCardFraction': 0, 'peelFins': 0}
