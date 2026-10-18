# The framework's own end-to-end probe (AI 563): one real, source-driven test mark, shipped OFF (strength 0).
#
# It exists to prove the plumbing, not to be wear: a source found on the model (one sill on Broadway, the one nearest
# PROBE_AT), a path followed from it with the block's BVH (down the wall until the next thing catches the water or the
# wall ends), a mark painted into the atlas along that path, the shader response on the masonry classes only, the
# debug colour and the source marker. Enable it with wear_probe=1 (build_scene.py or render_wear.py) and the wall
# under that sill turns plainly darker, a band exactly as wide as the sill, and in the debug view magenta, with the
# sill's drip edge and the path drawn beside it. It is also the smallest complete example of a feature module.
from .. import classes
from ..geometry import FACADES, Z_GROUND

NAME = "probe"
AI = 563
LABEL = "framework probe: the band below one Broadway sill (test mark, off by default)"
ORDER = 900
DEFAULT_STRENGTH = 0.0           # ships off: the framework carries no wear of its own
DEBUG_COLOR = (1.0, 0.0, 1.0)
MASK = dict(res=0.02, channels=1, bits=16)

PROBE_FACE = 2                   # Broadway
PROBE_AT = (-5.0, 9.5)           # (world y, sill underside z): floor 3, in front of st_up and st_along
TOP, BOTTOM = 1.0, 0.6           # the band's value under the sill and where its path ends
DARKEN = 0.75                    # at strength 1, masonry under a full mark keeps 25% of its albedo: unmistakable,
                                 # since AgX compresses a sunlit wall's tones (a 45% cut read as 6% on the brick)


def build(ctx):
    F = FACADES[PROBE_FACE]
    best = None
    for rec in ctx.block.instances("sill_"):
        if rec["instancer"] is not None: continue
        lo, hi = ctx.block.bbox(rec)
        cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
        s, d, _ = F.sdz(cx, cy, 0.0)
        if abs(d) > 1.0 or not (0.0 < s < F.L): continue           # not on Broadway
        score = abs(cy - PROBE_AT[0]) + abs(lo[2] - PROBE_AT[1])
        if best is None or score < best[0]: best = (score, rec, lo, hi)
    assert best is not None, "probe: no sill on the Broadway face"
    _, rec, lo, hi = best
    pts = ctx.block.points(rec)
    S, D, Z = F.sdz(pts[:, 0], pts[:, 1], pts[:, 2])
    s0, s1, z_bot, d_front = float(S.min()), float(S.max()), float(Z.min()), float(D.max())
    src = ctx.source(rec["object"], "line", [F.world(s0, d_front, z_bot), F.world(s1, d_front, z_bot)],
                     facade=PROBE_FACE, object=rec["object"], width=round(s1 - s0, 3))
    tr = ctx.block.trace_down(PROBE_FACE, (s0 + s1) / 2, z_bot)
    assert tr is not None, "probe: nothing below the sill"
    z_stop = max(tr["z_stop"], Z_GROUND)
    m = ctx.mark(src, PROBE_FACE, stop=tr["reason"], length=round(z_bot - z_stop, 3))
    ctx.paint(m, lambda Sg, Zg: BOTTOM + (TOP - BOTTOM) * (Zg - z_stop) / max(z_bot - z_stop, 1e-6), s0, s1, z_stop, z_bot)
    ctx.path(m, [F.world((s0 + s1) / 2, tr["d"] + 0.02, z_bot), F.world((s0 + s1) / 2, tr["d"] + 0.02, z_stop)])
    ctx.publish("band", dict(facade=PROBE_FACE, s0=s0, s1=s1, z0=z_stop, z1=z_bot, d=tr["d"]))   # for a feature that NEEDS it
    ctx.log(f"   probe: {rec['object']} s {s0:.3f}..{s1:.3f} on {F.name}, underside {z_bot:.3f}; the water runs down "
            f"{z_bot - z_stop:.3f} m to {z_stop:.3f} ({tr['reason']}, wall at d {tr['d']:.3f})")


def shader(g):
    m = g.sep(g.i("Mask"))[0]
    # the wall itself: masonry, facing the street (the column's return beside the sill's end takes none)
    where = g.mul(g.mul(m, g.is_class(*classes.MASONRY)), g.facing())
    amt = g.mul(where, g.i("Strength"))
    g.o("Color", g.mix(g.i("Color"), g.scale_rgb(g.i("Color"), 1.0 - DARKEN), amt, 'RGBA'))
    g.o("Debug", where)
