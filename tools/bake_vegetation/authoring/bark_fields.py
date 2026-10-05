# Samples periodic species-specific bark relief shared by mesh displacement and PBR maps.
import numpy as np


BARK_U_METERS = 1.65
BARK_V_METERS = 2.2
BARK_RELIEF_METERS = {'mottled': .004, 'ridged_gray': .010, 'oak_furrows': .020, 'shrub_bark': .002, 'elm_ridges': .015}


def bark_color(kind, fields):
    height, furrow, rim = fields['height'], fields['furrow'], fields['rim']
    weather, plate = fields['weather'], fields['plate']
    if kind == 'mottled':
        middle, old = np.clip(plate / .62, 0, 1), np.clip((plate - .62) / .38, 0, 1)
        rgb = np.array([156, 154, 136]) + middle[..., None] * np.array([-17, -13, -13])
        rgb = rgb + old[..., None] * np.array([-28, -28, -24])
        rgb += (weather * 16 - furrow * 7 + rim * 3)[..., None]
    elif kind == 'ridged_gray':
        rgb = np.array([113, 119, 107]) + (height * 26 - furrow * 31 + weather * 13)[..., None]
        rgb += (plate - .5)[..., None] * np.array([11, 9, 5])
    elif kind == 'oak_furrows':
        rgb = np.array([103, 102, 94]) + (height * 17 - furrow * 19 + weather * 15)[..., None]
        rgb += furrow[..., None] * np.array([4, -2, -5]) + (plate - .5)[..., None] * np.array([13, 10, 7])
    elif kind == 'elm_ridges':
        rgb = np.array([105, 102, 90]) + (height * 23 - furrow * 22 + weather * 16)[..., None]
        rgb += (plate - .5)[..., None] * np.array([14, 10, 6])
    elif kind == 'shrub_bark':
        rgb = np.array([120, 116, 102]) + (weather * 12 + rim * 7)[..., None]
        rgb += furrow[..., None] * np.array([-5, -18, -24])
    else:
        raise ValueError(f'Unknown bark palette: {kind}')
    srgb = np.clip(rgb / 255, 0, 1)
    return np.where(srgb <= .04045, srgb / 12.92, ((srgb + .055) / 1.055) ** 2.4)


def _smooth(low, high, value):
    t = np.clip((value - low) / (high - low), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _hash(x, y, seed):
    value = (np.asarray(x, dtype=np.uint64) * 374761393
             + np.asarray(y, dtype=np.uint64) * 668265263 + seed * 982451653) & 0xffffffff
    value = ((value ^ (value >> 13)) * 1274126177) & 0xffffffff
    return ((value ^ (value >> 16)) & 0xffffffff).astype(np.float64) / 4294967295.0


def _noise(u, v, columns, rows, seed):
    x, y = u * columns, v * rows
    ix, iy = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    fx, fy = x - ix, y - iy
    sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    a = _hash(ix % columns, iy % rows, seed)
    b = _hash((ix + 1) % columns, iy % rows, seed)
    c = _hash(ix % columns, (iy + 1) % rows, seed)
    d = _hash((ix + 1) % columns, (iy + 1) % rows, seed)
    return ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy) * 2 - 1


def _cells(u, v, columns, rows, seed):
    x, y = u * columns, v * rows
    ix, iy = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    first, second = np.full(u.shape, 100.0), np.full(u.shape, 100.0)
    label = np.zeros(u.shape)
    for oy in [-1, 0, 1]:
        for ox in [-1, 0, 1]:
            cx, cy = (ix + ox) % columns, (iy + oy) % rows
            px = ix + ox + .18 + .64 * _hash(cx, cy, seed)
            py = iy + oy + .12 + .76 * _hash(cx, cy, seed + 1)
            distance = (x - px) ** 2 + (y - py) ** 2
            nearer = distance < first
            second = np.where(nearer, first, np.minimum(second, distance))
            first = np.where(nearer, distance, first)
            label = np.where(nearer, _hash(cx, cy, seed + 2), label)
    return np.sqrt(second) - np.sqrt(first), label


def sample_bark(kind, u, v):
    if kind not in BARK_RELIEF_METERS:
        raise ValueError(f'Unknown bark field: {kind}')
    u, v = np.broadcast_arrays(np.asarray(u, dtype=np.float64), np.asarray(v, dtype=np.float64))
    if not (np.all(np.isfinite(u)) and np.all(np.isfinite(v))):
        raise ValueError('Bark coordinates must be finite')
    u, v = u % 1.0, v % 1.0
    weather = _noise(u, v, 4, 5, 31) * .65 + _noise(u, v, 11, 13, 47) * .35
    grain = (_noise(u, v, 113, 157, 59) * .55 + _noise(u, v, 271, 331, 67) * .30
             + _noise(u, v, 631, 719, 73) * .15)
    wu = u + .027 * _noise(u, v, 4, 5, 79) + .009 * _noise(u, v, 13, 17, 83)
    wv = v + .023 * _noise(u, v, 5, 4, 89) + .007 * _noise(u, v, 17, 13, 97)
    if kind == 'mottled':
        pu = wu + .045 * _noise(u, v, 7, 9, 101)
        pv = wv + .032 * _noise(u, v, 9, 7, 103)
        peel = (.50 * _noise(pu, pv, 5, 4, 107) + .27 * _noise(pu, pv, 11, 9, 109)
                + .14 * _noise(pu, pv, 23, 19, 113) + .06 * _noise(pu, pv, 47, 41, 223)
                + .03 * _noise(pu, pv, 97, 83, 227))
        middle = _smooth(-.13, -.10, peel)
        old = _smooth(.105, .135, peel)
        label = middle * .62 + old * .38
        margin = np.minimum(np.abs(peel + .115), np.abs(peel - .12))
        rim = np.exp(-(margin / .014) ** 2) * (.55 + .45 * _noise(u, v, 31, 29, 229))
        furrow = np.exp(-(margin / .007) ** 2) * .40
        height = .14 + middle * .18 + old * .31 + rim * .15 + weather * .022
        detail = grain * (.10 + old * .10) + _noise(u, v, 47, 59, 233) * (.04 + old * .08)
    elif kind == 'ridged_gray':
        edge, label = _cells(wu, wv, 25, 5, 127)
        fiber_edge, _ = _cells(wu + .004 * weather, wv, 61, 11, 131)
        interior = _smooth(.025, .32, edge)
        furrow = 1 - _smooth(.018, .13, edge)
        rim = np.exp(-((edge - .20) / .10) ** 2)
        fiber = 1 - _smooth(.014, .070, fiber_edge)
        height = .10 + interior * (.60 + label * .19) - fiber * interior * .065
        detail = grain * .13 - fiber * .22 + _noise(u, v, 151, 23, 137) * .12
    elif kind == 'oak_furrows':
        ou = wu + .005 * _noise(u, v, 41, 53, 179)
        ov = wv + .006 * _noise(u, v, 47, 43, 181)
        edge, label = _cells(ou, ov, 23, 7, 149)
        plate_edge, _ = _cells(ou, ov, 53, 19, 151)
        width = .043 + .014 * _noise(u, v, 29, 31, 191)
        interior = _smooth(width * .24, width * 2.0, edge)
        continuity = .38 + .62 * _smooth(-.32, .38, _noise(u, v, 13, 41, 193))
        furrow = (1 - _smooth(width * .18, width * 1.25, edge)) * continuity
        rim = (1 - _smooth(width * 1.1, width * 2.6, edge)) * interior
        fissure = (1 - _smooth(.009, .050, plate_edge))
        fissure *= _smooth(-.1, .35, _noise(u, v, 19, 37, 197))
        chips = _noise(ou, ov, 43, 61, 199) * .052 + _noise(ou, ov, 89, 73, 211) * .018
        height = .30 + interior * (.29 + label * .13 + chips) - fissure * interior * .09
        height += (1 - continuity) * (1 - interior) * .14
        detail = grain * .19 - fissure * .27 + _noise(u, v, 131, 71, 157) * .15
    elif kind == 'elm_ridges':
        eu = wu + .016 * _noise(u, v, 9, 17, 239)
        edge, label = _cells(eu, wv, 30, 4, 241)
        fibers, _ = _cells(eu, wv, 79, 14, 251)
        interior = _smooth(.018, .20, edge)
        continuity = .45 + .55 * _smooth(-.28, .36, _noise(u, v, 17, 31, 257))
        furrow = (1 - _smooth(.012, .11, edge)) * continuity
        rim = np.exp(-((edge - .13) / .09) ** 2)
        fissure = (1 - _smooth(.008, .07, fibers)) * interior
        height = .20 + interior * (.42 + label * .16) - fissure * .08 + (1 - continuity) * .07
        detail = grain * .17 - fissure * .20 + _noise(u, v, 149, 47, 263) * .11
    else:
        edge, label = _cells(wu, wv, 63, 12, 163)
        interior = _smooth(.006, .19, edge)
        furrow = 1 - _smooth(.009, .072, edge)
        rim = _smooth(.58, .82, _noise(u, v, 43, 67, 173))
        height = .35 + interior * (.22 + label * .16) + rim * .12
        detail = grain * .12 + _noise(u, v, 149, 83, 167) * .06
    return {'height': np.clip(height, 0, 1), 'furrow': furrow, 'rim': rim, 'weather': weather,
            'grain': grain, 'detail': detail, 'plate': label}
