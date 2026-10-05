# Authors opaque upper/lower leaf tissue and venation maps for modeled leaf shells.
import numpy as np


def solid_leaf_maps(directory, size, recipe, png):
    yy, xx = np.mgrid[0:size, 0:size]
    u, v = (xx + .5) / size, 1 - (yy + .5) / size
    upper = v >= .5
    t = ((v % .5) - .03) / .44
    x = (u - .03) / .94 - .5
    kind = recipe['leaf']
    backs = {'plane': [91, 117, 64], 'linden': [154, 168, 138], 'oak': [87, 111, 58], 'viburnum': [83, 112, 58], 'elm': [83, 104, 56]}
    front = np.array(recipe['baseColor'], float) + [7, 8, 4]
    back = np.array(backs[kind], float)
    color = np.where(upper[:, :, None], front, back)
    midrib = np.exp(-(x / .009) ** 2)
    vein = midrib.copy()
    if kind == 'plane':
        for slope in [-.78, -.43, .43, .78]:
            vein = np.maximum(vein, np.exp(-((x - slope * (t - .06)) / .006) ** 2))
    else:
        for row in np.linspace(.12, .85, 8):
            distance = t - row - np.abs(x) * .70
            vein = np.maximum(vein, np.exp(-(distance / .0055) ** 2) * (1 - np.abs(x) * 1.1))
    fine = np.sin(x * 91 + t * 47) * np.sin(t * 117 - x * 53) * 1.2
    mottling = np.sin(x * 17 + t * 9) * np.sin(t * 27 - x * 6) * 2.3
    color += (fine + mottling)[:, :, None]
    color += vein[:, :, None] * np.array([11, 13, 5])
    color -= (np.abs(x) * 5)[:, :, None]
    normals = np.zeros((size, size, 3)); normals[:, :, 2] = 1
    height = vein * .000035 + fine * .000002
    normals[:, :, 0] = -(np.roll(height, -1, 1) - np.roll(height, 1, 1)) * size / .3
    normals[:, :, 1] = -(np.roll(height, 1, 0) - np.roll(height, -1, 0)) * size / .3
    normals /= np.linalg.norm(normals, axis=2, keepdims=True)
    rough = np.where(upper, recipe['leafRoughness'], 205 if kind == 'linden' else 184) + vein * 9
    petiole = np.abs(v - .5) < .012
    color[petiole] = [104, 96, 57]; rough[petiole] = 192; normals[petiole] = [0, 0, 1]
    png(directory / 'foliage_basecolor.png', np.concatenate([color, np.full((size, size, 1), 255)], axis=2))
    png(directory / 'foliage_normal.png', (normals * .5 + .5) * 255)
    png(directory / 'foliage_orm.png', np.stack([np.full_like(rough, 255), rough, np.zeros_like(rough)], axis=2))
