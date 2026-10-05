# Spatially compact leaf patches avoid collapsing distant leaves onto overlapping planes.
import numpy as np


def spatial_groups(ids, data, prototypes, stem):
    centers = np.array([prototypes[data['forms'][i]]['samples'].mean(axis=0) @
                        (data['matrices'][i] * data['scales'][i]).T + data['origins'][i] for i in ids])
    scale = max(float(np.linalg.norm(np.ptp(centers, axis=0))), .01)
    normals = data['matrices'][ids, :, 2]
    features = np.column_stack([(centers - centers.mean(axis=0)) / scale, normals * .18])
    seeds = [int(np.argmin(centers @ stem))]
    for _ in range(2):
        distance = np.min(np.sum((features[:, None] - features[seeds]) ** 2, axis=2), axis=1)
        seeds.append(int(np.argmax(distance)))
    means = features[seeds].copy()
    for _ in range(12):
        labels = np.argmin(np.sum((features[:, None] - means) ** 2, axis=2), axis=1)
        groups = [np.flatnonzero(labels == k) for k in range(3)]
        if any(len(group) == 0 for group in groups):
            raise RuntimeError('Empty spatial leaf cluster')
        updated = np.array([features[group].mean(axis=0) for group in groups])
        if np.allclose(updated, means): break
        means = updated
    groups.sort(key=lambda group: float(centers[group].mean(axis=0) @ stem))
    return [ids[group] for group in groups]


def fitted_normal(points, leaf_normal):
    centered = points - points.mean(axis=0)
    _, vectors = np.linalg.eigh(centered.T @ centered)
    normal = vectors[:, 0]
    if normal @ leaf_normal < 0: normal = -normal
    normal = normal * .7 + leaf_normal * .3
    return normal / np.linalg.norm(normal)
