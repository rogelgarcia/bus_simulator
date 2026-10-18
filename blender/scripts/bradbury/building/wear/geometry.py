# The wear layer's geometry side: where on the building a mark lies, what the building is made of there, and the
# context a feature builds its sources, marks and masks in.
#
# FACADES. The block's outline is five straight faces (3rd Street, the chamfer, Broadway, the north and the west face),
# the HULL that assemble_building.py lays every wall on. Each is a frame: s runs along the face (anticlockwise, the
# viewer's left to right from the street), d is the depth out of the hull plane toward the street (the brick field is
# at -0.10, the columns at +0.20, the crown reaches about +0.9), z is height. A point belongs to the face whose plane it
# stands furthest in front of, so the corners split on their bisectors, and tops, soffits and returns belong to the face
# they sit on just as its walls do.
#
# THE ATLAS. A feature's mask is one image holding the five faces side by side in (s, z) metres: the elevation, as if
# each face were photographed square on and unrolled. It is sampled at every shading point by projecting the point
# onto its face's plane, so a mark painted at (s, z) lies on whatever surface the street sees there -- wall, column,
# sill front, band -- and the brick's own joints, not the mask, give its edge its grain. Every offset and size in the
# atlas is a multiple of ATLAS_ALIGN, so masks at any of the RESOLUTIONS share texel boundaries and one (u, v) serves
# them all.
#
# THE BLOCK. Block() puts every render-visible mesh of the open file, the linked portal's instances included, into one
# world-space BVH that remembers each triangle's object, material and material class, so a feature can find its
# sources on the model and follow the path a mark takes from them (front(), trace_down(), ray()).
import math, os, json, pickle, struct, zlib, hashlib
import numpy as np
from . import classes

Z_GROUND = 0.201                     # the pavement's top, the block's base (assemble_building.py, build_scene.py)
SHRINK, BAY_GROW = 0.502, 4.465      # as assemble_building.py has them
HULL = [(-36.529 + SHRINK, -17.879), (9.7 + BAY_GROW, -17.879), (12.529 + BAY_GROW, -15.05),
        (12.529 + BAY_GROW, 17.879 - SHRINK), (-36.529 + SHRINK, 17.879 - SHRINK)]   # anticlockwise, from the SW corner
FACADE_NAMES = ("S", "SE", "E", "N", "W")   # 3rd Street, the chamfer, Broadway, the north face, the west face

ATLAS_Z0, ATLAS_Z1 = 0.0, 21.2       # the block stands 0.194 .. 20.732
ATLAS_MARGIN = 1.6                   # each face's region runs this far past both of its ends (corner mitres, crown)
ATLAS_ALIGN = 0.2                    # every atlas offset and size is a multiple of this
ATLAS_GAP = 0.2                      # empty texels between two faces' regions
RESOLUTIONS = (0.01, 0.02, 0.04, 0.05, 0.1, 0.2)


class Facade:
    def __init__(self, idx, a, b):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        self.idx, self.name, self.a, self.b, self.L = idx, FACADE_NAMES[idx], tuple(a), tuple(b), L
        self.t = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)          # along the face
        self.n = (self.t[1], -self.t[0])                          # out of it, toward the street
        self.c_t = self.t[0] * a[0] + self.t[1] * a[1]            # s = t.P - c_t
        self.c_n = self.n[0] * a[0] + self.n[1] * a[1]            # d = n.P - c_n
        self.s0 = -ATLAS_MARGIN
        self.width = math.ceil((L + 2 * ATLAS_MARGIN) / ATLAS_ALIGN - 1e-9) * ATLAS_ALIGN
        self.s1 = self.s0 + self.width
        self.off = 0.0                                            # the region's left edge in the atlas, set by Atlas

    def sdz(self, x, y, z):
        # world -> (s, d, z); numpy arrays welcome
        return (x * self.t[0] + y * self.t[1] - self.c_t, x * self.n[0] + y * self.n[1] - self.c_n, z)

    def world(self, s, d, z):
        return (self.a[0] + s * self.t[0] + d * self.n[0], self.a[1] + s * self.t[1] + d * self.n[1], z)

    def out(self):
        return (self.n[0], self.n[1], 0.0)

    def to_dict(self):
        return dict(idx=self.idx, name=self.name, a=self.a, b=self.b, length=round(self.L, 6), t=self.t, n=self.n,
                    s0=self.s0, s1=round(self.s1, 6), off=round(self.off, 6))


FACADES = [Facade(i, HULL[i], HULL[(i + 1) % len(HULL)]) for i in range(len(HULL))]


def facade_of(x, y):
    # the face a point belongs to: the one whose plane it stands furthest in front of (numpy arrays welcome)
    ds = np.stack([np.asarray(x) * f.n[0] + np.asarray(y) * f.n[1] - f.c_n for f in FACADES])
    return np.argmax(ds, axis=0)


class Atlas:
    def __init__(self):
        off = 0.0
        for f in FACADES:
            f.off = off; off += f.width + ATLAS_GAP
        self.width = round(off - ATLAS_GAP, 6)
        self.z0, self.z1 = ATLAS_Z0, ATLAS_Z1
        self.height = round(self.z1 - self.z0, 6)

    @staticmethod
    def check_res(res):
        k = ATLAS_ALIGN / res
        assert res in RESOLUTIONS and abs(k - round(k)) < 1e-9, f"mask resolution {res} not one of {RESOLUTIONS}"

    def shape(self, res):
        self.check_res(res)
        return int(round(self.height / res)), int(round(self.width / res))

    def cols(self, f, res):
        c0 = int(round(f.off / res)); return c0, c0 + int(round(f.width / res))

    def uv(self, f, s, z):
        return ((f.off + (s - f.s0)) / self.width, (z - self.z0) / self.height)

    def to_dict(self):
        return dict(width_m=self.width, height_m=self.height, z0=self.z0, z1=self.z1, align=ATLAS_ALIGN,
                    margin=ATLAS_MARGIN, gap=ATLAS_GAP, facades=[f.to_dict() for f in FACADES])


ATLAS = Atlas()


# ------------------------------------------------------------------------------------------------ PNG, deterministic
def write_png(path, arr, bits=16):
    # arr: float in [0, 1], (H, W) or (H, W, C), row 0 = the atlas's BOTTOM (z0). PNG rows run top down, and Blender
    # reads v = 0 at an image's bottom row, so the rows are flipped here. Plain zlib, no filter, no timestamp: the same
    # array always gives the same bytes, so a rebuild reproduces a mask exactly.
    a = np.clip(np.asarray(arr, dtype=np.float64), 0.0, 1.0)
    if a.ndim == 2: a = a[:, :, None]
    h, w, c = a.shape
    ctype = {1: 0, 2: 4, 3: 2, 4: 6}[c]
    a = a[::-1]
    if bits == 16: data = np.round(a * 65535.0).astype(">u2")
    elif bits == 8: data = np.round(a * 255.0).astype(np.uint8)
    else: raise ValueError(bits)
    rows = np.zeros((h, 1 + w * c * bits // 8), dtype=np.uint8)
    rows[:, 1:] = np.ascontiguousarray(data).view(np.uint8).reshape(h, -1)
    def chunk(tag, body):
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, bits, ctype, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(rows.tobytes(), 6)) + chunk(b"IEND", b""))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh: fh.write(png)
    return hashlib.sha256(png).hexdigest()


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for blk in iter(lambda: fh.read(1 << 20), b""): h.update(blk)
    return h.hexdigest()


# ------------------------------------------------------------------------------------------------ the block
class Hit:
    __slots__ = ("p", "normal", "dist", "tri", "inst", "mat", "cls", "facade", "s", "d", "z")

    def __init__(self, block, loc, nor, idx, dist):
        self.p = (loc.x, loc.y, loc.z); self.normal = (nor.x, nor.y, nor.z); self.dist = dist; self.tri = idx
        self.inst = block.inst[block.tri_inst[idx]]["name"]
        mi = block.tri_mat[idx]
        self.mat = block.mat_names[mi]; self.cls = block.mat_class[mi]
        f = int(facade_of(loc.x, loc.y)); self.facade = f
        self.s, self.d, self.z = FACADES[f].sdz(loc.x, loc.y, loc.z)

    def __repr__(self):
        return (f"Hit({self.inst} [{self.mat}, {classes.NAMES[self.cls]}] at s {self.s:.3f} d {self.d:.3f} "
                f"z {self.z:.3f} on {FACADE_NAMES[self.facade]})")


class Block:
    """The open file's render-visible geometry in one world-space BVH (the portal's instances included)."""

    def __init__(self, log=print):
        import bpy
        from mathutils.bvhtree import BVHTree
        scn = bpy.context.scene
        # The render scene links every object and renders each one that is not hidden from render. A few are hidden in
        # this file's own view layer only (the game's wall__0), which drops them from its depsgraph, so they are shown
        # here to be measured as the scene draws them. Nothing of this pass is saved.
        shown = [o.name for o in scn.objects if o.hide_get() and not o.hide_render]
        for n in shown: scn.objects[n].hide_set(False)
        bpy.context.view_layer.update()     # linked objects carry the library's matrix_world until this runs
        dg = bpy.context.evaluated_depsgraph_get()
        V, T, TI, TM = [], [], [], []
        self.inst, self.mat_names, self.mat_class, self.mat_reason = [], [], [], []
        self.mat_users = []
        mat_ix = {}; nv = 0
        for di in dg.object_instances:
            ob = di.object
            if ob.type != 'MESH' or ob.original.hide_render: continue
            me = ob.data
            n_v, n_t = len(me.vertices), len(me.loop_triangles)
            if n_t == 0: continue
            co = np.empty(n_v * 3, np.float32); me.vertices.foreach_get("co", co)
            M = np.array(di.matrix_world, dtype=np.float64)
            w = co.reshape(-1, 3).astype(np.float64) @ M[:3, :3].T + M[:3, 3]
            tri = np.empty(n_t * 3, np.int32); me.loop_triangles.foreach_get("vertices", tri)
            mi = np.empty(n_t, np.int32); me.loop_triangles.foreach_get("material_index", mi)
            slots = []
            for s in ob.material_slots:
                m = s.material
                key = m.name_full if m else "<none>"
                if key not in mat_ix:
                    mat_ix[key] = len(self.mat_names); self.mat_names.append(key)
                    c, why = classes.classify(m) if m else (classes.NONE, "empty slot")
                    self.mat_class.append(c); self.mat_reason.append(why); self.mat_users.append(set())
                slots.append(mat_ix[key])
            if not slots:
                key = "<none>"
                if key not in mat_ix:
                    mat_ix[key] = len(self.mat_names); self.mat_names.append(key)
                    self.mat_class.append(classes.NONE); self.mat_reason.append("no slots"); self.mat_users.append(set())
                slots = [mat_ix[key]]
            slots = np.array(slots, np.int32)
            name = f"{di.parent.name}/{ob.name}" if di.is_instance and di.parent else ob.name
            self.inst.append(dict(i=len(self.inst), name=name, object=ob.original.name,
                                  instancer=di.parent.name if di.is_instance and di.parent else None,
                                  matrix=[list(r) for r in M]))
            for k in set(int(x) for x in np.unique(slots[np.clip(mi, 0, len(slots) - 1)])):
                self.mat_users[k].add(ob.original.name)
            V.append(w); T.append(tri.reshape(-1, 3) + nv)
            TI.append(np.full(n_t, len(self.inst) - 1, np.int32)); TM.append(slots[np.clip(mi, 0, len(slots) - 1)])
            nv += n_v
        self.V = np.concatenate(V); self.T = np.concatenate(T)
        self.tri_inst = np.concatenate(TI); self.tri_mat = np.concatenate(TM)
        self.tri_class = np.array(self.mat_class, np.int32)[self.tri_mat]
        self.bvh = BVHTree.FromPolygons(self.V.tolist(), self.T.tolist(), all_triangles=True)
        self._front = {}
        self.by_name = {}
        for i, d in enumerate(self.inst): self.by_name.setdefault(d["object"], []).append(i)
        log(f"the block: {len(self.inst)} render-visible mesh instances ({sum(1 for d in self.inst if d['instancer'])} "
            f"of them the portal's), {len(self.T)} triangles, {len(self.mat_names)} materials"
            + (f"; shown for measuring: {', '.join(shown)}" if shown else ""))

    # ---- rays
    def ray(self, origin, direction, dist=1.0e4):
        from mathutils import Vector
        loc, nor, idx, d = self.bvh.ray_cast(Vector(origin), Vector(direction).normalized(), dist)
        return None if loc is None else Hit(self, loc, nor, idx, d)

    def front(self, f, s, z, d_from=4.0, reach=12.0):
        # the first surface the street sees at (s, z) of face f: a level ray from d_from in front of the hull plane
        F = FACADES[f]
        o = F.world(s, d_from, z)
        return self.ray(o, (-F.n[0], -F.n[1], 0.0), reach)

    def front_grid(self, f, S, Z, d_from=4.0, reach=12.0):
        """front() over arrays S, Z of one shape (face f): the depth d of the first surface the street sees at each point
        (nan where nothing), its material class (-1), the z of its normal, and its instance index (-1)."""
        from mathutils import Vector
        F = FACADES[f]
        dirv = Vector((-F.n[0], -F.n[1], 0.0)); ray = self.bvh.ray_cast
        D = np.full(S.shape, np.nan); C = np.full(S.shape, -1, np.int32)
        NZ = np.zeros(S.shape); I = np.full(S.shape, -1, np.int32)
        ax, ay, nx, ny = F.a[0], F.a[1], F.n[0], F.n[1]; tx, ty = F.t
        for idx in np.ndindex(S.shape):
            s = float(S[idx])
            loc, nor, ti, dist = ray(Vector((ax + s * tx + d_from * nx, ay + s * ty + d_from * ny, float(Z[idx]))), dirv, reach)
            if loc is None: continue
            D[idx] = d_from - dist; C[idx] = self.tri_class[ti]; NZ[idx] = nor.z; I[idx] = self.tri_inst[ti]
        return D, C, NZ, I

    def front_map(self, f, res=0.05):
        """front_grid() over face f's whole atlas region at `res` (cached): dict(S, Z, D, C, NZ, I), rows from ATLAS.z0 up,
        columns along s -- the elevation as the street sees it, for a feature to find where its marks may go."""
        key = (f, res)
        if key not in self._front:
            ATLAS.check_res(res); F = FACADES[f]
            cs = F.s0 + (np.arange(int(round(F.width / res))) + 0.5) * res
            zs = ATLAS.z0 + (np.arange(int(round(ATLAS.height / res))) + 0.5) * res
            S, Z = np.meshgrid(cs, zs)
            D, C, NZ, I = self.front_grid(f, S, Z)
            self._front[key] = dict(S=S, Z=Z, D=D, C=C, NZ=NZ, I=I)
        return self._front[key]

    def front_near(self, f, s, z, d_ref, ahead=0.05, reach=0.6):
        # the surface at (s, z) close to depth d_ref: a short level ray from `ahead` in front of it, so whatever stands
        # further out (a fire escape, a pier in front) is not what it meets
        F = FACADES[f]
        return self.ray(F.world(s, d_ref + ahead, z), (-F.n[0], -F.n[1], 0.0), reach + ahead)

    def trace_down(self, f, s, z_top, step=0.01, tol=0.015, z_min=Z_GROUND, catch=0.004, deep=0.10):
        """Follow a film of water down the face from just below z_top at (s): it runs on the surface the street sees there
        until something catches it (anything projecting more than `catch` from that surface: a sill, a band, a cornice,
        the pavement: reason 'caught' or 'ground') or the surface itself ends: an 'opening' (it falls back more than
        `deep`, or nothing is there), a 'step back' or a 'step forward' (more than `tol` between two samples `step`
        apart; pass a larger tol to let the film run over a shallow reveal, the 3 cm window recesses for one).
        Returns dict(z_stop, reason, d, z_catch, catch_hit, surface) or None when nothing is there."""
        F = FACADES[f]
        h0 = self.front(f, s, z_top - step)
        if h0 is None: return None
        d0 = h0.d
        down = self.ray(F.world(s, d0 + catch, z_top - 0.002), (0.0, 0.0, -1.0), max(0.0, z_top - z_min) + 1.0)
        z_catch = down.z if down is not None else z_min
        z, d_prev, z_open, why = z_top - step, d0, None, None
        while z > z_catch + 1e-9:
            h = self.front_near(f, s, z, d_prev)
            if h is None or abs(h.d - d_prev) > tol:
                z_open = z + step
                why = ("opening" if h is None or d_prev - h.d > deep else "step back" if h.d < d_prev else "step forward")
                break
            d_prev = h.d; z -= step
        if z_open is not None and z_open > z_catch:
            return dict(z_stop=z_open, reason=why, d=d0, z_catch=z_catch, catch_hit=down, surface=h0)
        reason = "ground" if down is None or down.z <= z_min + 0.02 else "caught"
        return dict(z_stop=z_catch, reason=reason, d=d0, z_catch=z_catch, catch_hit=down, surface=h0)

    # ---- objects
    def instances(self, prefix=None, pred=None):
        # the instance records (name, object, instancer, matrix) whose object name starts with prefix / passes pred
        out = []
        for d in self.inst:
            if prefix is not None and not d["object"].startswith(prefix): continue
            if pred is not None and not pred(d): continue
            out.append(d)
        return out

    def points(self, inst_record):
        # world-space vertices of one instance's triangles
        return self.V[np.unique(self.T[self.tri_inst == inst_record["i"]])]

    def triangles(self, inst_record):
        """One instance's triangles in world space: (corners (n, 3, 3), unit normals (n, 3), areas (n,), material
        classes (n,)), for features that read the geometry itself (ledge tops, convex arrises, anchor points)."""
        sel = self.tri_inst == inst_record["i"]
        P = self.V[self.T[sel]]
        cr = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
        ln = np.linalg.norm(cr, axis=1)
        return P, cr / np.maximum(ln, 1e-12)[:, None], ln * 0.5, self.tri_class[sel]

    def bbox(self, inst_record):
        # world-space axis-aligned box of one instance, (min xyz, max xyz)
        pts = self.points(inst_record)
        return tuple(pts.min(axis=0)), tuple(pts.max(axis=0))

    def materials_report(self):
        rows = []
        for i, n in enumerate(self.mat_names):
            rows.append((classes.NAMES[self.mat_class[i]], n, self.mat_reason[i], len(self.mat_users[i]),
                         sorted(self.mat_users[i])[:2]))
        return sorted(rows)


# ------------------------------------------------------------------------------------------------ features
class Source:
    """A physical source of wear on the model: a point (a sill's end, an anchor), a line (a drip edge, a ledge) or an
    area (an overhang's outline). `points` are world coordinates; the debug view draws them."""
    __slots__ = ("id", "kind", "points", "facade", "info")

    def __init__(self, sid, kind, points, facade, info):
        assert kind in ("point", "line", "area"), kind
        self.id, self.kind, self.points, self.facade, self.info = sid, kind, [tuple(map(float, p)) for p in points], facade, info

    def to_dict(self):
        return dict(id=self.id, kind=self.kind, points=self.points, facade=self.facade, info=self.info)


class Mark:
    """One mark painted from one source. Its bbox (facade, s0, s1, z0, z1) grows with what it paints."""
    __slots__ = ("id", "source", "facade", "bbox", "info")

    def __init__(self, mid, source, facade, info):
        self.id, self.source, self.facade, self.bbox, self.info = mid, source, facade, None, info

    def to_dict(self):
        return dict(id=self.id, source=self.source, facade=self.facade, bbox=self.bbox, info=self.info)


class Result:
    """What a feature's build leaves behind, as plain data (it outlives the file it was measured on)."""

    def __init__(self, name, sources, marks, paths, fields, stash, canvas, mask):
        self.name, self.sources, self.marks, self.paths = name, sources, marks, paths
        self.fields, self.stash, self.canvas, self.mask = fields, stash, canvas, mask
        self.mask_sha = None

    def save(self, cache_dir):
        os.makedirs(cache_dir, exist_ok=True)
        with open(os.path.join(cache_dir, self.name + ".pkl"), "wb") as fh:
            pickle.dump(dict(name=self.name, sources=self.sources, marks=self.marks, paths=self.paths,
                             fields=self.fields, stash=self.stash, mask=self.mask, mask_sha=self.mask_sha), fh, protocol=4)

    @staticmethod
    def load(cache_dir, name):
        fp = os.path.join(cache_dir, name + ".pkl")
        if not os.path.isfile(fp): return None
        with open(fp, "rb") as fh: d = pickle.load(fh)
        r = Result(d["name"], d["sources"], d["marks"], d["paths"], d["fields"], d["stash"], None, d["mask"])
        r.mask_sha = d.get("mask_sha"); return r


class FeatureContext:
    """What a feature's build(ctx) works with.

    ctx.block                the Block (BVH, rays, instances); ctx.facades / ctx.atlas the frames
    ctx.source(...)          declare a physical source; ctx.mark(source, facade) open a mark from it
    ctx.grid(f, s0, s1, z0, z1)   texel centres (S, Z) of the feature's mask covering that part of face f
    ctx.paint(mark, values, s0, s1, z0, z1, channel=0, op='max')  combine values into the mask there
    ctx.path(mark, points)   a polyline the debug view draws for a mark (a streak's centre line)
    ctx.publish(key, value) / ctx.field(feature, key)   share derived fields with the features that NEED this one
    ctx.stash                plain data handed to the feature's apply(actx) in the worn block's save pass
    ctx.log(msg)             a line in the build's log
    Nothing may be painted except through paint(), and paint() needs a mark, and a mark needs a source: finish()
    checks all three, so a mark without a source cannot reach the image."""

    def __init__(self, block, spec, results, log=print):
        self.block, self.spec, self.name = block, spec, spec.NAME
        self.facades, self.atlas, self.log = FACADES, ATLAS, log
        self.results = results                  # earlier features' Results, by name
        m = getattr(spec, "MASK", None)
        self.mask = dict(res=m.get("res", 0.02), channels=m.get("channels", 1), bits=m.get("bits", 16)) if m else None
        if self.mask:
            H, W = ATLAS.shape(self.mask["res"])
            self.canvas = np.zeros((H, W, self.mask["channels"]), np.float32)
            self._cover = np.zeros((H, W), bool)
        else:
            self.canvas = None; self._cover = None
        self._sources, self._marks, self._paths, self._fields = {}, [], [], {}
        self._n_marks, self._mark_by_id = {}, {}
        self.stash = {}

    # ---- sources and marks
    def source(self, sid, kind, points, facade=None, **info):
        sid = str(sid)
        assert sid not in self._sources, f"{self.name}: duplicate source id {sid}"
        s = Source(sid, kind, points, facade, info); self._sources[sid] = s; return s

    def mark(self, source, facade, **info):
        assert isinstance(source, Source) and self._sources.get(source.id) is source, \
            f"{self.name}: a mark needs one of this feature's own sources"
        k = self._n_marks.get(source.id, 0); self._n_marks[source.id] = k + 1
        m = Mark(f"{source.id}#{k}", source.id, int(facade), info)
        self._marks.append(m); self._mark_by_id[m.id] = m; return m

    def _own(self, mark):
        return isinstance(mark, Mark) and self._mark_by_id.get(mark.id) is mark

    def path(self, mark, points):
        assert self._own(mark), f"{self.name}: a path belongs to one of this feature's marks"
        self._paths.append(dict(mark=mark.id, points=[tuple(map(float, p)) for p in points]))

    # ---- the mask
    def _span(self, f, s0, s1, z0, z1):
        res = self.mask["res"]; F = FACADES[f]
        ca, cb = ATLAS.cols(F, res)
        c0 = max(ca, int(math.floor((F.off + (min(s0, s1) - F.s0)) / res)))
        c1 = min(cb, int(math.ceil((F.off + (max(s0, s1) - F.s0)) / res)))
        H = self.canvas.shape[0]
        r0 = max(0, int(math.floor((min(z0, z1) - ATLAS.z0) / res)))
        r1 = min(H, int(math.ceil((max(z0, z1) - ATLAS.z0) / res)))
        return r0, r1, c0, c1

    def grid(self, f, s0, s1, z0, z1):
        """Texel centres of face f's region covering s0..s1, z0..z1: (S, Z) arrays of shape (rows, cols), and the
        region's (r0, r1, c0, c1) in the canvas."""
        assert self.mask, f"{self.name} declares no MASK"
        res = self.mask["res"]; F = FACADES[f]
        r0, r1, c0, c1 = self._span(f, s0, s1, z0, z1)
        cs = (np.arange(c0, c1) + 0.5) * res - F.off + F.s0
        zs = (np.arange(r0, r1) + 0.5) * res + ATLAS.z0
        S, Z = np.meshgrid(cs, zs)
        return S, Z, (r0, r1, c0, c1)

    def paint(self, mark, values, s0, s1, z0, z1, channel=0, op="max"):
        """Combine `values` (an array over grid(mark.facade, s0, s1, z0, z1), or a function (S, Z) -> array) into the mask
        channel over that rectangle of the mark's face. op: max | add | screen | set | min."""
        assert self._own(mark), f"{self.name}: paint() needs one of this feature's marks"
        S, Z, (r0, r1, c0, c1) = self.grid(mark.facade, s0, s1, z0, z1)
        if r1 <= r0 or c1 <= c0: return
        v = values(S, Z) if callable(values) else values
        v = np.broadcast_to(np.asarray(v, np.float32), S.shape)
        assert np.all(np.isfinite(v)), f"{self.name}: non-finite mask values"
        cur = self.canvas[r0:r1, c0:c1, channel]
        if op == "max": cur[...] = np.maximum(cur, v)
        elif op == "add": cur[...] = cur + v
        elif op == "screen": cur[...] = 1.0 - (1.0 - np.clip(cur, 0, 1)) * (1.0 - np.clip(v, 0, 1))
        elif op == "set": cur[...] = v
        elif op == "min": cur[...] = np.minimum(cur, v)
        else: raise ValueError(op)
        self._cover[r0:r1, c0:c1] = True
        bb = (float(min(s0, s1)), float(max(s0, s1)), float(min(z0, z1)), float(max(z0, z1)))
        mark.bbox = bb if mark.bbox is None else (min(mark.bbox[0], bb[0]), max(mark.bbox[1], bb[1]),
                                                  min(mark.bbox[2], bb[2]), max(mark.bbox[3], bb[3]))

    # ---- shared fields
    def publish(self, key, value):
        self._fields[key] = value

    def field(self, feature, key):
        assert feature in getattr(self.spec, "NEEDS", ()), f"{self.name}: name {feature} in NEEDS to read its fields"
        r = self.results.get(feature)
        assert r is not None, f"{self.name}: feature {feature} has not been built"
        assert key in r.fields, f"{self.name}: {feature} publishes no {key} (it has {sorted(r.fields)})"
        return r.fields[key]

    # ---- the end of a build
    def finish(self):
        ids = set(self._sources)
        orphans = [m.id for m in self._marks if m.source not in ids]
        assert not orphans, f"{self.name}: marks without a source: {orphans[:5]}"
        if self.mask:
            outside = np.any(self.canvas != 0.0, axis=2) & ~self._cover
            assert not outside.any(), f"{self.name}: {int(outside.sum())} mask texels painted outside every mark"
            self.canvas = np.clip(self.canvas, 0.0, 1.0)
        return Result(self.name, [s.to_dict() for s in self._sources.values()], [m.to_dict() for m in self._marks],
                      list(self._paths), dict(self._fields), dict(self.stash), self.canvas, self.mask)
