# Partition the reference crown into five interior masses and a spatially distributed outer shell.
import json
from pathlib import Path

import numpy as np

from common import write_json


def allocation(options):
    rows = json.loads((Path(options['baseline']) / 'summary.json').read_text())['models']
    weights = np.sqrt([row['canopyTriangles'] for row in rows])
    exact = weights / weights.sum() * 25000
    counts = np.floor(exact).astype(int)
    for i in np.argsort(-(exact - counts))[:25000 - counts.sum()]: counts[i] += 1
    return {row['id']: int(count) for row, count in zip(rows, counts)}


def layout(options, model, wings):
    points = np.array([wing['center'] for wing in wings])
    center = points.mean(axis=0)
    seeds = [int(np.argmin(np.linalg.norm(points - center, axis=1)))]
    distance = np.full(len(points), np.inf)
    for _ in range(4):
        distance = np.minimum(distance, np.sum((points - points[seeds[-1]]) ** 2, axis=1))
        seeds.append(int(np.argmax(distance)))
    centers = points[seeds].copy()
    for _ in range(24):
        labels = np.argmin(np.sum((points[:, None] - centers[None]) ** 2, axis=2), axis=1)
        updated = np.array([points[labels == i].mean(axis=0) for i in range(5)])
        if np.max(np.abs(updated - centers)) < .001: break
        centers = updated
    planes, masses = [], []
    variant = int(model[-2:])
    radial = np.zeros(len(points))
    for i, center in enumerate(centers):
        ids = np.flatnonzero(labels == i)
        local = points[ids] - center
        radii = np.maximum(np.quantile(np.abs(local), .95, axis=0), .05)
        r = np.linalg.norm(local / radii, axis=1)
        radial[ids] = r
        interior = ids[r <= 1.18]
        angle = i * 1.256637 + variant * .37
        x = np.array([np.cos(angle), np.sin(angle), 0.])
        y = np.array([-np.sin(angle), np.cos(angle), 0.])
        z = np.array([0., 0., 1.])
        bases = [np.column_stack([x, z, -y]), np.column_stack([y, z, x]), np.column_stack([x, y, z])]
        masses.append({'center': center.tolist(), 'radii': radii.tolist(), 'referencePatches': len(ids)})
        for axis, basis in enumerate(bases):
            projected = (points[interior] - center) @ basis
            padding = max(float(max(wings[j]['size'])) for j in interior) * 1.5
            size = np.maximum(np.max(np.abs(projected[:, :2]), axis=0) * 2 + padding, .2)
            planes.append({'center': center, 'basis': basis, 'size': size, 'ids': interior,
                           'cluster': i, 'axis': axis, 'kind': 'core', 'tile': (variant - 1) * 15 + i * 3 + axis})
    count = allocation(options)[model] - len(planes)
    candidates = np.flatnonzero(radial > .76)
    if len(candidates) < count: candidates = np.arange(len(points))
    rng = np.random.default_rng(59100 + variant)
    # Farthest-point sampling prevents repeated cards being spent in the same local pocket.
    minimum = np.full(len(candidates), np.inf)
    chosen = []
    next_index = int(np.argmax(radial[candidates]))
    for _ in range(count):
        selected = candidates[next_index]
        chosen.append(int(selected))
        delta = points[candidates] - points[selected]
        minimum = np.minimum(minimum, np.sum(delta * delta, axis=1))
        minimum[next_index] = -1
        next_index = int(np.argmax(minimum * (.8 + .2 * np.minimum(radial[candidates], 1.6))))
    for order, selected in enumerate(chosen):
        wing = wings[selected]
        normal = wing['basis'][:, 2].copy()
        outward = points[selected] - centers[labels[selected]]
        outward /= max(np.linalg.norm(outward), 1e-6)
        if np.dot(normal, outward) < 0: normal = -normal
        normal = normal * .45 + outward * .55
        normal /= np.linalg.norm(normal)
        vertical = np.array([0., 0., 1.])
        if abs(normal[2]) > .93: vertical = np.array([0., 1., 0.])
        y = vertical - normal * np.dot(vertical, normal); y /= np.linalg.norm(y)
        x = np.cross(y, normal)
        roll = rng.uniform(-.7, .7)
        basis = np.column_stack([x*np.cos(roll)+y*np.sin(roll), y*np.cos(roll)-x*np.sin(roll), normal])
        planes.append({'center': points[selected], 'basis': basis, 'size': None, 'kind': 'outer',
                       'tile': 45 + order % 3, 'scale': float(rng.uniform(.88, 1.12))})
    return planes, masses


def save_layout(path, planes, masses):
    rows = [{key: value.tolist() if isinstance(value, np.ndarray) else value for key, value in plane.items() if key != 'ids'} for plane in planes]
    write_json(path, {'centers': masses, 'planes': rows, 'corePlanes': 15, 'outerPlanes': len(planes) - 15,
                      'doubleSided': True, 'foliageTriangles': len(planes) * 2})
