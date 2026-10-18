"""MeshOut, one object's geometry as build.py accumulates it, and cube_sphere, the all-quad spheres of the heart's
beads and berries."""
import numpy as np


class MeshOut:
    """Accumulates one object's geometry: verts (m), faces (3/4 vertex ids), per-corner uvs, per-face material slot."""
    def __init__(self, name):
        self.name = name; self.verts = []; self.faces = []; self.uvs = []; self.mats = []
    def add(self, verts, faces, uvs, mat):
        base = len(self.verts)
        self.verts.extend(verts)
        for f, uv in zip(faces, uvs):
            self.faces.append(tuple(base + i for i in f)); self.uvs.append(uv); self.mats.append(mat)
    def as_dict(self):
        return dict(name=self.name, verts=[[round(c, 6) for c in v] for v in self.verts],
                    faces=[list(f) for f in self.faces], uvs=[[[round(a, 5), round(b, 5)] for (a, b) in uv] for uv in self.uvs], mats=self.mats)


def cube_sphere(centre, r, k=3):
    """All-quad sphere: a cube of k x k faces per side, projected. centre (m), r (m). Returns verts, faces, local
    unit directions (for a planar uv) ."""
    key = {}; verts = []; dirs = []
    def vid(p):
        kk = tuple(round(c, 7) for c in p)
        if kk in key: return key[kk]
        d = np.array(p) / np.linalg.norm(p)
        key[kk] = len(verts); verts.append(tuple(np.array(centre) + d * r)); dirs.append(d)
        return key[kk]
    faces = []
    axes = [((1, 0, 0), (0, 1, 0), (0, 0, 1)), ((-1, 0, 0), (0, 0, 1), (0, 1, 0)), ((0, 1, 0), (0, 0, 1), (1, 0, 0)),
            ((0, -1, 0), (1, 0, 0), (0, 0, 1)), ((0, 0, 1), (1, 0, 0), (0, 1, 0)), ((0, 0, -1), (0, 1, 0), (1, 0, 0))]
    for nrm, a, b in axes:
        nrm, a, b = np.array(nrm, float), np.array(a, float), np.array(b, float)
        grid = [[vid(tuple(nrm + a * (2 * i / k - 1) + b * (2 * j / k - 1))) for j in range(k + 1)] for i in range(k + 1)]
        for i in range(k):
            for j in range(k):
                faces.append((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    return verts, faces, dirs
