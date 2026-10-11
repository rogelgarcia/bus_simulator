# Staining beneath the upper ledges (AI 605, the first step of the weathering-realism group AI 605-610): the narrow,
# darker strip a city leaves on a wall right under each projecting course. Rain that a course without a proper drip
# sheds creeps back along its underside to the wall (Blocken & Carmeliet 2013), and the dust it carries settles where
# the underside meets the wall, in the strip the course also keeps sheltered; so an old facade carries a soft dark line
# under every cornice, impost and band, darkest at the ledge and gone a hand's breadth below it. The owner, on a
# suggested weathered version of the top floor (2026-10-10): "light staining beneath ledges". Runoff (AI 564) already
# finds these drip lines and sheds a broad curtain from them, but turned up that curtain only greyed the whole wall
# (the step's sweep: tests/artifacts/screens/bradbury_weathering/605/sweep/); this feature lays the narrow strip itself.
#
# THE SOURCES are runoff's own drip lines (its published `drip_lines`: face, extent, height, how far the course stands
# out over the wall below), the upper courses only -- the crown cornice, the impost course at the top floor's arches and
# the band between floors 4 and 5 (KINDS); the ground floor's crown and string course keep their street-level
# calibration. Each run of a drip line between its stops (a bracket, a pier's return) is one source and one mark.
#
# THE STRIP hangs from the drip line down the wall: darkest at the ledge, an exponential fade of e-fold H below it,
# taller under a course that stands further out (more water creeps back, more shelter), and darker the higher the
# course (wind-driven rain hits a facade hardest at its top: runoff's law, EXPO_FOOT at the pavement, 1 at the crown).
#
# NO PATTERN (the owner: "i don't want noise pattern; noise is ok if it doesn't look like pattern"). Each run draws its
# own darkness and height from its own seed (sha256 of its place: a rebuild draws the same, and a change elsewhere
# reshuffles nothing); along a run both drift slowly, as a sum of a few long waves of unrelated lengths and seeded
# phases, so no two metres of a strip are alike and nothing repeats at any spacing; and every few metres, at a seeded
# place, the water leaving the ledge at a low spot draws a short drip further down. The strip's lower edge is broken in
# the shader by the wall's own joints, which hold the dust longer (as runoff's and soiling's are): it follows the
# brickwork, not a smooth line.
#
# THE LOOK is soiling's (AI 565), the deposit the owner accepted at three times its strength on the upper floors: the
# wall's own colour, darkened and greyed toward a warm grey-brown, a little matter. Masonry only, on walls and returns:
# never a top, a soffit, glass or metal.
#
# CONTROLS: the strength wear_ledge_stain (0: off, the look before AI 605 exactly; the shader only ever mixes from its
# input), and the weathering group's switch wear_realism (controls.REALISM: 0 or absent reverts the whole group).
import hashlib, math
import numpy as np
from .. import classes
from ..geometry import FACADES, Z_GROUND

NAME = "ledge_stain"
AI = 605
LABEL = "staining beneath the upper ledges"
ORDER = 221                      # a deposit, after runoff (220) and before the rain wash (225), which cleans what it reaches
NEEDS = ("runoff",)              # its drip lines
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (0.55, 0.20, 0.05)
MASK = dict(res=0.02, channels=1, bits=16)

KINDS = ("crown", "impost", "band")     # runoff's drip-line kinds on the upper floors
Z_TOP = 20.732                  # the crown's top
EXPO_FOOT = 0.6                 # runoff's height law: the pavement takes this share of the top edge's wind-driven rain

# ---------------------------------------------------------------------------------------------------- the strip
AMP = 0.85                      # the strip's value at the ledge, at the crown (before the run's own draw)
H_REF, REACH_REF = 0.07, 0.10   # its e-fold under a course standing REACH_REF out over the wall below ...
H_RANGE = (0.04, 0.14)          # ... growing as the square root of the reach, within these
DEPTH = 5.0                     # painted down to this many e-folds below the ledge
END_SOFT = 0.08                 # a strip fades in over this at the ends of its run (not at the block's corners)
CORNER = 0.15                   # a run's end within this of a face's end carries on round the corner

# ---------------------------------------------------------------------------------------------------- no pattern
RUN_AMP = (0.70, 1.15)          # a run's darkness times this, and ...
RUN_H = (0.80, 1.25)            # ... its height times this (the mean of two uniforms: the middle likelier)
WAVES = ((0.83, 0.10), (1.71, 0.08), (3.37, 0.07))   # (length m, amplitude) of the slow drift along a run, each length
WAVE_STRETCH = (0.85, 1.20)                          # times a draw and each phase drawn: unrelated, so nothing repeats
DRIP_EVERY = 4.5                # a run has a drip about every this many metres ...
DRIP_MARGIN = 0.25              # ... none nearer than this to its ends
DRIP_W = (0.025, 0.050)         # a drip's half-width (a gaussian's sigma) ...
DRIP_L = (0.12, 0.40)           # ... its e-fold down the wall ...
DRIP_AMP = (0.55, 0.95)         # ... and its value against the strip's at the ledge

# ---------------------------------------------------------------------------------------------------- the look
AMOUNT = 0.45                   # at strength 1 a full strip goes this far toward DIRT (calibrated on pose 12, see README)
DIRT_DARK = 0.45                # soiling's deposit: DIRT keeps this share of the wall's own colour ...
DIRT_GREY = 0.45                # ... after losing this much of its saturation toward a warm grey-brown
DIRT_TINT = (1.00, 0.95, 0.88)
MATTE = 0.85                    # and is at least this rough
JOINT_HOLD = 0.60               # a joint holds this much more of the dust: the strip's edge follows the brickwork
DEBUG_GAIN = 3.0


def _draw(key, n):
    # n uniforms in [0, 1) from the key's own sha256: the same every build, independent of everything else
    h = hashlib.sha256(("ledge_stain:" + key).encode()).digest()
    return [int.from_bytes(h[4 * i:4 * i + 4], "big") / 2 ** 32 for i in range(n)]


def _mid(rng, a, b):            # the mean of two uniforms mapped onto rng: the middle likelier than the ends
    return rng[0] + (rng[1] - rng[0]) * 0.5 * (a + b)


def _expo(z):
    return EXPO_FOOT + (1.0 - EXPO_FOOT) * float(np.clip((z - Z_GROUND) / (Z_TOP - Z_GROUND), 0.0, 1.0))


def build(ctx):
    lines = [d for d in ctx.field("runoff", "drip_lines") if d["kind"] in KINDS]
    n_runs = n_drips = 0
    by_kind = {}
    for d in lines:
        f = int(d["facade"]); F = FACADES[f]
        sa, sb, zl = float(d["s0"]), float(d["s1"]), float(d["z"])
        if sb - sa < 0.10: continue
        key = f"{d['kind']}:{F.name}:{sa:.2f}:{sb:.2f}:{zl:.2f}"
        u = _draw(key, 4 + 2 * len(WAVES))
        reach = max(float(d.get("reach", REACH_REF)), 0.01)
        h = float(np.clip(H_REF * math.sqrt(reach / REACH_REF), *H_RANGE)) * _mid(RUN_H, u[2], u[3])
        amp = AMP * _expo(zl) * _mid(RUN_AMP, u[0], u[1])
        waves = [(lam * (WAVE_STRETCH[0] + (WAVE_STRETCH[1] - WAVE_STRETCH[0]) * u[4 + 2 * k]),
                  a, 2.0 * math.pi * u[5 + 2 * k]) for k, (lam, a) in enumerate(WAVES)]
        fa = sa if sa > CORNER else -1e9                      # the ends fade where the run stops; round a corner it carries on
        fb = sb if sb < F.L - CORNER else 1e9

        def drift(Sx, sign=1.0):
            return 1.0 + sum(a * np.sin(2.0 * np.pi * Sx / lam + sign * ph) for lam, a, ph in waves)

        def strip(S, Z):
            dz = np.clip(zl - Z, 0.0, None)
            hh = h * drift(S, -1.0)                           # the height drifts on its own phases
            v = amp * drift(S) * np.exp(-dz / hh)
            ends = np.clip(np.minimum(S - fa, fb - S) / END_SOFT, 0.0, 1.0)
            return np.where(Z <= zl, v * ends, 0.0)

        src = ctx.source(f"ledge:{key}", "line", [F.world(sa, float(d["d_edge"]), zl), F.world(sb, float(d["d_edge"]), zl)],
                         facade=f, what=d["kind"], length=round(sb - sa, 3))
        m = ctx.mark(src, f, what=d["kind"], efold=round(h, 3), value=round(amp, 3))
        z_bot = zl - DEPTH * h * 1.4
        ctx.paint(m, strip, sa, sb, z_bot, zl)
        # the drips: about one every DRIP_EVERY along the run, each at its own drawn place, width, length and value
        n_d = int((sb - sa - 2 * DRIP_MARGIN) / DRIP_EVERY + _draw(key + ":n", 1)[0]) if sb - sa > 2 * DRIP_MARGIN else 0
        for k in range(max(n_d, 0)):
            q = _draw(f"{key}:drip:{k}", 5)
            s_d = sa + DRIP_MARGIN + (sb - sa - 2 * DRIP_MARGIN) * q[0]
            w = DRIP_W[0] + (DRIP_W[1] - DRIP_W[0]) * q[1]
            L = DRIP_L[0] + (DRIP_L[1] - DRIP_L[0]) * _mid((0.0, 1.0), q[2], q[3])
            a_d = amp * (DRIP_AMP[0] + (DRIP_AMP[1] - DRIP_AMP[0]) * q[4])

            def drip(S, Z, s_d=s_d, w=w, L=L, a_d=a_d):
                dz = np.clip(zl - Z, 0.0, None)
                return np.where(Z <= zl, a_d * np.exp(-0.5 * ((S - s_d) / w) ** 2) * np.exp(-dz / L), 0.0)
            ctx.paint(m, drip, s_d - 4 * w, s_d + 4 * w, zl - 4 * L, zl)
            ctx.path(m, [F.world(s_d, float(d["d_wall"]) + 0.02, zl), F.world(s_d, float(d["d_wall"]) + 0.02, zl - 2 * L)])
            n_drips += 1
        ctx.path(m, [F.world(sa, float(d["d_wall"]) + 0.02, zl - h), F.world(sb, float(d["d_wall"]) + 0.02, zl - h)])
        n_runs += 1
        b = by_kind.setdefault(d["kind"], dict(n=0, h=[], amp=[], length=0.0))
        b["n"] += 1; b["h"].append(h); b["amp"].append(amp); b["length"] += sb - sa
    ctx.log(f"   ledge_stain: {n_runs} runs under the upper courses, {n_drips} drips")
    for k, b in by_kind.items():
        ctx.log(f"   ledge_stain {k:<8} {b['n']:4d} runs, {b['length']:.1f} m: value {np.median(b['amp']):.2f} "
                f"({min(b['amp']):.2f}..{max(b['amp']):.2f}), e-fold {np.median(b['h']) * 100:.1f} cm "
                f"({min(b['h']) * 100:.1f}..{max(b['h']) * 100:.1f})")


def shader(g):
    v = g.mx(g.sep(g.i("Mask"))[0], 0.0)
    # masonry, on walls and returns: never a ledge's top or a soffit, never glass or metal
    where = g.mul(g.is_class(*classes.MASONRY), g.mul(g.one_minus(g.upward()), g.one_minus(g.downward())))
    # the joints hold the dust longer: the strip's lower edge follows the brickwork
    hold = g.clamp(g.mx(g.i("Joint"), g.i("Bed")))
    vv = g.clamp(g.mul(v, g.add(1.0, g.mul(hold, JOINT_HOLD))))
    # the group's switch: absent (a scene from before AI 605) reads 0, the look before the group exactly
    on = g.attr("wear_realism")
    amt = g.mul(g.mul(vv, where), g.mul(g.mul(g.i("Strength"), on), AMOUNT))
    col = g.i("Color")
    y = g.lum(col)
    deposit = g.rgb(g.mul(y, DIRT_TINT[0]), g.mul(y, DIRT_TINT[1]), g.mul(y, DIRT_TINT[2]))
    dirt = g.scale_rgb(g.mix(col, deposit, DIRT_GREY, 'RGBA'), DIRT_DARK)
    g.o("Color", g.mix(col, dirt, amt, 'RGBA'))
    g.o("Roughness", g.mix(g.i("Roughness"), g.mx(g.i("Roughness"), MATTE), amt))
    g.o("Debug", g.mul(where, g.clamp(g.mul(v, DEBUG_GAIN))))
