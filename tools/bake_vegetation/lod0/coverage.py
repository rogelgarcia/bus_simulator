# Remove only redundant alpha patches under a measured multi-view coverage budget.
import numpy as np

RESOLUTION = 512
ELEVATIONS = [-20, 15, 50]
AZIMUTHS = list(range(0, 360, 45))


def choose_tiles(wings, atlas, variant, spatial):
    candidates = [row for row in atlas['tiles'] if not row['back']]
    for wing in wings:
        sample = ((wing['spray'] * 2654435761) ^ (int(variant[-2:]) * 713)) % atlas['samples']
        side = wing['side']
        if spatial:
            def score(row):
                aspect = row['sourceSizeMetres'][0] / row['sourceSizeMetres'][1]
                return abs(np.log(aspect / (wing['size'][0] / wing['size'][1]))) + .6 * abs(np.log(row['leafCount'] / len(wing['ids'])))
            selected = min(candidates, key=score)
            sample, side = selected['sample'], selected['side']
        wing['tileSample'], wing['tileSide'] = int(sample), int(side)


def raster_coverage(wings, atlas, image):
    records = {(r['sample'], r['side'], int(r['back'])): r for r in atlas['tiles']}
    width, height = image.size
    rgba = np.empty(width * height * 4, np.float32)
    image.pixels.foreach_get(rgba)
    alpha = rgba.reshape((height, width, 4))[:, :, 3]
    centers = np.array([wing['center'] for wing in wings])
    extent = max(float(np.max([max(wing['size']) for wing in wings])), .01)
    pixels = [[] for _ in wings]
    views = []
    for elevation in ELEVATIONS:
        for azimuth in AZIMUTHS:
            az, el = np.radians([azimuth, elevation])
            sight = np.array([np.cos(az) * np.cos(el), np.sin(az) * np.cos(el), np.sin(el)])
            right = np.array([-np.sin(az), np.cos(az), 0])
            up = np.cross(sight, right)
            basis = np.column_stack([right, up])
            projected = centers @ basis
            minimum = projected.min(axis=0) - extent
            scale = (RESOLUTION - 2) / max(np.ptp(projected, axis=0) + extent * 2)
            view_index = len(views)
            views.append({'azimuth': azimuth, 'elevation': elevation})
            for index, wing in enumerate(wings):
                axes = (wing['basis'][:, :2] * wing['size']).T @ basis * scale
                determinant = float(np.linalg.det(axes))
                if abs(determinant) < 1e-5: continue
                center = (projected[index] - minimum) * scale + 1
                corners = np.array([[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]]) @ axes + center
                low = np.maximum(np.floor(corners.min(axis=0)).astype(int), 0)
                high = np.minimum(np.ceil(corners.max(axis=0)).astype(int), RESOLUTION - 1)
                yy, xx = np.mgrid[low[1]:high[1]+1, low[0]:high[0]+1]
                coordinates = np.column_stack([xx.ravel() + .5, yy.ravel() + .5])
                uv = (coordinates - center) @ np.linalg.inv(axes)
                inside = np.all(np.abs(uv) <= .5, axis=1)
                if not np.any(inside): continue
                uv = uv[inside] + .5
                back = int(wing['basis'][:, 2] @ sight < 0)
                if back: uv[:, 0] = 1 - uv[:, 0]
                rect = records[(wing['tileSample'], wing['tileSide'], back)]['rect']
                texels = uv * (np.array(rect[2:]) - rect[:2]) + rect[:2]
                tx = np.clip((texels[:, 0] * width).astype(int), 0, width - 1)
                ty = np.clip((texels[:, 1] * height).astype(int), 0, height - 1)
                opaque = alpha[ty, tx] >= .5
                ids = yy.ravel()[inside][opaque] * RESOLUTION + xx.ravel()[inside][opaque]
                pixels[index].append((ids + view_index * RESOLUTION ** 2).astype(np.int32))
    return [np.concatenate(row) if row else np.empty(0, np.int32) for row in pixels], views


def prune_cards(wings, atlas, image):
    pixels, views = raster_coverage(wings, atlas, image)
    counts = np.zeros(len(views) * RESOLUTION ** 2, np.int32)
    for ids in pixels: counts[ids] += 1
    before = np.count_nonzero(counts.reshape((-1, RESOLUTION ** 2)), axis=1)
    fragments_before = int(counts.sum())
    losses = np.zeros(len(views), np.int32)
    spray_counts = np.bincount([wing['spray'] for wing in wings])
    order = sorted(range(len(wings)), key=lambda index: (np.count_nonzero(counts[pixels[index]] == 1) / max(len(pixels[index]), 1), index))
    removed = set()
    for index in order:
        if len(removed) >= int(len(wings) * .15): break
        wing, ids = wings[index], pixels[index]
        if spray_counts[wing['spray']] <= 2: continue
        unique = ids[counts[ids] == 1]
        loss = np.bincount(unique // RESOLUTION ** 2, minlength=len(views))
        if len(unique) > len(ids) * .02 or np.any(losses + loss > before * .0025): continue
        counts[ids] -= 1
        losses += loss
        spray_counts[wing['spray']] -= 1
        removed.add(index)
    after = np.count_nonzero(counts.reshape((-1, RESOLUTION ** 2)), axis=1)
    retained = [wing for index, wing in enumerate(wings) if index not in removed]
    report = {'candidateCards': len(wings), 'retainedCards': len(retained), 'removedCards': len(removed),
              'reductionPercent': 100 * len(removed) / len(wings), 'minimumPatchesPerSpray': int(spray_counts.min()),
              'resolution': RESOLUTION, 'maximumPerViewCoverageLossFraction': .0025,
              'opaqueFragmentSamplesBefore': fragments_before, 'opaqueFragmentSamplesAfter': int(counts.sum()),
              'meanOpaqueLayersBefore': fragments_before / int(before.sum()), 'meanOpaqueLayersAfter': int(counts.sum()) / int(after.sum()),
              'views': [{**view, 'beforePixels': int(a), 'afterPixels': int(b), 'coverageLossFraction': float(1 - b / a)} for view, a, b in zip(views, before, after)],
              'scope': '24 orthographic alpha-mask projections. This is a pruning guard, not a GPU timing or full visibility proof.'}
    return retained, report
