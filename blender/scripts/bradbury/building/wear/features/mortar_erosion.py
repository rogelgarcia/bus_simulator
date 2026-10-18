# Mortar joint erosion at exposed courses (AI 573): the joints of an old brick wall recede where water reaches the
# wall most. Rain and runoff wash the binder out of the mortar, the joint's face sinks back from the brick's and the
# arrises it covered are laid bare, so the joint reads deeper, a little wider and catches shadow; where the wall is
# sheltered it stays flush. The ICOMOS-ISCS glossary files this under erosion, the loss of material from a surface;
# wind-driven rain beats hardest on a facade's top edge and top corners (Blocken & Carmeliet 2013), and concentrated
# runoff and splash wet the wall again and again below ledges and above a base.
#
# THE WATER, and nothing else, says where. Three sources, each found by an earlier feature on the model, measured here:
#   THE WIND-DRIVEN RAIN   AI 566's refined rain-exposure measure (565's sweep, the projecting fronts' catch raised),
#                          against its own general level: a joint erodes where the surface takes clearly more rain than
#                          the general facade, from X[0] to X[1] times it, and never where 565's overhangs keep more
#                          than about a fifth of the rain off (SHELTER). On this block that is the upper floors of the
#                          corner pavilions, strongest on their top floor and at the block's corners (down to floor 3
#                          within a metre of a corner), the middle pavilions' top floor and the arch rings round the
#                          pavilions' top-floor windows. The recessed bays and the top floor's recessed wall take less
#                          than the general facade (the proud piers and the crown keep it off) and keep their joints.
#   THE RUNOFF             every one of AI 564's streaks, walked down the elevation exactly as 564 walks it (its
#                          Elevation and walk, 2 cm): the water from a sill's end down the jamb's inside corner, from a
#                          bracket's foot, a capital's, each with the water 564 drew for its source; and the curtains of
#                          the courses, the crown's heaviest, which creeps back along the crown's underside onto the top
#                          courses right under it -- the only water those sheltered courses get. A curtain spreads its
#                          water along a whole drip line and counts CURTAIN_SHARE of a stream's. The water runs WATER_K
#                          times as far as the dirt it drops (564's e-fold), stopping where 564's film stops. AI 566's
#                          rinsed streams (the brackets' under the band) are among the streams.
#   THE SPLASH             AI 567's splash zone lies on the stone under 1.2 m, and no brick stands in it: the brick
#                          begins at 6.29 m, on the ground floor crown's broad top, the top of the stone base. That top
#                          is ground too: the rain that lands on it splashes back onto the lowest courses of brick
#                          standing on it, and the water the ledge holds wets their foot. So each column of brick whose
#                          foot stands on the base's top (found with rays: the lowest brick of its column, a masonry top
#                          standing out in front of it) takes 567's own splash profile measured up from that top, times
#                          the rain the ledge takes (567's rain, cast from the ledge) and its depth against 567's reach.
#
# ONE DROP AND ONE CORNER AT A TIME (the rework of 2026-09-23). The corner pavilions are all the same shape and the
# rain's measure is the same at every corner of the block, so the rule alone eroded the same zone on each of them: the
# same band stamped on every pavilion, mirrored on the two faces of every corner (user 2026-09-23: marks must not
# repeat identically from one instance to the next). What sets them apart on a real front is what the model does not
# carry. The mortar: a facade is pointed drop by drop, the strip a scaffold or a cradle covers, each with its own
# batches and weather, and a drop's top lift (the top floor, under the parapet) is repointed more often than the rest.
# So each DROP -- each pavilion's face and each pier front standing proud of the field, 566's projecting fronts, in two
# lifts divided by the band -- draws how far its erosion has got (DEPTH_DRAW, or now and then REPOINTED since: nearly
# flush again) and how readily it gives to the rain (GIVE: the exposure its mortar starts to erode at). And the wetting:
# the side of a corner the weather comes from, a crown joint that leaks down one arris. So each CORNER of the block
# draws, on each of its faces, how strongly its catch rises at the arris and how far into the face it runs
# (CORNER_GAIN, CORNER_REACH: soiling's catch law with the corner's own). The exposure stays the lead: the draws move
# where along its gradient a zone ends and how deep its joints are, never where it lies. A drop's depth holds for all
# the water on it (a repointed drop's streams are fresh too); off the drops the mortar is the measure's. Each value is
# the mean of two uniforms from the sha256 of the drop's or the corner's key (its face, its span, its lift), so a
# rebuild draws the same values and nothing drawn for one moves when another changes.
#
# THE MASK is one 8-bit channel at 2 cm: the erosion, the most of the three, over SCALE (a drop may go past the
# calibrated look). Its zones' edges are the measures' own: the exposure's gradient up a pavilion, a stream's profile
# across it and its water down it, the splash's fall-off above the ledge. Nothing in it is noise; the hashes seed only
# the draws above, and it is the same from one build to the next.
#
# THE LOOK changes the joints and nothing else, following the brick set's own joint pattern (the layer's Joint and its
# Joint Wide, the joint grown 2 mm past each edge, both read from the set's height map). Where the erosion lies:
#   - the mortar sinks: the relief deepens, a Bump node on the joints added to the brick's own normal map, half the
#     depth at the exposed arris round each joint and all of it at the mortar, so the groove reads deeper and a little
#     wider, the walls turned from the light in shadow;
#   - the exposed arris round each joint darkens, in the groove's shade: the joint reads wider;
#   - the mortar goes darker and a little sandier (its binder washed out, the sand left), and matte.
# The brick faces stay as they are. The strength scales all of it, past 1 as below it. Brick walls and returns only (the
# wall and the arch rings): never a top or a soffit, never the terracotta trim or the stone. It stands at ORDER 100, the
# first in the chain, a change in the fabric itself: every deposit after it lies over the eroded joints, and 566's clean
# look of the surface includes them.
import hashlib, math, time
import numpy as np
from .. import classes
from ..geometry import FACADES, ATLAS
from . import soiling, runoff, washed, street_grime

NAME = "mortar_erosion"
AI = 573
LABEL = "mortar joint erosion at exposed courses"
ORDER = 100                      # a fabric feature, the first in the chain: every deposit lies over the eroded joints
NEEDS = ("soiling", "runoff", "washed", "street_grime")
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (0.60, 1.00, 0.20)
MASK = dict(res=0.02, channels=1, bits=8)   # the erosion over SCALE
RES = MASK["res"]
assert RES == runoff.RES, "the streams are walked on runoff's elevation grid"

# ---------------------------------------------------------------------------------------------------- the rain
X = (1.15, 1.35)        # the exposure against 566's general facade: joints start to erode at X[0] times its rain and
                        # are eroded in full from X[1] times it (smoothstep)
SHELTER = (0.10, 0.25)  # 565's overhang shelter: the rain's erosion is gone from SHELTER[0] to SHELTER[1] (566: never
                        # where the shelter is above about 0.2)
ZONE_MIN = 20           # 5 cm texels (0.05 m2): an exposed zone smaller than this is a sliver (a jamb's edge), left out
PAD5 = 2                # 5 cm texels: a zone's values reach this far into the surfaces round it that are not brick, so
                        # the lookup's filter keeps the brick's value to its edge
LINE_D = 0.02           # the debug view's outlines and lines stand this far in front of the surface they mark

# ---------------------------------------------------------------------------------------------------- the runoff
CURTAIN_SHARE = 0.60    # a curtain spreads its course's water along the whole drip line: this share of a stream's
CURTAINS = ("crown", "impost", "band", "ground_crown", "string_course", "portal_moulding")
WATER_K = 2.0           # the water runs this many of the deposit's e-folds per e-fold of its own: it lays its dirt down
                        # early and runs on, thinning as it spreads and soaks in, to where 564's film stops
RUN = (0.10, 0.45)      # the water a streak carries (564's value, the curtains' share taken): the joints start to erode
                        # at RUN[0] and are eroded in full from RUN[1] (smoothstep)

# ---------------------------------------------------------------------------------------------------- the splash
LEDGE_MIN = 0.05        # a top standing at least this far out in front of the brick's foot is a ledge it stands on
LEDGE_FIND = 0.12       # the ledge's top lies at most this far below the lowest 5 cm brick texel's centre
SPLASH = (0.0, 0.60)    # the splash's wetting (the ledge's rain x its depth against 567's reach x 567's profile): the
                        # joints erode from SPLASH[0] and in full from SPLASH[1] (smoothstep)
RUN_GAP = 2             # 2 cm columns: a gap wider than this, or a ledge height changing more than RUN_DZ, ends a run
RUN_DZ = 0.03

# ---------------------------------------------------------------------------------------------------- one drop at a time
# Each drop's and each corner's own, drawn from its seed (the mean of two uniforms where a range is given: the middle
# likelier than the ends). 1.0 is the measure, what every drop and corner had before
DROP_D, DROP_TOL = 0.20, 0.03   # a drop: one of 566's projecting fronts standing at the pavilions' depth ...
DROP_TALL = 4.0         # ... the floors' height below the band (a pavilion's face, a pier front), or any front above it
LIFT_Z = 16.60          # the band's top cornice (16.4 to 16.75): a drop's top lift stands above it, its body below
EDGE_IN = 0.05          # a drop's own mortar reaches this far past its front's span: its returns, the mask's pad
DEPTH_DRAW = (0.65, 1.15)   # how far a drop's erosion has got against the calibrated look (1): most a little less ...
REPOINT_P = 0.15            # ... and this often the drop was repointed since, its joints nearly flush again:
REPOINTED = (0.15, 0.40)    # this much
GIVE = (0.96, 1.04)     # how readily a drop's mortar gives to the rain: the exposure it erodes at, times this
CORNER_GAIN = (0.50, 1.40)  # a corner of the block on each of its faces: its catch's rise at the arris (the weather's
CORNER_REACH = (0.70, 1.30) # side, a leaking crown joint) and how far into the face it runs, times the catch law's
SCALE = 1.25            # the mask holds the erosion over this, so a drop may go past the calibrated look

# ---------------------------------------------------------------------------------------------------- the mask
PAD = 2                 # 2 cm texels: every mark's values reach this far into the surfaces beside it that are not brick

# ---------------------------------------------------------------------------------------------------- the look
# Per unit of erosion (the mask's value times SCALE, times the strength: a): 1 is a full erosion at strength 1, 2 twice
# as much. The factors are powers of a, so the strength scales them past 1 as it does below, and a = 0 is exactly no
# change.
DEPTH = 0.003           # a sinks the mortar a x this much (the Bump node's distance), the exposed arris half as far
ARRIS_KEEP = 0.70       # the exposed arris ring (Joint Wide less Joint) keeps ARRIS_KEEP ** a of its brightness: the
                        # groove's shade, the joint read wider
MORTAR_KEEP = 0.62      # the mortar keeps MORTAR_KEEP ** a of its brightness ...
SAND_GREY = 0.35        # ... after losing SAND_GREY x a of its colour toward a sand grey (its own luminance times
SAND_TINT = (1.00, 0.93, 0.80)      # SAND_TINT): the binder washed out, the sand left
MATTE = 0.90            # the eroded mortar turns toward at least this rough, by a
DEBUG_GAIN = 2.0        # the debug view shows the erosion at full colour from half of it

KIND_LABEL = dict(front="exposed front", sill_end="sill end", bracket="bracket", capital="column capital",
                  springing="springing capital", crown="crown curtain", impost="impost curtain", band="band curtain",
                  ground_crown="ground crown curtain", string_course="string course curtain",
                  portal_moulding="portal moulding curtain", splash="base ledge")


def smooth(e0, e1, x):
    t = np.clip((np.asarray(x, np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def s_at(f, c):                  # a face-local column's centre, 2 cm
    return FACADES[f].s0 + (np.asarray(c) + 0.5) * RES


def z_at(r):                     # a row's centre, 2 cm
    return ATLAS.z0 + (np.asarray(r) + 0.5) * RES


def water(t, efold):
    """The water a streak carries down its path, against its source's: it runs WATER_K times as far as the dirt it drops
    and is gone where 564's streak is (LEN_CAP of the deposit's e-folds)."""
    t = np.maximum(np.asarray(t, np.float64), 0.0)
    L = runoff.LEN_CAP * efold
    x = np.clip((t - 0.75 * L) / (0.25 * L), 0.0, 1.0)
    return np.exp(-t / (WATER_K * efold)) * (1.0 - x * x * (3.0 - 2.0 * x))


# ---------------------------------------------------------------------------------------------------- one drop at a time
def draw(key, n):
    """n uniforms in 0..1 from a drop's or a corner's own seed: the sha256 of its key, two bytes each, so every rebuild
    draws the same values and nothing drawn for one moves when another changes."""
    h = hashlib.sha256(("mortar_erosion:" + key).encode("utf-8")).digest()
    return [int.from_bytes(h[2 * i:2 * i + 2], "big") / 65535.0 for i in range(n)]


def mid(bounds, u, v):
    # the mean of two uniforms across the bounds: the middle likelier than the ends
    return bounds[0] + (bounds[1] - bounds[0]) * 0.5 * (u + v)


class Mortar:
    """The mortar each drop of the facade was pointed with, and how each corner of the block is wetted: the draws that
    set one pavilion, one lift and one corner apart. The drops are 566's projecting fronts of brick at the pavilions'
    depth (565's elevation says what a front is made of: the crown's members stand as far out): in the body, those
    that stand the floors' height (a pavilion's face, a pier front); in the top lift, any (the pavilions' top floors).
    A point off every drop keeps the measure's mortar (depth and give 1)."""

    def __init__(self, fronts, front_map):
        fres = front_map["res"]
        D5 = np.asarray(front_map["depth"], np.float64); C5 = np.asarray(front_map["cls"], np.int32)
        spans = {}
        for x in fronts:
            if abs(x["depth"] - DROP_D) > DROP_TOL: continue
            if x["z0"] >= LIFT_Z: lift = "top"
            elif x["z1"] - x["z0"] >= DROP_TALL: lift = "body"
            else: continue
            # its texels at its own depth are brick, mostly (not the crown's members standing as far out)
            F = FACADES[x["facade"]]; a0, _ = ATLAS.cols(F, fres)
            c0 = a0 + int(math.floor((x["s0"] - F.s0) / fres + 1e-6))
            c1 = a0 + int(math.ceil((x["s1"] - F.s0) / fres - 1e-6))
            r0 = int(math.floor((x["z0"] - ATLAS.z0) / fres + 1e-6))
            r1 = int(math.ceil((x["z1"] - ATLAS.z0) / fres - 1e-6))
            sub = np.abs(np.nan_to_num(D5[r0:r1, c0:c1], nan=-9.0) - x["depth"]) <= DROP_TOL
            if not sub.any() or (C5[r0:r1, c0:c1][sub] == classes.BRICK).mean() < 0.5: continue
            spans.setdefault((x["facade"], lift), []).append((x["s0"], x["s1"]))
        self.drops = []
        for (f, lift), iv in sorted(spans.items()):
            merged = []
            for a, b in sorted(iv):
                if merged and a <= merged[-1][1] + EDGE_IN: merged[-1][1] = max(merged[-1][1], b)
                else: merged.append([a, b])
            for a, b in merged:
                key = f"drop:{FACADES[f].name}:{a:.2f}:{b:.2f}:{lift}"
                u = draw(key, 5)
                rep = u[0] < REPOINT_P
                depth = REPOINTED[0] + (REPOINTED[1] - REPOINTED[0]) * u[1] if rep else mid(DEPTH_DRAW, u[1], u[2])
                self.drops.append(dict(key=key, facade=f, s0=round(a, 3), s1=round(b, 3), lift=lift,
                                       depth=round(depth, 4), give=round(mid(GIVE, u[3], u[4]), 4), repointed=rep))
        self.corners = {}
        for F in FACADES:
            for end in (0, 1):
                key = f"corner:{F.name}:{('start', 'end')[end]}"
                u = draw(key, 4)
                self.corners[(F.idx, end)] = dict(key=key, facade=F.idx, end=end,
                                                  gain=round(mid(CORNER_GAIN, u[0], u[1]), 4),
                                                  reach=round(mid(CORNER_REACH, u[2], u[3]), 4))
        # the corners' catch is soiling's catch law with their own gain and reach: with both 1 it must be the law
        F = FACADES[0]
        S, Z = np.meshgrid(np.linspace(-0.2, F.L + 0.2, 41), np.linspace(6.0, 20.8, 21))
        unit = {(F.idx, e): dict(gain=1.0, reach=1.0) for e in (0, 1)}
        assert np.allclose(self._catch(F.idx, S, Z, unit), soiling.catch_ratio(F.idx, S, Z), rtol=0, atol=1e-12), \
            "mortar_erosion: the corners' catch no longer reproduces soiling.catch_ratio"

    def at(self, f, S, Z, what):
        """A drop's `depth` or `give` at face f's points (S, Z), 1 off every drop."""
        S, Z = np.broadcast_arrays(np.asarray(S, np.float64), np.asarray(Z, np.float64))
        out = np.ones(S.shape)
        for d in self.drops:
            if d["facade"] != f: continue
            sel = (S >= d["s0"] - EDGE_IN) & (S <= d["s1"] + EDGE_IN) & ((Z >= LIFT_Z) if d["lift"] == "top" else
                                                                         (Z < LIFT_Z))
            out[sel] = d[what]
        return out

    def drop_of(self, f, s, z):
        # the drop a point lies in (its dict), or None
        for d in self.drops:
            if d["facade"] == f and d["s0"] - EDGE_IN <= s <= d["s1"] + EDGE_IN and \
                    (z >= LIFT_Z) == (d["lift"] == "top"):
                return d
        return None

    def _catch(self, f, S, Z, corners):
        # soiling.catch_ratio with each end's own side zone: its rise at the arris (gain) and its reach into the face
        F = FACADES[f]
        h = soiling.CATCH_FOOT + (1.0 - soiling.CATCH_FOOT) * np.clip((Z - soiling.Z_GROUND) /
                                                                      (soiling.Z_TOP - soiling.Z_GROUND), 0.0, 1.0)
        top = np.clip((Z - (soiling.Z_TOP - soiling.CATCH_TOP)) / soiling.CATCH_TOP, 0.0, 1.0)
        c0, c1 = corners[(f, 0)], corners[(f, 1)]
        side = np.maximum(np.clip(1.0 - S / (soiling.CATCH_SIDE * c0["reach"]), 0.0, 1.0)
                          * soiling.corner_sharpness(f, 0) * c0["gain"],
                          np.clip(1.0 - (F.L - S) / (soiling.CATCH_SIDE * c1["reach"]), 0.0, 1.0)
                          * soiling.corner_sharpness(f, 1) * c1["gain"])
        edge = np.maximum(top, side * (0.5 + 0.5 * top))
        return h * (1.0 + soiling.CATCH_EDGE * edge) / (1.0 + soiling.CATCH_EDGE)

    def wet(self, f, S, Z):
        """How much more or less of the rain the corners give face f at (S, Z) than soiling's catch law: its catch with
        each corner's own wetting over the law's (1 away from the corners)."""
        S, Z = np.broadcast_arrays(np.asarray(S, np.float64), np.asarray(Z, np.float64))
        return self._catch(f, S, Z, self.corners) / np.maximum(soiling.catch_ratio(f, S, Z), 1e-9)


# ---------------------------------------------------------------------------------------------------- the faces
class Face:
    """One face's mask at 2 cm while it is laid out: the erosion and the mark it belongs to per texel (the most of the
    marks there), painted into the atlas through each mark at the end."""

    def __init__(self, f, H, W):
        self.f, self.H, self.W = f, H, W
        self.V = np.zeros((H, W), np.float32)
        self.K = np.full((H, W), -1, np.int32)

    def lay(self, k, rows, cols, v):
        """Mark k's values v at the texels (rows, cols), where they are more than what is there."""
        rows = np.asarray(rows, int); cols = np.asarray(cols, int); v = np.asarray(v, np.float32)
        ok = (rows >= 0) & (rows < self.H) & (cols >= 0) & (cols < self.W) & (v > 0.0)
        rows, cols, v = rows[ok], cols[ok], v[ok]
        if not len(v): return
        order = np.argsort(v, kind="stable")          # the most wins where one texel is laid twice in one call
        rows, cols, v = rows[order], cols[order], v[order]
        more = v > self.V[rows, cols]
        self.V[rows[more], cols[more]] = v[more]; self.K[rows[more], cols[more]] = k


def brick_of(el, f, rows, cols):
    """1 where the surface the street sees at these 2 cm texels is brick (cast where not cast yet)."""
    _, C, _ = el.cells(f, rows, cols)
    return C == classes.BRICK


# ---------------------------------------------------------------------------------------------------- the rain
def rain_zones(ctx, el, faces, marks, pub, mortar):
    """The wind-driven rain's erosion: 566's exposure against its general level on the brick the street sees (565's
    5 cm elevation), gated by 565's shelter, as each drop's mortar and each corner's wetting take it; its connected
    exposed zones, one source each (the front the rain beats on); laid on each face's 2 cm brick, bilinear from the
    5 cm field."""
    ex, sh, fr = ctx.field("washed", "exposure"), ctx.field("soiling", "shelter"), ctx.field("soiling", "front")
    fres = ex["res"]
    E = np.asarray(ex["data"], np.float64); gen = float(ex["general"])
    SH = np.asarray(sh["data"], np.float64)
    D = np.asarray(fr["depth"], np.float64); C = np.asarray(fr["cls"], np.int32)
    surf = np.isfinite(D)
    brick = surf & (C == classes.BRICK)
    ratio = np.where(surf & (E > 0.0), E / gen, 0.0)
    gate = 1.0 - smooth(SHELTER[0], SHELTER[1], SH)
    H5 = E.shape[0]
    n_small = 0
    for F in FACADES:
        f = F.idx
        a0, a1 = ATLAS.cols(F, fres)
        S5, Z5 = np.meshgrid(soiling.s_at(f, np.arange(a1 - a0)), soiling.z_at(np.arange(H5)))
        # the rain this corner's wetting gives, at the exposure this drop's mortar gives at, as far as it has got
        val = mortar.at(f, S5, Z5, "depth") * gate[:, a0:a1] * smooth(
            X[0], X[1], ratio[:, a0:a1] * mortar.wet(f, S5, Z5) * mortar.at(f, S5, Z5, "give"))
        own = washed.owned_texels(D, surf, f, a0, a1, fres)
        v = np.where(brick[:, a0:a1] & own, val, 0.0)
        Df = D[:, a0:a1]
        lab, n = washed.label_fronts(v > 1e-3, np.where(np.isfinite(Df), Df, -9.0))
        sizes = np.bincount(lab[lab >= 0], minlength=n) if n else np.zeros(0, int)
        keep = np.full(max(n, 1), -1, np.int32)
        for j in range(n):
            sel = lab == j
            if sizes[j] < ZONE_MIN:
                v[sel] = 0.0; n_small += 1; continue
            rows, cols = np.nonzero(sel.any(axis=1))[0], np.nonzero(sel.any(axis=0))[0]
            s0 = float(soiling.s_at(f, cols[0])) - 0.5 * fres; s1 = float(soiling.s_at(f, cols[-1])) + 0.5 * fres
            z0 = float(soiling.z_at(rows[0])) - 0.5 * fres; z1 = float(soiling.z_at(rows[-1])) + 0.5 * fres
            dz = float(np.median(Df[sel]))
            d = dz + LINE_D
            zid = f"front:{F.name}:{len(pub['zones'])}"
            on_drop = mortar.drop_of(f, 0.5 * (s0 + s1), 0.5 * (z0 + z1))
            drop_key = on_drop["key"] if on_drop else None
            src = ctx.source(zid, "area", [F.world(s0, d, z0), F.world(s1, d, z0), F.world(s1, d, z1), F.world(s0, d, z1)],
                             facade=f, what="front", depth=round(dz, 3), drop=drop_key)
            keep[j] = len(marks); marks.append(ctx.mark(src, f, what="front"))
            pub["zones"].append(dict(id=zid, facade=f, s0=round(s0, 3), s1=round(s1, 3), z0=round(z0, 3),
                                     z1=round(z1, 3), depth=round(dz, 3), texels=int(sizes[j]),
                                     peak=round(float(v[sel].max()), 3), mean=round(float(v[sel].mean()), 3),
                                     ratio=round(float(ratio[:, a0:a1][sel].max()), 3), drop=drop_key))
        mk = np.where(lab >= 0, keep[np.clip(lab, 0, None)], -1)
        mk[v <= 0.0] = -1
        # the zone's values reach PAD5 texels into what is not brick round it (a window, the trim), for the filter
        isb = brick[:, a0:a1]
        for _ in range(PAD5):
            gv, gk = v.copy(), mk.copy()
            for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                sv = np.zeros_like(v); sk = np.full_like(mk, -1)
                rs, re_ = max(dr, 0), H5 + min(dr, 0); cs, ce = max(dc, 0), v.shape[1] + min(dc, 0)
                sv[rs:re_, cs:ce] = v[rs - dr:re_ - dr, cs - dc:ce - dc]
                sk[rs:re_, cs:ce] = mk[rs - dr:re_ - dr, cs - dc:ce - dc]
                take = ~isb & (sv > gv)
                gv = np.where(take, sv, gv); gk = np.where(take, sk, gk)
            v, mk = gv, gk
        # at 2 cm: the field's bilinear value, and the mark of the 5 cm texel each texel lies in; the marks reach one
        # texel further, over the field's bilinear fade into the brick round a zone
        grown = mk.copy()
        for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sk = np.full_like(mk, -1)
            rs, re_ = max(dr, 0), H5 + min(dr, 0); cs, ce = max(dc, 0), mk.shape[1] + min(dc, 0)
            sk[rs:re_, cs:ce] = mk[rs - dr:re_ - dr, cs - dc:ce - dc]
            grown = np.where((grown < 0) & (sk >= 0), sk, grown)
        mk = grown
        fc = faces[f]
        rows5 = np.nonzero((v > 0.0).any(axis=1))[0]
        if not len(rows5): continue
        r_lo = max(0, int(math.floor((soiling.z_at(rows5[0]) - fres - ATLAS.z0) / RES)))
        r_hi = min(fc.H, int(math.ceil((soiling.z_at(rows5[-1]) + fres - ATLAS.z0) / RES)))
        full = dict(res=fres, z0=ATLAS.z0, data=np.zeros((H5, ATLAS.shape(fres)[1])))
        full["data"][:, a0:a1] = v
        cc = np.arange(fc.W); rr = np.arange(r_lo, r_hi)
        Sg, Zg = np.meshgrid(s_at(f, cc), z_at(rr))
        vv = soiling.sample(full, f, Sg, Zg)
        c5 = np.clip(np.floor((Sg - F.s0) / fres).astype(int), 0, v.shape[1] - 1)
        r5 = np.clip(np.floor((Zg - ATLAS.z0) / fres).astype(int), 0, H5 - 1)
        kk = mk[r5, c5]
        sel = (vv > 1e-3) & (kk >= 0)
        R2, C2 = np.nonzero(sel)
        isb2 = brick_of(el, f, rr[R2], cc[C2])            # on the brick the 2 cm elevation sees, as the other sources
        R2, C2 = R2[isb2], C2[isb2]
        for k in np.unique(kk[R2, C2]):
            m = kk[R2, C2] == k
            fc.lay(int(k), rr[R2[m]], cc[C2[m]], vv[R2[m], C2[m]])
    return n_small


# ---------------------------------------------------------------------------------------------------- the runoff
def streak_shape(st, src):
    """564's streak across its width and down its path, as 564 draws it: (shape(S, t), s_lo, s_hi, w0)."""
    kind, side, axis = st["kind"], st["side"], st["axis"]
    efold = st["efold"]
    if kind == "sill_end":
        w0 = runoff.SILL_W0 * efold / runoff.SILL_EFOLD
        w_max = w0 + runoff.SPREAD * runoff.LEN_CAP * efold
        s_end = src["s0"]
        if side == "corner":
            sg = 1.0 if axis >= s_end else -1.0

            def shape(S, t):
                u = sg * (S - s_end)
                return np.where(u >= 0.25 * RES, runoff.lateral(u / (w0 + runoff.SPREAD * t)), 0.0)
            lo, hi = sorted((s_end, s_end + sg * runoff.LAT_REACH * w_max))
        else:
            def shape(S, t):
                return runoff.lateral((S - s_end) / (0.5 * (w0 + runoff.SPREAD * t)))
            lo, hi = s_end - 0.5 * runoff.LAT_REACH * w_max, s_end + 0.5 * runoff.LAT_REACH * w_max
        return shape, lo, hi, w0
    if kind == "bracket":
        w0 = src["s1"] - src["s0"]
        w_max = w0 + runoff.SPREAD * runoff.LEN_CAP * efold
        half = 0.5 * runoff.LAT_REACH * w_max

        def shape(S, t):
            return runoff.lateral((S - axis) / (0.5 * (w0 + runoff.SPREAD * t)))
        return shape, axis - half, axis + half, w0
    # a capital's flat curtain as wide as its foot, and the courses' curtains along their drip lines: they fade in over
    # END_SOFT at their ends, except where a course carries on round a corner of the block onto the next face
    s0, s1 = st["s0"], st["s1"]
    F = FACADES[st["facade"]]
    if kind in CURTAINS:
        fa = s0 if s0 > 0.15 else -1e9
        fb = s1 if s1 < F.L - 0.15 else 1e9
    else:
        fa, fb = s0, s1

    def shape(S, t):
        return np.clip(np.minimum(S - fa, fb - S) / runoff.END_SOFT, 0.0, 1.0) + 0.0 * t
    return shape, s0, s1, s1 - s0


def streams(ctx, el, faces, marks, pub, mortar):
    """The runoff's erosion: each of 564's streaks walked down the elevation from its source exactly as 564 walks it,
    the water it carries laid on the brick it runs over, as far as the mortar of the drop there has got."""
    streaks = ctx.field("runoff", "streaks")
    sources = {s["id"]: s for s in ctx.field("runoff", "sources")}
    dep = ctx.field("runoff", "field")
    dep = dict(dep, data=np.asarray(dep["data"], np.float64))
    by, skipped = {}, {}
    for st in streaks:
        kind, f = st["kind"], st["facade"]
        F = FACADES[f]; fc = faces[f]
        src = sources[st["source"]]
        shape, lo, hi, w0 = streak_shape(st, src)
        cols = np.arange(runoff.col_of(f, lo), runoff.col_of(f, hi) + 1)
        cols = cols[(cols >= 0) & (cols < fc.W)]
        if not len(cols): continue
        z_top, efold = st["z_top"], st["efold"]
        r_start = runoff.row_below(z_top - 0.003)
        n_rows = int(math.ceil(runoff.LEN_CAP * efold / RES)) + 1
        S = s_at(f, cols)
        if kind in ("capital", "springing"):
            # as 564: the water leaves the capital's foot onto what stands right under it, the less of it the further
            # it has to creep back along the capital's underside to get there; and each capital carries the water 564
            # drew for it (its streak's e-fold over its kind's is that water's square root)
            D0, _, _ = el.cells(f, np.full(len(cols), r_start), cols)
            delta = src["d"] - D0
            first_ok = np.isfinite(delta) & (delta <= runoff.DRIP_MAX) & (delta >= -runoff.CATCH)
            kw = efold / (runoff.SPRING_EFOLD if kind == "springing" else runoff.CAPITAL_EFOLD)
            amp0 = (runoff.SPRING_AMP if kind == "springing" else runoff.CAPITAL_AMP) * \
                runoff.exposure(src["z"]) / runoff.exposure(15.3) * kw
            amp = np.clip(amp0 * np.exp(-np.clip(np.nan_to_num(delta), 0.0, None) / runoff.CREEP_LEN), 0.0, 1.0)
        elif kind in CURTAINS:
            # a curtain's columns are the ones 564 started (its deposit just under the drip line), at its run's value
            first_ok = soiling.sample(dep, f, S, np.full(len(S), z_top - 0.03)) > 1e-3
            amp = np.full(len(cols), st["amp"] * CURTAIN_SHARE)
        else:
            first_ok = None
            amp = np.full(len(cols), st["amp"])
        last, why, d0 = runoff.walk(el, f, cols, r_start, n_rows, first_ok)
        run = last >= 0
        if not run.any():
            skipped[kind] = skipped.get(kind, 0) + 1; continue
        k_max = int(last.max())
        t = z_top - z_at(r_start - np.arange(k_max + 1))
        G = np.clip(np.broadcast_to(shape(S[None, :], t[:, None]), (k_max + 1, len(cols))), 0.0, 1.0)
        Wv = amp[None, :] * water(t, efold)[:, None] * G
        on = np.arange(k_max + 1)[:, None] <= last[None, :]
        rows = np.broadcast_to((r_start - np.arange(k_max + 1))[:, None], Wv.shape)
        cc = np.broadcast_to(cols[None, :], Wv.shape)
        er = smooth(RUN[0], RUN[1], Wv)
        sel = on & (er > 1e-3)
        if not sel.any():
            skipped[kind] = skipped.get(kind, 0) + 1; continue
        rr, cs, ev = rows[sel], cc[sel], er[sel]
        isb = brick_of(el, f, rr, cs)
        if not isb.any():
            skipped[kind] = skipped.get(kind, 0) + 1; continue
        rr, cs, ev = rr[isb], cs[isb], ev[isb] * mortar.at(f, s_at(f, cs[isb]), z_at(rr[isb]), "depth")
        kind_pt = "point" if kind == "sill_end" else "line"
        pts = ([F.world(src["s0"], src["d"], src["z"])] if kind_pt == "point" else
               [F.world(src["s0"], src["d"], src["z"]), F.world(src["s1"], src["d"], src["z"])])
        s_obj = ctx.source(f"stream:{st['source']}", kind_pt, pts, facade=f, what=kind, runoff=st["source"])
        mk = ctx.mark(s_obj, f, what=kind)
        k = len(marks); marks.append(mk)
        fc.lay(k, rr, cs, ev)
        # the path: down the streak's axis from its source to where the water leaves the wall there
        j = int(np.argmin(np.abs(S - st["axis"])))
        if last[j] < 0: j = int(np.argmax(last))
        z_stop = float(z_at(r_start - int(last[j]))) - 0.5 * RES
        d_path = (d0[j] if np.isfinite(d0[j]) else src["d"]) + LINE_D
        ctx.path(mk, [F.world(st["axis"], d_path, z_top), F.world(st["axis"], d_path, z_stop)])
        pub["streams"].append(dict(id=s_obj.id, source=st["source"], kind=kind, facade=f, axis=st["axis"],
                                   s0=round(float(s_at(f, cs.min())) - 0.5 * RES, 3),
                                   s1=round(float(s_at(f, cs.max())) + 0.5 * RES, 3), z_top=z_top,
                                   z_stop=round(z_stop, 3), water=round(float(amp.max()), 3),
                                   peak=round(float(ev.max()), 3), texels=int(len(ev))))
        b = by.setdefault(kind, dict(n=0, texels=0, peak=[], drop=[]))
        b["n"] += 1; b["texels"] += len(ev); b["peak"].append(float(ev.max())); b["drop"].append(z_top - z_stop)
    return by, skipped


# ---------------------------------------------------------------------------------------------------- the splash
def splash(ctx, el, faces, marks, pub, mortar):
    """The splash off the base's top: every column of brick whose foot stands on the ground floor crown's broad top
    takes 567's splash profile up from it, times the rain that ledge takes and its depth against 567's reach, as far
    as the mortar of the drop there has got."""
    blk = ctx.block
    prof = ctx.field("street_grime", "profile")
    top, foot_w, foot_e, reach = prof["top"], prof["foot_w"], prof["foot_e"], prof["reach"]
    fr = ctx.field("soiling", "front")
    fres = fr["res"]
    D5 = np.asarray(fr["depth"], np.float64); C5 = np.asarray(fr["cls"], np.int32)
    masonry = np.isin(C5, classes.MASONRY)

    def profile(Hh):
        Hh = np.maximum(np.asarray(Hh, np.float64), 0.0)
        return np.where(Hh < top, foot_w * np.exp(-Hh / foot_e) + (1.0 - foot_w) * (1.0 - smooth(0.0, top, Hh)), 0.0)
    from mathutils import Vector
    n_rays, found = 0, []
    for F in FACADES:
        f = F.idx; fc = faces[f]
        a0, a1 = ATLAS.cols(F, fres)
        Cf, Df, Mf = C5[:, a0:a1], D5[:, a0:a1], masonry[:, a0:a1]
        isb = Cf == classes.BRICK
        has = isb.any(axis=0)
        low = np.argmax(isb, axis=0)                           # each 5 cm column's lowest brick
        cand = np.zeros(Cf.shape[1], bool)
        for c in np.nonzero(has & (low > 0))[0]:
            r = low[c]
            # the lowest brick of its column, standing on masonry that stands out in front of it: a ledge's front
            if Mf[r - 1, c] and not isb[r - 1, c] and np.isfinite(Df[r - 1, c]) \
                    and Df[r - 1, c] - Df[r, c] >= LEDGE_MIN:
                cand[c] = True
        cols2 = np.nonzero(cand[np.clip(np.floor((s_at(f, np.arange(fc.W)) - F.s0) / fres).astype(int), 0,
                                        Cf.shape[1] - 1)])[0]
        if not len(cols2): continue
        dirs = street_grime.rain_dirs(F)
        cols_ok, zt_of, dep_of, db_of, rain_of = [], [], [], [], []
        for c in cols2.tolist():
            c5 = int(np.clip(math.floor((s_at(f, c) - F.s0) / fres), 0, Cf.shape[1] - 1))
            zb5 = float(soiling.z_at(low[c5]))
            # the brick at the lowest 5 cm texel's centre, and straight down from just in front of it: the ledge's top
            rb = int(math.floor((zb5 - ATLAS.z0) / RES))
            Db, Cb, _ = el.cells(f, [rb], [c])
            if Cb[0] != classes.BRICK or not np.isfinite(Db[0]): continue
            x, y, _ = F.world(float(s_at(f, c)), float(Db[0]) + 0.01, 0.0)
            loc, nor, _, _ = blk.bvh.ray_cast(Vector((x, y, zb5)), Vector((0.0, 0.0, -1.0)), 0.05 + LEDGE_FIND)
            n_rays += 1
            if loc is None or nor.z < 0.9: continue
            z_top_l = float(loc.z)
            # how far the ledge stands out: the elevation's texel just under its top is its front
            Dl, Cl, _ = el.cells(f, [runoff.row_below(z_top_l - 0.005)], [c])
            if Cl[0] not in classes.MASONRY or not np.isfinite(Dl[0]): continue
            depth = float(Dl[0]) - float(Db[0])
            if depth < LEDGE_MIN: continue
            # the rain the ledge takes, from its middle: 567's rain, cast toward the street side of the face
            xm, ym, _ = F.world(float(s_at(f, c)), float(Db[0]) + 0.5 * depth, 0.0)
            share = street_grime.rain_share(blk, (xm, ym, z_top_l + 0.01), dirs); n_rays += len(dirs)
            cols_ok.append(c); zt_of.append(z_top_l); dep_of.append(depth); db_of.append(float(Db[0]))
            rain_of.append(share)
        if not cols_ok: continue
        cols_ok = np.array(cols_ok); zt_of = np.array(zt_of); dep_of = np.array(dep_of); db_of = np.array(db_of)
        rain_of = np.array(rain_of)
        # the columns in runs along the ledge: one source and one mark each
        breaks = np.where((np.diff(cols_ok) > RUN_GAP + 1) | (np.abs(np.diff(zt_of)) > RUN_DZ))[0]
        for part in np.split(np.arange(len(cols_ok)), breaks + 1):
            cs, zt, dp, db, rn = cols_ok[part], zt_of[part], dep_of[part], db_of[part], rain_of[part]
            wet = rn * np.minimum(1.0, dp / reach)
            r0 = np.floor((zt - ATLAS.z0) / RES).astype(int)
            n_up = int(math.ceil(top / RES)) + 1
            rows = r0[None, :] + np.arange(n_up)[:, None]
            Hh = z_at(rows) - zt[None, :]
            v = wet[None, :] * profile(Hh)
            ev = smooth(SPLASH[0], SPLASH[1], v)
            sel = (Hh >= 0.0) & (ev > 1e-3)
            if not sel.any(): continue
            rr = rows[sel]; cc = np.broadcast_to(cs[None, :], rows.shape)[sel]; ev = ev[sel]
            isb = brick_of(el, f, rr, cc)
            if not isb.any(): continue
            rr, cc, ev = rr[isb], cc[isb], ev[isb] * mortar.at(f, s_at(f, cc[isb]), z_at(rr[isb]), "depth")
            sa, sb = float(s_at(f, cs.min())) - 0.5 * RES, float(s_at(f, cs.max())) + 0.5 * RES
            zm, dm = float(np.median(zt)), float(np.median(db))
            sid = f"splash:{F.name}:{len(pub['splash'])}"
            src = ctx.source(sid, "line", [F.world(sa, dm + 0.03, zm), F.world(sb, dm + 0.03, zm)], facade=f,
                             what="splash", depth=round(float(np.median(dp)), 3))
            mk = ctx.mark(src, f, what="splash")
            k = len(marks); marks.append(mk)
            fc.lay(k, rr, cc, ev)
            # the path: up the run's middle to where the splash falls below a tenth
            j = len(cs) // 2
            col = ev[cc == cs[j]]
            if len(col):
                zc = z_at(rr[cc == cs[j]])
                z_hi = float(zc[col >= 0.10].max()) + 0.5 * RES if (col >= 0.10).any() else zm
                ctx.path(mk, [F.world(float(s_at(f, cs[j])), db[j] + LINE_D, zm),
                              F.world(float(s_at(f, cs[j])), db[j] + LINE_D, z_hi)])
            info = dict(id=sid, facade=f, s0=round(sa, 3), s1=round(sb, 3), z=round(zm, 3), d_wall=round(dm, 3),
                        depth=round(float(np.median(dp)), 3), rain=round(float(np.median(rn)), 3),
                        rain_min=round(float(rn.min()), 3), wet=round(float(np.median(wet)), 3),
                        peak=round(float(ev.max()), 3), columns=int(len(cs)))
            pub["splash"].append(info)
            found.append(info)
    return found, n_rays


# ---------------------------------------------------------------------------------------------------- build
def pad_and_paint(ctx, el, fc, marks):
    """Every mark's values reach PAD texels into what is not brick beside them (a window, the trim, a jamb's glass), so
    the lookup's filter keeps the brick's value to its edge; then each mark paints its own texels, over SCALE."""
    f = fc.f
    for _ in range(PAD):
        gv, gk = fc.V.copy(), fc.K.copy()
        for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sv = np.zeros_like(fc.V); sk = np.full_like(fc.K, -1)
            rs, re_ = max(dr, 0), fc.H + min(dr, 0); cs, ce = max(dc, 0), fc.W + min(dc, 0)
            sv[rs:re_, cs:ce] = fc.V[rs - dr:re_ - dr, cs - dc:ce - dc]
            sk[rs:re_, cs:ce] = fc.K[rs - dr:re_ - dr, cs - dc:ce - dc]
            take = (sv > gv) & (fc.V <= 0.0)
            gv = np.where(take, sv, gv); gk = np.where(take, sk, gk)
        new = (fc.V <= 0.0) & (gv > 0.0)
        rr, cc = np.nonzero(new)
        if len(rr):
            isb = brick_of(el, f, rr, cc)          # brick beside a mark keeps its own value: it is no pad's
            gv[rr[isb], cc[isb]] = 0.0; gk[rr[isb], cc[isb]] = -1
        fc.V, fc.K = gv, gk
    F = FACADES[f]
    rr, cc = np.nonzero(fc.K >= 0)
    if not len(rr): return
    ks = fc.K[rr, cc]; n = len(marks)
    r_lo = np.full(n, fc.H); r_hi = np.full(n, -1); c_lo = np.full(n, fc.W); c_hi = np.full(n, -1)
    np.minimum.at(r_lo, ks, rr); np.maximum.at(r_hi, ks, rr); np.minimum.at(c_lo, ks, cc); np.maximum.at(c_hi, ks, cc)
    for k in np.unique(ks):
        a, b, c, d = int(r_lo[k]), int(r_hi[k]), int(c_lo[k]), int(c_hi[k])
        box = fc.K[a:b + 1, c:d + 1] == k
        s0 = F.s0 + c * RES + 0.25 * RES; s1 = F.s0 + (d + 1) * RES - 0.25 * RES
        z0 = ATLAS.z0 + a * RES + 0.25 * RES; z1 = ATLAS.z0 + (b + 1) * RES - 0.25 * RES
        ctx.paint(marks[k], np.where(box, fc.V[a:b + 1, c:d + 1], 0.0) / SCALE, s0, s1, z0, z1, channel=0, op="max")


def build(ctx):
    t0 = time.time()
    el = runoff.Elevation(ctx.block)
    H = el.H
    faces = {F.idx: Face(F.idx, H, el.width(F.idx)) for F in FACADES}
    marks = []
    pub = dict(zones=[], streams=[], splash=[])
    mortar = Mortar(ctx.field("washed", "fronts"), ctx.field("soiling", "front"))
    n_small = rain_zones(ctx, el, faces, marks, pub, mortar)
    t1 = time.time()
    by, skipped = streams(ctx, el, faces, marks, pub, mortar)
    t2 = time.time()
    found, n_splash_rays = splash(ctx, el, faces, marks, pub, mortar)
    t3 = time.time()
    field = np.zeros(ATLAS.shape(RES), np.float32)
    share = {}
    for f, fc in faces.items():
        a0, _ = ATLAS.cols(FACADES[f], RES)
        # what each source kind contributes: the texels each is the most at, before the pad
        ks = fc.K[fc.K >= 0]
        for k in ks:
            w = marks[int(k)].info.get("what", "?"); share[w] = share.get(w, 0) + 1
        field[:, a0:a0 + fc.W] = fc.V
        pad_and_paint(ctx, el, fc, marks)
    H2, W2 = field.shape[0] // 2, field.shape[1] // 2
    pooled = field[:H2 * 2, :W2 * 2].reshape(H2, 2, W2, 2).max(axis=(1, 3)).astype(np.float16)
    ctx.publish("zones", pub["zones"])
    ctx.publish("streams", pub["streams"])
    ctx.publish("splash", pub["splash"])
    ctx.publish("drops", mortar.drops)
    ctx.publish("corners", list(mortar.corners.values()))
    ctx.publish("field", dict(res=2 * RES, z0=ATLAS.z0, data=pooled, atlas=ATLAS.to_dict(), note=(
        "the mortar erosion (the most of the wind-driven rain's, the runoff's and the base's splash, each as far as "
        "its drop's mortar has got; 1 the calibrated look, up to DEPTH_DRAW's top), on the brick the street sees, "
        "max-pooled to 4 cm, rows from z0 up")))
    ctx.publish("profile", dict(x=list(X), shelter=list(SHELTER), curtain_share=CURTAIN_SHARE, water_k=WATER_K,
                                run=list(RUN), splash=list(SPLASH), ledge_min=LEDGE_MIN, depth=DEPTH,
                                arris_keep=ARRIS_KEEP, mortar_keep=MORTAR_KEEP, scale=SCALE, lift_z=LIFT_Z,
                                depth_draw=list(DEPTH_DRAW), repoint_p=REPOINT_P, repointed=list(REPOINTED),
                                give=list(GIVE), corner_gain=list(CORNER_GAIN), corner_reach=list(CORNER_REACH), note=(
        "rain: depth x smoothstep(x[0], x[1], 566's exposure / its general level x wet x give) x (1 - smoothstep("
        "shelter, 565's shelter)), wet the corners' own catch over soiling's catch law, depth and give the drop's; "
        "runoff: depth x smoothstep(run, 564's value (curtains x curtain_share; a capital's with 564's drawn water) x "
        "water(t)) along each streak's walked path, water(t) = exp(-t / (water_k efold)) cut where 564's streak ends; "
        "splash: depth x smoothstep(splash, the base ledge's rain x min(1, depth / 567's reach) x 567's profile up "
        "from the ledge's top); the mask is the most of the three over scale; depth and give are 1 off every drop")))
    dd = [d for d in mortar.drops]
    for lift in ("body", "top"):
        ds = [d for d in dd if d["lift"] == lift]
        if not ds: continue
        dp = np.array([d["depth"] for d in ds]); gv = np.array([d["give"] for d in ds])
        ctx.log(f"   mortar_erosion drops ({lift}): {len(ds)}, depth {np.median(dp):.2f} ({dp.min():.2f}.."
                f"{dp.max():.2f}), {sum(d['repointed'] for d in ds)} repointed, {int((dp > 1.0).sum())} past the "
                f"calibrated look; give {np.median(gv):.3f} ({gv.min():.3f}..{gv.max():.3f})")
    for d in dd:
        if d["s1"] - d["s0"] > 1.5:                      # the pavilions; the pier fronts are in the counts above
            ctx.log(f"      {d['key']:<30} depth {d['depth']:.2f}{' (repointed)' if d['repointed'] else ''} "
                    f"give {d['give']:.3f}")
    ctx.log("   mortar_erosion corners (gain, reach): " + ", ".join(
        f"{FACADES[c['facade']].name} {('start', 'end')[c['end']]} {c['gain']:.2f} {c['reach']:.2f}"
        for c in mortar.corners.values()))
    brick_px = sum(int((fc.V > 0).sum()) for fc in faces.values())
    ctx.log(f"   mortar_erosion: {len(pub['zones'])} exposed zones ({n_small} slivers left out) in {t1 - t0:.1f} s; "
            f"{len(pub['streams'])} streaks walked in {t2 - t1:.1f} s ({el.rays} rays so far); {len(found)} splash runs "
            f"on the base's top in {t3 - t2:.1f} s ({n_splash_rays} rays); {brick_px} texels painted with the pad")
    tot = max(1, sum(share.values()))
    ctx.log("   mortar_erosion texels by source: " + ", ".join(
        f"{KIND_LABEL.get(k, k)} {v} ({100.0 * v / tot:.1f}%)" for k, v in sorted(share.items(), key=lambda x: -x[1])))
    for k, b in sorted(by.items()):
        ctx.log(f"   mortar_erosion stream {KIND_LABEL.get(k, k):<24} {b['n']:4d}: {b['texels'] * RES * RES:6.2f} m2, "
                f"peak {np.median(b['peak']):.2f} ({min(b['peak']):.2f}..{max(b['peak']):.2f}), runs "
                f"{np.median(b['drop']):.2f} m ({min(b['drop']):.2f}..{max(b['drop']):.2f})")
    if skipped:
        ctx.log("   mortar_erosion streaks that erode no brick (on stone, or too little water): " + ", ".join(
            f"{KIND_LABEL.get(k, k)} {v}" for k, v in sorted(skipped.items())))
    if found:
        dp = [x["depth"] for x in found]; rn = [x["rain"] for x in found]; cl = sum(x["columns"] for x in found)
        ctx.log(f"   mortar_erosion splash: {len(found)} runs, {cl * RES:.2f} m of base ledge under brick; ledge depth "
                f"{np.median(dp):.2f} ({min(dp):.2f}..{max(dp):.2f}), its rain {np.median(rn):.2f} "
                f"({min(rn):.2f}..{max(rn):.2f}), at {np.median([x['z'] for x in found]):.3f} m")


# ---------------------------------------------------------------------------------------------------- shader
def elevation(canvas):
    # what the elevation images draw of the mask: the erosion itself (the mask holds it over SCALE), full from 1
    return np.clip(canvas[:, :, 0] * SCALE, 0.0, 1.0)


def shader(g):
    e = g.mul(g.sep(g.i("Mask"))[0], SCALE)            # the erosion here, 1 the calibrated look
    # brick walls and returns: never a top, a soffit, the trim or the stone
    where = g.mul(g.is_class(classes.BRICK), g.mul(g.one_minus(g.upward()), g.one_minus(g.downward())))
    k = g.mx(g.mul(g.mul(e, where), g.i("Strength")), 0.0)   # the erosion at this strength, a
    on = g.gt(k, 0.0)                                   # 0 exactly where there is none: the input handed on untouched
    J = g.clamp(g.i("Joint"))                           # the mortar: the brick set's own joints ...
    Wd = g.clamp(g.mx(g.i("Joint Wide"), J))            # ... and grown 2 mm past their edges: the arris they expose
    col, rough = g.i("Color"), g.i("Roughness")
    # the look in the groove: the mortar sandier (toward its own luminance in a sand grey) and darker, the arris ring
    # round it in the groove's shade; the brick's face (Joint Wide 0) keeps its colour
    y = g.lum(col)
    sand = g.rgb(g.mul(y, SAND_TINT[0]), g.mul(y, SAND_TINT[1]), g.mul(y, SAND_TINT[2]))
    sandy = g.mix(col, sand, g.clamp(g.mul(g.mul(k, SAND_GREY), J)), 'RGBA')
    keep = g.mix(g.math('POWER', ARRIS_KEEP, k), g.math('POWER', MORTAR_KEEP, k), J)
    eroded = g.scale_rgb(sandy, g.mix(1.0, keep, Wd))
    g.o("Color", g.mix(col, eroded, on, 'RGBA'))
    g.o("Roughness", g.mix(rough, g.mx(rough, MATTE), g.clamp(g.mul(k, J))))
    # the relief: the mortar sunk DEPTH and the arris round it half as far, on the brick's own normal map. The height is
    # the brick set's own (Joint, Joint Wide), which the renderer reads again at its offsets to find the slope; the
    # erosion scales the Bump node's distance, so the slope follows the joints and never the zone's gradient. In Cycles
    # the walls turned from the light go dark while those turned toward a grazing light brighten only a little (the
    # renderer bends a bumped normal back where its reflection would dip under the surface, and dims the light a bump
    # turns toward it), so under a raking sun the groove reads as a shadow line, the lit lower lip faint
    bump = g.node('ShaderNodeBump')
    g.set(bump.inputs['Height'], g.mul(g.add(J, Wd), -0.5))
    g.set(bump.inputs['Distance'], g.mul(k, DEPTH))
    g.set(bump.inputs['Strength'], 1.0)
    g.set(bump.inputs['Normal'], g.i("Normal"))
    g.o("Normal", g.mix(g.i("Normal"), bump.outputs['Normal'], on, 'VECTOR'))
    g.o("Debug", g.mul(g.clamp(g.mul(e, DEBUG_GAIN)), where))
