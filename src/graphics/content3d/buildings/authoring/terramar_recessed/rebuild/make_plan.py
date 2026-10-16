# make_plan.py -- AI 642: write the approved plan, rebuild/terramar_plan.json, the single source every layer script reads.
#
#   python -I make_plan.py        (system Python with numpy + Pillow; run plan_options.py first)
#
# Takes the approved silhouette option (APPROVED, from plan_options.py's construction) and derives every phase-1 layer
# from it: podium + entrance, tower wall line, balcony slab edge (with the flush front centre loggia), roof edge and its
# guard line, the penthouse kept out of b8's view, and the plan markers for the front pilasters and the rounded chamfer
# columns. Also draws the dimensioned approved plan: tests/artifacts/screens/buildings/terramar_recessed/rebuild/plan/
# plan_approved.png. The layers' own parameters follow in the same file: structure, envelope, balconies, podium, roof
# (AI 643-647), materials with the stone joint layout (AI 648) and the props (AI 627+).
#
# Runs (faces) of the approved plan, counter-clockwise from the front (the game's lettering): A front, B front-right
# chamfer, C right side, D right rear chamfer, E rear, F left rear chamfer, G left side, H front-left chamfer.
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import plan_options as P  # noqa: E402  (shares the geometry helpers and the measured constants)
import b8_camera_fit  # noqa: E402
import envelope_layout  # noqa: E402
import balcony_layout  # noqa: E402
import podium_layout  # noqa: E402
import props_layout  # noqa: E402

C = P.C
APPROVED = "E"
PLAN = os.path.join(HERE, "terramar_plan.json")
GUARD_INSET = 0.15          # roof glass guard line inside the roof edge
# the game's 10 x 7.5 m at the rear of the roof; 2026-10-15 the front wall pushed 1.2 m toward the terrace (10 x 8.7 m) so
# the lobby in front of the core is 2.75 m deep, still under CAM_B8's sightline (plan["roof"]["sightline"])
PENTHOUSE = {"x": [-5.0, 5.0], "y": [-2.2, 6.5], "height_m": 3.5}
COLUMN_WIDTH = 0.9          # rounded chamfer column casing (AI 616: 0.9 wide)
# Structure layer (AI 643)
GROUND_FLOOR_LEVEL = 0.15   # one step above the street (the game stands the building on a 0.2 m base)
GROUND_SLAB_BOTTOM = -0.25
PILASTER_PROUD = 0.05       # the front pilasters stand this far proud of the slab edge (AI 615 read b8's piers 0.06 proud)
# User fix 3 (2026-10-15): "the pillar should be inside the balcony, not extending outside". On the floor-1 terrace (the
# podium roof up to the floor-2 slab) the front pilasters stood on the podium edge, past the terrace guard. b8 shows them
# inside the terrace there, the floor-1 guard running on in front of them; so that storey of each pilaster sets back to
# the guard shoe's back face, and the floor-1 guard is one closed run. Above it they stay the facade's frame, proud of
# the slab edges the slabs stop against. No pillar passes a guard line (fix 10's room dividers end on it too).
# User fix 9 (2026-10-15): "the front pillars should extend outside of the building in the roof, it is like a molding to
# the building". b8 frames the front centre at the top: the pilasters run on up through the roof band, the band between
# them is one stone head in their plane, proud of the side bands (its shadow on the left one), and a cap line tops both.
# So the roof band from pilaster to pilaster is faced at the pilasters' plane (each pilaster's crown + the head, the
# head's joints in the head's own panels) and a stone cap in segments runs over it, `height` above the roof top (just
# over the guard shoe it hides from the street), `overhang` proud of the frame's face and ends, its back
# `shoe_clearance` short of the roof guard shoe, which runs on behind it
ROOF_FRAME = {"cap": {"height": 0.12, "overhang": 0.05, "shoe_clearance": 0.02}}
COLUMN = {"width": COLUMN_WIDTH, "proud": 0.18, "behind": 0.30, "front_radius": 0.40, "back_radius": 0.05}  # AI 616's casing
# User fix 10 (2026-10-15): "the pillars that separate the rooms should extend up to the balcony; the balcony glass should
# be interrupted". b8's chamfer columns reach the slab edge and the guard glass stops against them. The six room-dividing
# columns (the front chamfers' B/H, the rear chamfers' D/F, consistently) run out across the balcony as stone piers on
# every floor (the floor-1 terrace included): the casing's width and back, their face on the guard's outer face (the
# shoe's front, guard line + half the shoe: nothing of them passes the guard, fix 3's rule), the front arrises eased by
# `front_radius` (a larger round would leave the guard's ends standing proud of a curved face). The section replaces
# the casing's in plan.structure.columns (`casing_proud` keeps the old 0.18 m), so the envelope's jambs and wall panels
# meet the pier's flat sides; the guard is cut into runs between the piers, each stopping against a pier with an end post
PIER = {"front_radius": 0.02}
CORE = {"outer": {"x": [-3.6, 3.6], "y": [0.8, 6.0]}, "wall": 0.3, "partition": 0.2,
        "compartments": [{"name": "stair", "x": [-3.3, -0.7], "y": [1.1, 5.7]},
                         {"name": "lift_1", "x": [-0.5, 1.4], "y": [1.1, 5.7]},
                         {"name": "lift_2", "x": [1.6, 3.3], "y": [1.1, 5.7]}]}
ENTRANCE_SIDE_WALL = 0.57    # b8: the portal's stone jambs (AI 646; was 0.4)
# Envelope layer (AI 644): b8's black-framed sliders, ~1.0 m panes, transom ~0.4 m below the head; the front centre
# bay's wood reveals (~0.66 m) on floors 1-4 with four panes between, glazed on floor 5
ENVELOPE = {"frame_depth": 0.12, "member": 0.06, "head": 0.08, "sill": 0.05, "transom": 0.06, "transom_below_head": 0.40,
            "glass": 0.024, "post_ext": 0.03, "column_gap": 0.003, "pane_target": 1.0, "wood_reveal": 0.66,
            "wood_floors": [1, 2, 3, 4], "centre_panes": 4,
            # user fix 7 (2026-10-15): "not every bay in the room is windows, there are walls as well". b8's front
            # chamfers set a solid stone panel, about a pane wide and storey high, on both sides of each chamfer column
            # and at the chamfer's far end (the G/H and B/C corners), on every floor; the user marked the same three
            # panes on H's floor 2. The pane at that end of the bay becomes the panel (the chamfer columns' stone),
            # mirrored on B; the panes between keep their slider. bay id -> the ends ("start" / "end") made solid
            "wall_panels": {"H0": ["start", "end"], "H1": ["start"], "B0": ["end"], "B1": ["start", "end"]},
            "wall_slot": "TM_RB_column"}
# Balconies layer (AI 645): b8's frameless glass guards (slim dark top rail ~1.0 m above the floor, dark base shoe
# behind the slab fascia), stone walking surfaces, warm wood soffits with small downlights
BALCONIES = {"guard_inset": GUARD_INSET, "shoe": {"width": 0.06, "height": 0.10}, "glass": 0.015,
             "rail": {"width": 0.04, "height": 0.04}, "guard_height": 1.0, "panel_max": 1.6, "panel_gap": 0.01,
             "paving": 0.03, "threshold": {"depth": 0.28, "height": 0.015},
             # user fix 10: the paving's joint at a pier's side; wider than the window jambs' 3 mm gap to the pier, so the
             # paving's end and a jamb's side never share a plane
             "pier_joint": 0.008,
             # user fix 14 (2026-10-15: "this light got too close from the wall ... the current distance between
             # lights is good"): every light's rim keeps `clear_wall` in plan from a wall, pier or pilaster face (the
             # window frames' outer face for the wall) and `clear_edge` from the slab edge
             # user fix 17 (2026-10-15, addendum 2: "replace the circle gray dots for light sources on each floor; those
             # small spotlights, should have a black casing around them, really small"): every downlight of the building
             # (the balcony soffits, the entrance head band) is one instanced fitting (layer_balconies.fitting()): a
             # warm emitting lens `lens_radius` in a matte-black trim ring `trim` wide, `proud` below the wood, the lens
             # `recess` up inside the ring; the fitting sits on the dark core in a hole of the veneer plate (`seat` = the
             # plates' depth) with a `gap` wide shadow gap round the trim; `rgb` / `strength` as the head band's old
             # lights (visible dots by day, no halo). The lights now sit at the centres of the soffit plates (SOFFIT_VENEER), so `spacing` is gone;
             # clear_wall / clear_edge (fix 14) are still checked, rim = lens_radius + trim
             "downlight": {"lens_radius": 0.0275, "trim": 0.006, "proud": 0.0015, "recess": 0.001, "seat": 0.005, "gap": 0.001,
                           "segments": 24,
                           "rgb": [1.0, 0.80, 0.58], "strength": 120.0, "trim_rgb": [0.018, 0.018, 0.019],
                           "trim_roughness": 0.6, "clear_wall": 0.40, "clear_edge": 0.30},
             "soffit_rgb": [0.31, 0.125, 0.085],
             # user fix 8 (2026-10-15): "don't use curved glass ... where glass meets there must be a connector metal":
             # flat panels only, a slim charcoal post at every glass-to-glass junction (balcony_layout.guard_layout).
             # Fix 8b ("we don't want those intermediate small glasses to form a pseudo curve"): the guard line is the
             # balcony edge's sharp polygon inset by guard_inset (guard_line()); every run is straight full panels and
             # two runs meet at one corner post. The slab edges keep their fillets (b8's rounded stone read)
             "post": {"width": 0.03, "depth": 0.03, "clearance": 0.004}}
# User fix 16 (2026-10-15, the main entrance's two centre bays: "these must be real doors; in the second floor it can be
# automatic slide doors; Add handlers, rails, connectors"). entrance_doors.py builds them in the front centre's glazing
# (layer_podium.py). `bays`: the grid's pane spans that open: the vestibule's two centre bays (b8's door pair) and,
# above the entrance, the loggia's same two bays: they give onto the floor-1 terrace's middle, between its two tables
# (AI 636), and the dining room's way in behind them is kept clear (props_layout.DINING loggia_room `door_aisle`).
# `bead`: glazing beads on both faces of every fixed pane of both walls (width in the pane's plane, thickness off the
# glass), so no glass grows straight out of a frame
ENTRANCE_DOORS = {
    "bays": [1, 2],
    "bead": {"width": 0.018, "thickness": 0.012},
    # swing: framed glass leaves (stiles and rails deeper than the glass: a channel), `gap` round each and `meeting_gap`
    # between them; the transom over them deepened upward to `head` (it houses the concealed overhead closers), its
    # cover plates screwed at their ends; offset pivots `from_edge` in from the hinge edge (on the hinge stile's centre)
    # with patch straps on both faces at the corners; long bar pulls on standoffs on the meeting stiles, both faces;
    # an astragal on the right leaf's street face and a seal fin in the meeting gap; a chamfered stainless threshold
    # with the floor springs' cover plates (`front` / `back` of the pivot axis) set flush in it
    "swing": {"leaf": {"depth": 0.045, "hinge_stile": 0.06, "meeting_stile": 0.07, "top_rail": 0.07, "bottom_rail": 0.11,
                       "glass": 0.012, "gap": 0.004, "meeting_gap": 0.006},
              "head": 0.14,
              "threshold": {"depth": 0.24, "height": 0.012, "chamfer": 0.008},
              "floor_spring": {"front": 0.27, "back": 0.03, "width": 0.10, "slot": "TM_RB_frame"},
              "pivot": {"from_edge": 0.03, "pin_radius": 0.011, "strap": [0.16, 0.10], "strap_t": 0.005},
              "pull": {"length": 1.2, "radius": 0.016, "centre_above_floor": 1.05, "standoff_length": 0.05,
                       "standoff_radius": 0.0095, "standoff_in": 0.10},
              "astragal": {"width": 0.03, "thickness": 0.006, "inset": 0.01, "fin": 0.003, "fin_depth": 0.024},
              "cover_plate": {"inset": 0.03, "edge": 0.015, "thickness": 0.005, "screw_in": 0.03, "screw_radius": 0.004,
                              "screw_head": 0.003}},
    # slider: two framed leaves hung `standoff` in front of the frame's terrace face, overlapping the fixed panels'
    # mullions by `overlap`, so they visibly slide past the fixed panels; the operator header (the rail) on the frame's
    # face, `height` tall with its top on the transom's, its underside slotted for the leaves' hangers with the track in
    # the slot, stainless end caps; the opening's head in the frame's plane comes down to the header's bottom; motion
    # sensors on the header's terrace face and on the head's room face; floor guides on the paving past the closed
    # leaves' ends; brush seals under the leaves and behind their outer stiles, rubber seals at the meeting stiles;
    # flush pulls; a stainless threshold in the frame's plane, flush with the terrace paving
    "slider": {"leaf": {"depth": 0.04, "stile": 0.05, "top_rail": 0.08, "bottom_rail": 0.10, "glass": 0.012,
                        "standoff": 0.012, "overlap": 0.05, "gap": 0.004, "bottom_gap": 0.008, "meeting_gap": 0.012},
               "header": {"height": 0.16, "depth": 0.17, "end_cap": 0.012, "end_clear": 0.005, "lip": 0.03, "slot": 0.024,
                          "track": [0.012, 0.01]},
               "hanger": {"length": 0.10, "thickness": 0.008, "in": 0.12},
               "sensor": {"width": 0.22, "depth": 0.045, "height": 0.05, "above_bottom": 0.006, "lens": [0.16, 0.026],
                          "lens_proud": 0.004},
               "seals": {"brush_width": 0.02, "clear": 0.001, "inset": 0.005, "rubber": 0.005, "rubber_depth": 0.028},
               "pull": {"width": 0.025, "height": 0.20, "proud": 0.003, "centre_above_floor": 1.0},
               "guide": {"from_leaf": 0.04, "base": [0.08, 0.04, 0.005], "fin": [0.006, 0.02], "fin_in": 0.01}}}
# Podium layer (AI 646): b8's stone piers and bands, black-steel storefronts, deep upper recesses with guards, the
# entrance portal, lanterns and the kit sign; heights read through the plan-fitted CAM_B8
PODIUM = {"depth": 0.95, "pier_ext": 0.45, "column_pier": 0.9, "member": 0.06, "frame_depth": 0.12,
          "storefront_pane": 1.8, "upper_pane": 1.5,
          # head_rail (user fix 4, 2026-10-15): the storefronts' head rail under the head panel, as the upper recesses'
          # head; without it the transom glass ran up to the panel and its top sliver showed the far storefront's warm-lit
          # lintel underside and pier tops through the room: wood-coloured strips under each canopy's open end
          "storefront": {"plane_v": -0.30, "sill": 0.05, "head_rail": 0.10, "transom_bar": [3.40, 3.46], "panel": [4.00, 4.65],
                         "head": [4.65, 4.75]},
          "ground_lintel": [4.75, None], "upper": {"plane_v": -0.90, "head": 9.15, "transom_bar": [8.52, 8.58], "sill": 0.05},
          "guard_v": -0.08, "paving": 0.03,
          # head_band (user fix 4c, 2026-10-15; fix 4b's stone sides reverted: "that stone is not needed"): b8's warm
          # wood cover across the portal under the sign band, from the jambs' returns, `projection` proud of the front
          # stone wall and `back` behind it, `thickness` deep (b8: its face ~4 px, its soffit more), `end_gap` short of
          # the linings and returns; small downlights on its soffit's centre line (b8 shows about a dozen). User fix 17
          # (2026-10-15, on the band's 11 lights over 7 plates: "use one light source on each plate, centralized"):
          # one light at the centre of each of the band's veneer plates (podium() lays them out: `light_x`), the
          # building's shared fitting (BALCONIES downlight). The band keeps fix 15's `plates` (7 equal plates of 0.81 m,
          # the layout the user marked; 6 would give 0.95 m pitches against b8's dozen lights); fix 14's `clear_wall`
          # from the linings' faces is checked (the end plates' centres allow 0.38 m); across the 0.45 m band the
          # lights stay centred, 0.19 m from either edge
          "entrance_detail": {"lintel_bottom": 4.0, "vestibule_y": [-11.12, -11.0], "grid_x": [-2.0, -1.0, 0.0, 1.0, 2.0],
                              "doors": ENTRANCE_DOORS, "transom_bar": [2.92, 2.98], "wood_lining": 0.03,
                              "head_band": {"projection": 0.15, "back": 0.30, "thickness": 0.12, "end_gap": 0.01,
                                            "plates": 7, "clear_wall": 0.40},
                              "loggia": {"half_width": 2.95, "back_y": [-10.06, -9.94], "head": 9.37, "transom_bar": [8.76, 8.82]}},
          "lantern": {"z": [2.70, 3.02], "body": 0.16, "offset": 0.10, "bracket": 0.04},
          # sign lines (user fix 13b): centred on the sign band (door head to the upper podium) at `band_at` of its
          # height, measured in b8 (0.51 / 0.24): "TERRA & MAR" on the middle course's centre, "COASTAL KITCHEN" in
          # the bottom course; podium() fills centre_z (was 5.01 / 4.47 on the 4.0-5.79 band)
          "sign": {"depth": 0.03, "standoff": 0.015, "lines": [
              {"name": "terra_and_mar", "kit": "01_TERRA_AND_MAR", "installed": "terramar_sign_terra_and_mar", "card_width": 4.12, "band_at": 0.5},
              {"name": "coastal_kitchen", "kit": "02_COASTAL_KITCHEN", "installed": "terramar_sign_coastal_kitchen", "card_width": 2.73, "band_at": 0.24}],
              "note": "sized from b8 through CAM_B8 (visible glyph widths 3.85 and 2.54 m); the kit's 3.2 / 2.1 m are its suggested working scale, not a survey"}}
# Roof layer (AI 647): b8's deep rounded roof edge with a frameless glass guard all round; the penthouse kept out of
# b8's view (AI 642) with the aerial's openings, louvred annex, solar array and mechanical units
ROOF = {"paving": 0.05,
        "penthouse": {"wall": 0.25, "parapet_top": 3.8, "roof_slab": [3.2, 3.5], "cap": {"overhang": 0.03, "height": 0.06},
                      # 2026-10-15: the side openings, the annex and the plant moved 1.2 m forward with the front wall
                      "openings": [{"wall": "front", "kind": "door", "s": [-3.6, -2.6], "z": [0.0, 2.4]},
                                   {"wall": "front", "kind": "slider", "s": [0.5, 3.8], "z": [0.0, 2.6]},
                                   {"wall": "right", "kind": "window", "s": [0.3, 1.5], "z": [0.0, 2.6]},
                                   {"wall": "left", "kind": "door", "s": [0.3, 1.3], "z": [0.0, 2.4]},
                                   {"wall": "rear", "kind": "window", "s": [-3.0, -1.0], "z": [0.9, 2.6]},
                                   {"wall": "rear", "kind": "window", "s": [1.0, 3.0], "z": [0.9, 2.6]}],
                      "frame": {"member": 0.06, "depth": 0.08},
                      # 2026-10-15: the core rises through the penthouse (the roof-access headhouse); its front face
                      # opens on the lobby: the stair door and two lift doors, as frames and leaves on the face
                      "core_doors": [{"kind": "stair", "x": [-2.45, -1.55], "h": 2.1},
                                     {"kind": "lift", "x": [-0.05, 0.95], "h": 2.15},
                                     {"kind": "lift", "x": [1.95, 2.95], "h": 2.15}],
                      "call_panel": {"x": [1.41, 1.49], "z": [0.95, 1.2]}},
        "annex": {"x": [-8.5, -5.0], "y": [-1.2, 4.3], "height": 2.75, "post": 0.15, "beam": 0.25,
                  "louvre": {"width": 0.15, "thickness": 0.03, "spacing": 0.30}, "pane": 1.5},
        "solar": {"margin": 0.35, "panel": 1.0, "gap": 0.45, "tilt_deg": 10.0, "clearance": 0.15, "thickness": 0.04,
                  "module": 1.0, "module_gap": 0.02, "rail": 0.05},
        # 2026-10-15: detailed plant (roof_units.py): two top-discharge condensing units along the front parapet, a
        # side-discharge condenser behind them blowing out over the low parapet, their lines in a covered tray to the
        # roof hood; service: the side with seamed panels; pipes: the outlet side and its range along that side
        "units": [{"x": [-4.3, -2.7], "y": [-1.65, -0.65], "h": 1.1, "kind": "top_fan", "fans": 2, "blades": 4,
                   "service": "-x", "tone": "warm", "pipes": {"side": "+y", "a": [-3.05, -2.8]}, "seed": 1},
                  {"x": [-2.5, -1.2], "y": [-1.65, -0.75], "h": 0.95, "kind": "top_fan", "fans": 1, "blades": 5,
                   "service": "-y", "tone": "cool", "pipes": {"side": "+y", "a": [-2.43, -2.18]}, "seed": 2},
                  {"x": [-4.3, -3.65], "y": [-0.15, 0.85], "h": 0.8, "kind": "side_fan", "fan_side": "-x", "blades": 3,
                   "service": "-y", "tone": "warm", "pipes": {"side": "-y", "a": [-4.1, -3.85]}, "seed": 3}],
        "pipe_tray": {"x": [-4.2, -1.75], "y": [-0.45, -0.25]},
        "roof_hood": {"x": [-1.75, -1.15], "y": [-0.62, 0.02]},
        "units_zone": {"x": [-4.4, -0.9], "y": [-1.7, 0.95]}}
# Materials layer (AI 648): the kit limestone (AI 640) on every stone face set, its panel joints cut as geometry
# (b8: courses of storey / 5 on the pilasters, three courses across the sign band; large-format 1200 x ~670 mm panels),
# warm wood, black steel, clear glass. tone = linear multiplier on the kit's base colour, calibrated against b8 boxes
# under the calibrated rig (sample_tones.py): the stone's red is held at albedo ~0.95 (b8's lit stone is brighter
# than the rig's AgX shoulder allows a physical albedo to reach) and green / blue set b8's warm hue
MATERIALS = {
    "stone": {"set": "terramar_continuous_limestone", "repeat_m": 4.0, "tone": [1.24, 1.113, 1.115], "ao_strength": 0.5,
              "roughness_gain": 1.0, "normal_strength": 1.0,
              "slots": ["TM_RB_slab_fascia", "TM_RB_pilaster", "TM_RB_column", "TM_RB_podium_stone", "TM_RB_penthouse_stone",
                        "TM_RB_cover_stone"]},
    "paving": {"set": "terramar_continuous_limestone", "repeat_m": 4.0, "tone": [0.86, 0.86, 0.86], "ao_strength": 0.5,
               "roughness_gain": 1.0, "normal_strength": 1.0, "slots": ["TM_RB_paving", "TM_RB_threshold", "TM_RB_slab_top"]},
    # AI 630: the roof terrace's stone paving tiles (the aerial): the same limestone in 600 mm square tiles, each tile its
    # own region of the 4 m map (a per-tile offset), thin dark joints -- a material on the deck's own face set
    "roof_paving": {"set": "terramar_continuous_limestone", "repeat_m": 4.0, "tone": [0.84, 0.83, 0.81], "tile_m": 0.60,
                    "joint_m": 0.005, "joint_rgb": [0.30, 0.28, 0.25], "joint_roughness": 0.9, "roughness_gain": 1.0,
                    "normal_strength": 0.8, "slots": ["TM_RB_roof_paving"]},
    # AI 632: the sidewalk's pavers (site dressing), the same tiles a shade greyer
    "site_paving": {"set": "terramar_continuous_limestone", "repeat_m": 4.0, "tone": [0.74, 0.73, 0.71], "tile_m": 0.60,
                    "joint_m": 0.006, "joint_rgb": [0.27, 0.26, 0.24], "joint_roughness": 0.9, "roughness_gain": 1.0,
                    "normal_strength": 0.8, "slots": ["TM_RB_site_paving"]},
    # seams (2026-10-14): where two stone pieces meet flush (a lintel on a pier, a band under a slab fascia, a jamb beside
    # a pier) the joint is cut centred on the seam over the stretch they share; carry_hops: how many faces a vertical
    # joint carries on over (the eased arris, then the stone return) past its own face
    "joints": {"width": 0.008, "bevel": 0.003, "depth": 0.006, "panel_max": 1.2, "course_target": 0.67, "margin": 0.004,
               "vertical_min_height": 0.2, "seams": True, "seam_min_length": 0.02, "carry_hops": 2,
               "seed": 648, "rgb": [0.20, 0.185, 0.165], "roughness": 0.9,
               "rules": {"TM_RB_pilaster": {"courses": True, "verticals": True},
                         "TM_RB_column": {"courses": True, "verticals": False},
                         "TM_RB_slab_fascia": {"courses": False, "verticals": True},
                         "TM_RB_podium_stone": {"courses": True, "verticals": True},
                         "TM_RB_penthouse_stone": {"courses": True, "verticals": True}},
               # objects (2026-10-14): stone pieces whose face set is shared with non-stone uses, jointed by name in any
               # part that holds them; base: a joint at the foot of their sides, where they stand on the paving (the
               # site's raised limestone tree pits: blocks of at most panel_max, the coping's seam, the foot joint)
               "objects": {"rb_site_tree_pits": {"slot": "TM_RB_paving", "courses": False, "verticals": True, "base": True}},
               # grids (user fix 11, 2026-10-15: "the stones on the front, on the side of the main doors, must have blocks
               # of equal size and alignment"): a region whose stone reads as one regular grid of blocks across its
               # pieces. Courses: equal within each band between the region's own datums (materials() fills `datums`,
               # `bands`, `course_planes` and the `box` from the plan); a flush seam inside the box that is not on a
               # course plane is not cut (the block runs on over the piece boundary, one map offset per grid cell).
               # Verticals: per plane, the faces' ends (closer than `cluster` merged) are fixed lines and each gap
               # between them is cut into equal panels of at most panel_max, so every course of the plane shares them.
               # `inherit` face sets outside the box that meet a region face flush above or below (the slab fascias
               # and the plinth running on along the chamfers) take their vertical joints from the stone they meet.
               # User fix 13 (2026-10-15, the storefront head band beside a corner pier: "misaligned"): the grid is the
               # whole podium, every run (`slots`: the stone it lays out), so pier, storefront head band, slab fascia,
               # sign band and return share one set of course planes. Its datums are every edge a podium face must
               # meet: the ground, the door head, the storefront heads' stone bottom, the upper podium's top, the upper
               # heads' stone bottom, the podium top. One shared course height for the podium is re-derived from
               # course_target (within +-course_window): the height whose rounded course counts keep every band's
               # courses closest to it (podium_courses()); the podium's global course planes are the grid's.
               "grids": [{"name": "podium", "cluster": 0.02, "min_panel": 0.1, "inherit": ["TM_RB_slab_fascia"],
                          "margin": 0.05, "course_window": 0.2,
                          "slots": ["TM_RB_podium_stone", "TM_RB_pilaster", "TM_RB_column", "TM_RB_slab_fascia"]}]},
    "wood": {"rgb": [0.46, 0.25, 0.10], "roughness": 0.5, "slots": ["TM_RB_wood"],
             "note": "warm teak reveals and linings, flat: no wood texture is installed"},
    # veneer (user fix 4c, 2026-10-15: "if you can have a high luxury wood there (but needs to be luxury)"): the
    # entrance and loggia wood (linings, side walls, vestibule panels, head soffits, the head band) as a procedural
    # quarter-cut teak-walnut veneer on the box UVs: fine vertical grain (along the boards on soffits), leaves `leaf`
    # wide book-matched in pairs, a fine V-joint `joint` wide between pairs, a seeded tone / hue per pair (`vary`), a
    # satin clear coat over a faintly pored base; dark / mid / light are the grain's linear albedos (realistic, <= 0.4,
    # saturated as b8's teak panels), pitch the growth lines' mean spacing, ribbon how far the quarter-cut's ribbon
    # stripes darken toward dark
    "veneer": {"dark": [0.115, 0.047, 0.016], "mid": [0.235, 0.105, 0.036], "light": [0.330, 0.160, 0.058],
               "leaf": 0.21, "pitch": 0.0028, "ribbon": 0.45, "joint": 0.0025, "joint_rgb": [0.045, 0.028, 0.018],
               "vary": 0.07, "seed": 46,
               "roughness": 0.42, "coat": 0.75, "coat_roughness": 0.16, "bump": 0.02, "slots": ["TM_RB_veneer"],
               # user fix 15: on a plate (its face attributes rb_veneer_w / rb_veneer_seed, VENEER_PANELS) the leaves
               # divide the plate evenly and book-match only inside it, with no dark V-joint (the plate's reveal is the
               # joint); each plate draws its own grain scale (+-panel_jitter), tone (+-panel_vary) and hue, and its
               # pairs vary by vary * pair_vary_in_panel (leaves of one flitch)
               "panel_jitter": 0.15, "panel_vary": 0.09, "pair_vary_in_panel": 0.4},
    # user fix 15: the veneer plates' reveal floors and edges, a dark stained substrate
    "veneer_reveal": {"rgb": [0.030, 0.021, 0.015], "roughness": 0.8, "slots": ["TM_RB_veneer_reveal"]},
    "soffit": {"roughness": 0.5, "slots": ["TM_RB_soffit"],
               "note": "AI 645's flat tone calibrated on b8's soffits (balconies.soffit_rgb); since user fix 17 the "
                       "balcony soffits are veneer plates (TM_RB_soffit_veneer) and this slot is left on the entrance "
                       "volume's covered top only"},
    "steel": {"rgb": [0.018, 0.018, 0.020], "roughness": 0.38, "metallic": 0.0, "slots": ["TM_RB_frame", "TM_RB_louvre"],
              "note": "black powder-coated steel"},
    "glass": {"rgb": [0.94, 0.97, 0.97], "roughness": 0.02, "ior": 1.5, "slots": ["TM_RB_glass"]},
    # user fix 16: the entrance doors' hardware: brushed stainless (pulls, pivots, straps, thresholds, the header's end
    # caps and track), black rubber and brush seals, the motion sensors' dark glossy lenses
    "stainless": {"rgb": [0.60, 0.60, 0.58], "roughness": 0.27, "metallic": 1.0, "slots": ["TM_RB_stainless"]},
    "seal": {"rgb": [0.018, 0.018, 0.018], "roughness": 0.85, "slots": ["TM_RB_seal"]},
    "sensor_lens": {"rgb": [0.010, 0.010, 0.012], "roughness": 0.06, "slots": ["TM_RB_sensor_lens"]},
    "plaster": {"rgb": [0.74, 0.70, 0.64], "roughness": 0.9, "slots": ["TM_RB_ceiling"]},          # warm, not white (AI 634)
    "partition": {"rgb": [0.66, 0.61, 0.54], "roughness": 0.9, "slots": ["TM_RB_partition", "TM_RB_core"]},   # AI 634
    "interior_floor": {"rgb": [0.42, 0.33, 0.24], "roughness": 0.55, "slots": ["TM_RB_floor"]},
    "concrete": {"rgb": [0.48, 0.47, 0.45], "roughness": 0.85, "slots": ["TM_RB_roof_top", "TM_RB_hidden"]},
}
# Stone returns and connection joints (2026-10-14; the user on the entrance recess: "the stone has no depth; there should
# be a small stone on the side so it is 3d and not a wallpaper"). Where the limestone stops at another material on an
# outside corner it wraps the corner: at the entrance and loggia openings a reveal stone `return` deep on the jambs and
# under the heads (b8 shows stone reveals well into the portal before the wood), under the slab fascias the cladding's
# own thickness `fascia_return`; each flush with the next material's face, its arris eased by `arris`. A shadow gap `gap`
# wide and `gap_depth` deep (dark, the joint material) then separates it from the wood. Inside corners (stone side wall
# -> wood panel) get the same gap. Read by the structure (entrance jambs, the slab edges' fascia -> soffit), the podium
# (sign band, loggia jambs and lintel, linings) and the envelope (the front centre's wood reveal panels).
RETURNS = {"return": 0.10, "fascia_return": 0.04, "arris": 0.004, "gap": 0.010, "gap_depth": 0.018}
# User fix 1 (2026-10-15: "the edge of the building should be straight, no curves; change only the 2 first floors"): the
# podium (ground floor, upper podium and its top band, the podium roof slab) stands on the sharp polygon, its corners
# plain vertical edges as b8 shows them; the tower's slabs, balconies and roof keep the plan's fillets. The corner piers
# keep their reach along the runs (the fillets' tangent points + pier_ext), so the bays and their props stay put.
PODIUM_CORNER_RADIUS = 0.0
# User fix 2 (2026-10-15: "it is missing a curved covering (check the references); make it as a separate piece, make sure
# there is a connection line (very thin) between the wall and the piece, instead of continuation of the wall"). b8 and
# the aerial show the upper-podium loggia's head as one curved stone piece between the front jambs, from the loggia head
# up to the podium top. In plan it is half a rounded rectangle (user fix 2c, 2026-10-15: "it should be straight in the
# middle. but curved on the sides"): a straight front `projection` in front of the wall line, turning back to the jambs
# at each end through one convex corner; one curvature sign (fix 2b: "not an S curve"; it was an S tangent to the wall,
# then one bow, then a 0.40 m fillet plus a 5 cm square return). Fix 2d ("make the curve softer"): each corner is a
# quarter clothoid (`corner` = "clothoid", `corner_segments` per corner), its curvature growing from zero at the
# straight front, which it leaves tangentially, to square with the wall where it meets the jamb's reveal: with the
# 0.45 m projection it runs 0.80 m along the front, its radius > 0.8 m over the first 40 % and 0.33 m at the wall line.
# Its bottom arrises are rounded by `round`, its top arrises eased by `ease`. It sits in a notch of the podium roof slab,
# clear of the jambs and of the slab by a `reveal` gap whose floor, `reveal_depth` in, is a dark backer strip. Its own
# stone slot carries no panel joints.
LOGGIA_COVER = {"projection": 0.45, "corner": "clothoid", "corner_segments": 24, "round": 0.05, "ease": 0.008, "reveal": 0.006,
                "reveal_depth": 0.018, "slot": "TM_RB_cover_stone"}
# User fix 13b (2026-10-15, the sign band over the entrance: "different sizes. incorrect. prefer same size"). Fix 13 kept
# the podium's design datums (PODIUM: the door head 4.0, the storefront heads' stone bottom 4.75, the upper heads' 9.15)
# and let the courses between them vary (6 x 0.642 / 0.75 / 2 x 0.52 / 5 x 0.672 / 2 x 0.51). Now the podium has one
# course height and the datums move onto its planes (podium_course_datums): the floor levels stay (the ground floor, the
# upper podium's top, the podium top); each of the two storeys is cut into whole courses, the two heights agreeing
# within `tolerance` and inside `window`; of those splits the one that moves the design datums least wins, each datum
# going to the nearest plane of its storey. Only 9 + 7 courses (0.6267 / 0.6257) qualify: the door head goes to 3.91
# (6 courses; the sign band is 3 equal courses up to 5.79, as b8's three), the storefront heads' stone bottom to 4.537
# (7), the upper heads' to 8.919 (5 above 5.79). `loggia_head` "upper": the loggia's head on the upper heads' plane
# (b8: the loggia opening 0.74 of the upper podium's height and the cover 0.26; the old 9.37 gave 0.82 / 0.18, 8.919
# gives 0.71 / 0.29, the next plane up 0.86 / 0.14). Transoms and head panels move with their head; the canopies,
# the head band, the sign, the recess plants and the loggia cover follow from the moved values
PODIUM_COURSES = {"tolerance": 0.01, "window": [0.5, 0.8], "loggia_head": "upper"}
# User fix 15 (2026-10-15, the entrance's left jamb lining and side wall: "it is unlikely that we will have a single plate
# of wood correct? ... can you add the subdivision? but if adding subdivision the plates cannot have continuity"). Every
# veneer face of the entrance and the loggia (the jamb linings, the vestibule and loggia panels, both heads' soffits, the
# head band's fascia and soffit) is laid with real plates: a skin `depth` thick over a dark core (TM_RB_veneer_reveal),
# split into equal plates per face, `width` wide at most (nearest `target`; a narrower face is one plate) and at most
# `height_max` tall, with a reveal `reveal` wide between plates. Where a wall meets the soffit or the panel beside it
# (an inside corner) its plates stop `reveal` short; at the band's front arris both faces stop `reveal` short (a square
# quirk), so no plate wraps a corner. The band's and the head soffit's joints share their x and keep every downlight's
# rim at least `light_clear` from a joint's edge (fix 14's light_x stays). `seed` keys each plate's grain offset, scale
# and tone (layer_podium.py veneer_box(), layer_materials.py dress_veneer()), so the grain restarts at every joint
VENEER_PANELS = {"width": [0.6, 1.2], "target": 0.9, "height_max": 2.7, "reveal": 0.005, "depth": 0.005,
                 "light_clear": 0.05, "seed": 15, "slot": "TM_RB_veneer_reveal"}
# User fix 17 (2026-10-15: "use the wood material in the ceiling of all floors replacing the orange finish. favor larger
# wood pieces; horizontally larger (and layout as if it is luxury)"; addendum: "use one light source on each plate,
# centralized"). Every balcony soffit (above floors 1-5: the floor-2 to floor-5 slabs and the roof slab) is laid with
# fix 15's veneer plates (`depth` thick, `reveal` wide joints onto the dark core: the slab's soffit faces take `core`)
# in `slot`, dressed as TM_RB_veneer (materials.veneer) but its own slot for the wear (class soffit). Three courses
# parallel to the slab edge, from the free edge's shadow gap to the window frames' outer face, split as evenly as the
# light course allows: the light course centred on the soffit's centre line (BALCONY / 2), `light_width` of the depth
# (1/3: about 0.46 m each); a border course on the free edge, an inner course against the frames. Along each leg the
# plates run between the room-dividing piers, the pilasters and the corner mitres, each segment divided symmetrically
# into equal plates `plate` long nearest `target` (the light course's length; balcony_layout.soffit_plates), the end
# joints shared by the three courses; one downlight at the centre of every light-course plate. `seed` keys each
# plate's grain offset, scale and tone (the floor added in layer_balconies, so no two floors repeat)
SOFFIT_VENEER = {"plate": [1.9, 2.7], "target": 2.2, "light_width": 1 / 3, "light_course": 1, "reveal": 0.005,
                 "depth": 0.005, "seed": 17, "slot": "TM_RB_soffit_veneer", "core": "TM_RB_veneer_reveal"}
RUNS =["A", "B", "C", "D", "E", "F", "G", "H"]


def pts(poly):
    return [[round(float(x), 4), round(float(y), 4)] for x, y in poly]


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def penthouse_hidden_up_to(cal, plan_front_y, pier_plane_y, roof_top, y_front_wall):
    """Height above the roof top a penthouse wall at y_front_wall can reach before CAM_B8 sees it over the roof edge."""
    cb = cal["camera_b8"]
    cam_y, cam_z = pier_plane_y - cb["pier_plane_distance_m"], cb["camera_height_m"]
    slope = (roof_top - cam_z) / (plan_front_y - cam_y)
    return cam_z + slope * (y_front_wall - cam_y) - roof_top


def structure(lv, slab_tops, podium_top, roof_bot, roof_top, ph, cal, y_front, y_wall, rear_bay_check):
    """The structure layer's parameters (AI 643): every slab with its kind (the region and face-set rules live in
    layer_structure.py), the pilasters, the storey-high chamfer column segments, the core and the entrance walls."""
    t = lv["slab_edge"]
    gft = lv["ground_floor_top"]
    pier_face = round(P.BALCONY - BALCONIES["guard_inset"] + BALCONIES["shoe"]["width"] / 2, 4)   # user fix 10
    slabs = [{"name": "ground", "kind": "ground", "z": [GROUND_SLAB_BOTTOM, GROUND_FLOOR_LEVEL]},
             {"name": "upper_podium", "kind": "podium_floor", "z": [round(gft - t, 3), gft]},
             {"name": "podium_roof", "kind": "podium_roof", "z": [round(podium_top - t, 3), podium_top]}]
    slabs += [{"name": f"floor{n + 2}", "kind": "residential", "z": [round(top - t, 3), top]} for n, top in enumerate(slab_tops)]
    slabs.append({"name": "roof", "kind": "roof", "z": [roof_bot, roof_top]})
    storeys = [[podium_top, round(slab_tops[0] - t, 3)]]
    storeys += [[slab_tops[i], round(slab_tops[i + 1] - t, 3)] for i in range(len(slab_tops) - 1)]
    storeys.append([slab_tops[-1], roof_bot])
    core_top = round(roof_top + ROOF["penthouse"]["roof_slab"][0], 3)      # under the penthouse roof slab (AI 647)
    core_hidden = penthouse_hidden_up_to(cal, y_front, y_wall, roof_top, CORE["outer"]["y"][0])
    terrace = {"z": storeys[0], "y_front": round(y_front + BALCONIES["guard_inset"] + BALCONIES["shoe"]["width"] / 2, 4),
               "note": "user fix 3 (2026-10-15): the floor-1 storey of each pilaster stands inside the terrace, its face on "
                       "the guard shoe's back face; the floor-1 guard runs on in front of it (b8)"}
    xs = [x for xr in P.PIERS for x in xr]
    y_face = round(y_front - PILASTER_PROUD, 4)
    cap = ROOF_FRAME["cap"]
    roof_frame = {"x": [xs[0], xs[3]], "crowns": [list(xr) for xr in P.PIERS], "head": [xs[1], xs[2]],
                  "y": [y_face, y_front], "z": [roof_bot, roof_top],
                  "cap": {**cap, "z": [roof_top, round(roof_top + cap["height"], 3)],
                          "y": [round(y_face - cap["overhang"], 4),
                                round(y_front + BALCONIES["guard_inset"] - BALCONIES["shoe"]["width"] / 2
                                      - cap["shoe_clearance"], 4)]},
                  "note": "user fix 9 (2026-10-15): the pilasters run on up through the roof band as a frame, the head "
                          "between them in their plane, a stone cap in segments over both (b8)"}
    return {
        "comment": "AI 643 structure layer. Slab kinds: ground (podium outline + entrance), podium_floor (podium + entrance "
                   "canopy), podium_roof (podium outline, split at the wall line), residential (balcony edge notched around the "
                   "front pilasters, split at the wall line), roof (balcony edge). Every slab has a hole at the core.",
        "ground_floor_level": GROUND_FLOOR_LEVEL,
        "slab_thickness": t,
        "slabs": slabs,
        "pilasters": {"proud_m": PILASTER_PROUD, "z": [podium_top, roof_bot], "notch_kinds": ["residential"],
                      "terrace": terrace, "roof_frame": roof_frame},
        "columns": {**COLUMN, "proud": pier_face, "front_radius": PIER["front_radius"], "casing_proud": COLUMN["proud"],
                    "storeys": storeys, "rear_bay_check": rear_bay_check,
                    "note": "user fix 10 (2026-10-15): the room-dividing columns are piers out to the guard's outer "
                            "face (proud = from the wall line); the guard runs stop against them"},
        "core": {**CORE, "z": [GROUND_SLAB_BOTTOM, core_top],
                 "hidden_from_b8_up_to_m": round(core_hidden, 2),
                 "note": "stair + two lifts under the penthouse rectangle, rising to the underside of the penthouse roof slab, "
                         "which covers it; CAM_B8 sees over the roof edge at the core's front wall only above hidden_from_b8_up_to_m"},
        "entrance": {"side_wall": ENTRANCE_SIDE_WALL, "z": [GROUND_FLOOR_LEVEL, round(gft - t, 3)]},
    }


def envelope(plan, wall_sharp, columns):
    """The envelope layer's layout (envelope_layout.py): storeys, bays and panes per run, door panes, corner posts."""
    env = dict(ENVELOPE)
    env["storeys"] = plan["structure"]["columns"]["storeys"]
    bays, corners = envelope_layout.layout([tuple(p) for p in wall_sharp], 0.25, P.PIERS, columns,
                                           plan["structure"]["columns"], env, RUNS)
    return {**env, "comment": "AI 644 glazing on the tower wall line: positions in metres along each bay from a; v = offset "
                              "from the wall line (outward +). Floors 1-5 = the storeys above the podium roof. Panes listed "
                              "in doors slide (the balconies layer puts thresholds there).",
            "floors": {str(i + 1): z for i, z in enumerate(env["storeys"])}, "bays": bays, "corners": corners,
            "wall_radius": 0.25}


def guard_line(poly, inset):
    """User fix 8b (2026-10-15): the guard line, the balcony edge's sharp polygon inset by `inset`. Fix 8 rounded its
    corners in short chords of the fillets (0.35-0.38 m panels at every corner); the user wants straight runs of full
    panels, so the eight 45 degree turns are plain corners, each one post. Against the slab's fillets (0.64 / 1.0 m at
    the balcony edge) the shoe's outer corner stays 77 / 48 mm inside the stone arc (120 mm along the runs)."""
    return P.dedupe([(float(x), float(y)) for x, y in P.inset(poly, inset)])


def soffit_downlights(plan, poly, clip, piers, col, pil, half_frame):
    """User fix 17 (2026-10-15): the balcony soffits' veneer plates and their downlights (the same under every slab,
    floors 1-5), laid out together (balcony_layout.soffit_plates, SOFFIT_VENEER): one light at the centre of each plate
    of the light course. Then, as user fix 14 did, every rim is measured in plan against the pier and pilaster footprints,
    the window frames' outer face (the wall line + half the frame depth) and the slab edge; a light short of
    clear_wall / clear_edge would be dropped (and reported)."""
    dl, sv, rt = BALCONIES["downlight"], SOFFIT_VENEER, RETURNS
    r = dl["lens_radius"] + dl["trim"]
    stops = [{**c, "half": col["width"] / 2, "front": P.BALCONY - col["proud"]} for c in piers]
    stops += [{"at": [(x0 + x1) / 2, P.Y_FRONT + P.BALCONY], "along": [1.0, 0.0], "outward": [0.0, -1.0],
               "half": (x1 - x0) / 2, "front": None} for x0, x1 in pil]
    e0, e1 = rt["fascia_return"] + rt["gap"], P.BALCONY - half_frame           # the shadow gap's line, the frames' face
    w = (e1 - e0) * sv["light_width"]
    tc = P.BALCONY / 2
    cfg = {"edge": e0, "wall": e1, "joints": [round(tc - w / 2, 4), round(tc + w / 2, 4)], **sv}
    lay = balcony_layout.soffit_plates([tuple(p) for p in poly], stops, cfg, clip, RUNS)
    blocks = []
    for c in piers:
        (ax, ay), (ux, uy), (nx, ny), h = c["at"], c["along"], c["outward"], col["width"] / 2
        blocks.append([(ax + ux * u + nx * v, ay + uy * u + ny * v)
                       for u, v in ((-h, -col["behind"]), (h, -col["behind"]), (h, col["proud"]), (-h, col["proud"]))])
    y0, y1 = P.Y_FRONT - PILASTER_PROUD, P.Y_FRONT + P.BALCONY + 0.5
    blocks += [[(x0, y0), (x1, y0), (x1, y1), (x0, y1)] for x0, x1 in pil]
    wall = [tuple(q) for q in plan["layers"]["tower_wall_line"]["outline"]]
    edge = [tuple(q) for q in plan["layers"]["balcony_edge"]["outline"]]
    kept, dropped, worst = [], [], {"stop": math.inf, "wall": math.inf, "edge": math.inf}
    for p in lay["lights"]:
        gap = {"stop": min(balcony_layout.loop_distance(p, blk) for blk in blocks) - r,
               "wall": balcony_layout.loop_distance(p, wall) - half_frame - r,
               "edge": -balcony_layout.loop_distance(p, edge) - r}
        if min(gap["stop"], gap["wall"]) < dl["clear_wall"] - 1e-4 or gap["edge"] < dl["clear_edge"] - 1e-4:
            dropped.append({"at": p, **{g: round(v, 3) for g, v in gap.items()}})
            continue
        kept.append(p)
        worst = {g: min(worst[g], v) for g, v in gap.items()}
    lengths = [s["plate"] for s in lay["segments"]]
    check = {"segments": lay["segments"], "lights": len(kept), "dropped": dropped,
             "plates": len(lay["plates"]), "plate_m": [min(lengths), max(lengths)],
             "min_rim_clearance_m": {g: round(v, 3) for g, v in worst.items()},
             "note": "user fix 17: one light per light-course plate, at its centre; rims measured in plan (fix 14): "
                     "stop = a pier or pilaster face, wall = the window frames' outer face, edge = the slab edge (the "
                     "same points under every soffit, floors 1-5)"}
    veneer = {**sv, "courses_t": [round(e0, 4)] + cfg["joints"] + [round(e1, 4)], "light_t": lay["light_t"],
              "plates": lay["plates"],
              "comment": "user fix 17 (2026-10-15): the balcony soffits' veneer plates (the same under every soffit, "
                         "floors 1-5; layer_balconies.py): plan loops, u = the grain's direction, p0 / n the leg's corner "
                         "and inward normal (UVs: along = (p - p0) . u + dv, across = (p - p0) . n - t0), w the plate's "
                         "width across the grain; courses_t = the course lines' depth from the slab edge"}
    return kept, check, veneer


def balconies(plan, poly, radii):
    """The balconies layer's layout (balcony_layout.py): walking-surface pieces, guard runs, downlights, planter slots."""
    b = BALCONIES
    env = plan["envelope"]
    col = plan["structure"]["columns"]
    half_frame = env["frame_depth"] / 2
    shoe = b["shoe"]["width"]

    def loop(inset_m, radius_rule):
        return P.dedupe(P.rounded(P.inset(poly, inset_m), [radius_rule(r) if r > 0 else 0.0 for r in radii]))
    guard = guard_line(poly, b["guard_inset"])                                             # user fix 8b: sharp corners
    outer = P.inset(guard, shoe / 2)                                                       # the shoe's back face
    inner = loop(P.BALCONY - half_frame, lambda r: env["wall_radius"] + half_frame)      # the frames' outer face
    piers = plan["markers"]["chamfer_columns"]                    # user fix 10: the room dividers, out to the guard
    half = col["width"] / 2
    pil = [tuple(m["x"]) for m in plan["markers"]["front_pilasters"]]
    pil_pairs = ((pil[0][0], pil[0][1]), (pil[1][0], pil[1][1]))
    y_out, y_in = P.Y_FRONT + b["guard_inset"] + shoe / 2, P.Y_FRONT + P.BALCONY - half_frame
    _, centre, outer_ins, inner_ins = balcony_layout.split_at_pilasters(outer, inner, pil_pairs, y_out, y_in)
    # the paving round the building, cut at each pier's sides (pier_joint as the joint): a piece per room
    outer_path = balcony_layout._path(outer_ins, (pil_pairs[1][1], y_out), (pil_pairs[0][0], y_out))
    inner_path = balcony_layout._path(inner_ins, (pil_pairs[1][1], y_in), (pil_pairs[0][0], y_in))
    cut = half + b["pier_joint"]
    o_parts = balcony_layout.split_at_piers(outer_path, piers, cut)
    i_parts = balcony_layout.split_at_piers(inner_path, piers, cut)
    assert len(o_parts) == len(i_parts) == len(piers) + 1, (len(o_parts), len(i_parts))
    pieces = [o + list(reversed(i)) for (o, _, _), (i, _, _) in zip(o_parts, i_parts)]
    yg = P.Y_FRONT + b["guard_inset"]
    (l_out, l_in), (r_in, r_out) = pil_pairs
    guard_ins = balcony_layout._insert(guard, [(x, yg) for x in (l_out, l_in, r_in, r_out)])
    long_run = balcony_layout._path(guard_ins, (r_out, yg), (l_out, yg))
    centre_run = [(l_in, yg), (r_in, yg)]
    # floor 1 (user fix 3): the pilasters stand behind the guard there, so the guard ran as one closed run (from
    # mid-front). User fix 10: the piers cut both into runs between them; a run stops against a pier ("stop": an end
    # post on the pier's side) and runs to a pilaster's side as before ("open")
    ring = balcony_layout._insert(guard, [(0.0, yg)])
    k = balcony_layout._index(ring, (0.0, yg))
    terrace_run = ring[k:] + ring[:k + 1]
    end_kind = {"end": "open", "pier": "stop"}
    long_runs = balcony_layout.split_at_piers(long_run, piers, half)
    terrace_runs = balcony_layout.ring_at_piers(terrace_run, piers, half)
    assert len(long_runs) == len(terrace_runs) + 1 == len(piers) + 1, (len(long_runs), len(terrace_runs))
    # user fix 17: the soffit plates' border course is clipped to the free edge's shadow gap line inset by a reveal
    e_clip = RETURNS["fascia_return"] + RETURNS["gap"] + SOFFIT_VENEER["reveal"]
    clip = loop(e_clip, lambda r: r - e_clip)
    lights, light_check, soffit_veneer = soffit_downlights(plan, poly, clip, piers, col, pil, half_frame)
    guard_v = P.BALCONY - b["guard_inset"] - shoe / 2 - 0.32                              # pot centre from the wall line
    slots = balcony_layout.planter_slots(env["bays"], [1, 2, 3, 4, 5], guard_v, env["wood_reveal"])
    sharp = plan["runs"]["sharp_corners"]
    g_sharp = {k: v for k, v in zip(["H/A", "A/B", "B/C", "C/D", "D/E", "E/F", "F/G", "G/H"], P.inset(poly, b["guard_inset"]))}
    strips = [{"run": "H", "from": [round(c, 4) for c in g_sharp["G/H"]], "to": [round(c, 4) for c in g_sharp["H/A"]]},
              {"run": "A", "from": [round(c, 4) for c in g_sharp["H/A"]], "to": [l_out, yg]},
              {"run": "A", "from": [l_in, yg], "to": [r_in, yg]},
              {"run": "A", "from": [r_out, yg], "to": [round(c, 4) for c in g_sharp["A/B"]]},
              {"run": "B", "from": [round(c, 4) for c in g_sharp["A/B"]], "to": [round(c, 4) for c in g_sharp["B/C"]]}]
    # user fix 10: the H and B strips stop at the piers (an end "pier": props AI 628 keeps the boxes and their plants
    # clear of its side)
    cut_strips = []
    for st in strips:
        for part, k0, k1 in balcony_layout.split_at_piers([tuple(st["from"]), tuple(st["to"])], piers, half):
            cut_strips.append({"run": st["run"], "from": [round(c, 4) for c in part[0]],
                               "to": [round(c, 4) for c in part[-1]], "pier_ends": [k0 == "pier", k1 == "pier"]})
    strips = cut_strips
    rd = lambda pts: [[round(x, 4), round(y, 4)] for x, y in pts]  # noqa: E731
    return {**b, "comment": "AI 645 balconies: the walking surface from the frames' outer face to the guard shoe, split at "
                            "the pilasters and cut at the room-dividing piers (user fix 10, 2026-10-15); guard runs on "
                            "the guard line, stopping against the pilasters and the piers (guard_run_ends: open = the "
                            "glass runs to a pilaster's side, stop = an end post against a pier; floor 1: "
                            "terrace_guard_runs, in front of the pilasters, user fix 3, from pier to pier); the "
                            "soffits' veneer plates (soffit_veneer, user fix 17) with one downlight at the centre of "
                            "each light-course plate, every rim clear_wall from a wall / pier / pilaster and "
                            "clear_edge from the slab edge (user fix 14; downlight_check); "
                            "planter slots (pots per bay and floor) and the podium-edge planter strips (floor 1) are "
                            "reserved for props AI 627 / 628.",
            "paving_pieces": [rd(pc) for pc in pieces] + [rd(centre)],
            "guard_runs": [rd(run) for run, _, _ in long_runs] + [rd(centre_run)],
            "guard_run_ends": [[end_kind[k0], end_kind[k1]] for _, k0, k1 in long_runs] + [["open", "open"]],
            "terrace_guard_runs": [rd(run) for run, _, _ in terrace_runs],
            "terrace_guard_run_ends": [[end_kind[k0], end_kind[k1]] for _, k0, k1 in terrace_runs],
            "downlight_points": lights, "downlight_check": light_check, "soffit_veneer": soffit_veneer,
            "planter_slots": slots,
            "podium_planter_strips": [{**st, "floor": 1, "depth": 0.45} for st in strips]}


def podium_course_datums(ground, upper, top, design, cfg):
    """User fix 13b: one course height for the podium. The storeys ground..upper and upper..top are each cut into whole
    courses (n0, n1); a split qualifies when its two heights agree within cfg["tolerance"] and lie inside
    cfg["window"], and the design datums (name -> z) then move to the nearest course plane of their storey (strictly
    inside it, no two on one plane). Of the qualifying splits the one with the least total move wins. Returns the
    split, the moved datums, each move and every split tried."""
    lo, hi = cfg["window"]
    best, tried = None, []
    for n0 in range(max(1, math.ceil((upper - ground) / hi)), math.floor((upper - ground) / lo) + 1):
        for n1 in range(max(1, math.ceil((top - upper) / hi)), math.floor((top - upper) / lo) + 1):
            h0, h1 = (upper - ground) / n0, (top - upper) / n1
            moved = {}
            for name, z in design.items():
                z0, h, n = (ground, h0, n0) if z < upper else (upper, h1, n1)
                moved[name] = round(z0 + min(max(round((z - z0) / h), 1), n - 1) * h, 4)
            move = sum(abs(moved[k] - z) for k, z in design.items())
            ok = abs(h0 - h1) <= cfg["tolerance"] + 1e-9 and len(set(moved.values())) == len(moved)
            tried.append({"courses": [n0, n1], "course_m": [round(h0, 4), round(h1, 4)], "qualifies": ok,
                          "move_m": round(move, 3)})
            if ok and (best is None or move < best[0]):
                best = (move, n0, n1, h0, h1, moved)
    assert best is not None, f"no podium course split within {cfg}: {tried}"
    move, n0, n1, h0, h1, moved = best
    return {"courses": [n0, n1], "course_m": [round(h0, 4), round(h1, 4)], "design": design, "datums": moved,
            "moves": {k: round(moved[k] - z, 4) for k, z in design.items()}, "total_move_m": round(move, 3),
            "splits_tried": tried}


def panel_cuts(lo, hi, vp, avoid=()):
    """User fix 15: the joint centres splitting lo..hi into equal veneer plates, their width in vp["width"] nearest
    vp["target"] (a face narrower than the minimum is one plate). avoid: [(centre, radius)] of downlights the joints must
    keep vp["light_clear"] from (rim to the joint's edge); the nearest width that does wins. Returns (cuts, clearance)."""
    w = hi - lo
    (w0, w1), r = vp["width"], vp["reveal"]
    counts = [n for n in range(1, 64) if w0 - 1e-9 <= w / n <= w1 + 1e-9] or [max(1, math.ceil(w / w1 - 1e-9))]
    for n in sorted(counts, key=lambda n: abs(w / n - vp["target"])):
        cuts = [round(lo + w * k / n, 4) for k in range(1, n)]
        clear = min((abs(c - a) - r / 2 - ar for c in cuts for a, ar in avoid), default=math.inf)
        if clear >= vp["light_clear"]:
            return cuts, clear
    raise AssertionError(f"no veneer plate layout over {lo}..{hi} keeps {vp['light_clear']} m from the lights")


def veneer_panels(entrance, ed, ground, upper):
    """User fix 15 (VENEER_PANELS): the plate joints of every entrance and loggia veneer face, from the same values
    layer_podium builds those faces from. Walls: `rows` (z) and the cuts across each face (the linings along y, the
    panels beside the glazing along |x|); soffits and the band: cuts along x (one set for the band and the entrance's head
    soffit; user fix 17: the band's downlights then go to its plates' centres, podium()). Returns the plan's
    entrance_detail.veneer_panels."""
    vp, rt, lw = VENEER_PANELS, RETURNS, ed["wood_lining"]
    rows = lambda z0, z1: [round(z0 + (z1 - z0) * k / n, 4)  # noqa: E731
                           for n in [math.ceil((z1 - z0) / vp["height_max"] - 1e-9)] for k in range(1, n)]
    x_in = entrance["half_width"] - entrance["jamb"]
    hb, lg = ed["head_band"], ed["loggia"]
    xb = x_in - lw - hb["end_gap"]
    band = [round(-xb + 2 * xb * k / hb["plates"], 4) for k in range(1, hb["plates"])]   # fix 17: equal, one light each
    lining_y0 = entrance["y_front"] + rt["return"] + rt["gap"]
    loggia_y0 = entrance["y_back"] + rt["return"] + rt["gap"]
    x_lg = lg["half_width"] - lw
    out = {"entrance": {"rows": rows(ground[0], ed["lintel_bottom"]),
                        "lining": panel_cuts(lining_y0, ed["vestibule_y"][0], vp)[0],
                        "vestibule": panel_cuts(ed["grid_x"][-1], x_in - lw, vp)[0],
                        "soffit": band, "band": band, "band_ends": [round(-xb, 4), round(xb, 4)]},
           "loggia": {"rows": rows(upper[0], lg["head"]),
                      "lining": panel_cuts(loggia_y0, lg["back_y"][0], vp)[0],
                      "panel": panel_cuts(ed["grid_x"][-1], x_lg, vp)[0],
                      "soffit": panel_cuts(-x_lg, x_lg, vp)[0]}}
    return {**vp, **out, "comment": "user fix 15 (2026-10-15): the veneer plates' joints (VENEER_PANELS): rows = z, "
                                    "lining = y, vestibule / panel = |x| (mirrored), soffit / band = x"}


def podium(plan, poly, radii):
    """The podium layer's layout (podium_layout.py): piers, bays, the entrance, lanterns, the sign and prop slots."""
    cfg = dict(PODIUM)
    st, lv = plan["structure"], plan["levels_m"]
    slabs = {sl["name"]: sl for sl in st["slabs"]}
    # user fix 13b: the door head, the storefront heads and the upper heads onto the podium's equal course planes;
    # each head's transom and head panel move with it, the loggia's head joins the upper heads' plane
    sf, up, ed, lg = cfg["storefront"], cfg["upper"], cfg["entrance_detail"], cfg["entrance_detail"]["loggia"]
    courses = podium_course_datums(st["ground_floor_level"], slabs["upper_podium"]["z"][1], slabs["podium_roof"]["z"][1],
                                   {"door_head": ed["lintel_bottom"], "storefront_head": sf["head"][1],
                                    "upper_head": up["head"]}, PODIUM_COURSES)
    zd = courses["datums"]
    shift = lambda zs, d: [round(z + d, 4) for z in zs]  # noqa: E731
    ds, du = zd["storefront_head"] - sf["head"][1], zd["upper_head"] - up["head"]
    dl = (zd["upper_head"] if PODIUM_COURSES["loggia_head"] == "upper" else lg["head"]) - lg["head"]
    cfg["storefront"] = {**sf, "transom_bar": shift(sf["transom_bar"], ds), "panel": shift(sf["panel"], ds),
                         "head": shift(sf["head"], ds)}
    cfg["upper"] = {**up, "head": zd["upper_head"], "transom_bar": shift(up["transom_bar"], du)}
    cfg["entrance_detail"] = {**ed, "lintel_bottom": zd["door_head"],
                              "loggia": {**lg, "head": round(lg["head"] + dl, 4), "transom_bar": shift(lg["transom_bar"], dl)}}
    courses["moves"]["loggia_head"] = round(dl, 4)
    band = [zd["door_head"], slabs["upper_podium"]["z"][1]]                 # the sign band, door head to upper podium
    cfg["sign"] = {**cfg["sign"], "band_z": band,
                   "lines": [{**ln, "centre_z": round(band[0] + ln["band_at"] * (band[1] - band[0]), 4)}
                             for ln in cfg["sign"]["lines"]]}
    cfg["courses"] = {**courses, "comment": "user fix 13b (2026-10-15): one course height for the podium; the design "
                                            "datums (PODIUM's) moved onto its planes (podium_course_datums)"}
    e = plan["layers"]["entrance"]["outline"]
    entrance = {"half_width": max(x for x, _ in e), "y_front": min(y for _, y in e), "y_back": max(y for _, y in e),
                "jamb": st["entrance"]["side_wall"]}
    cols = [{**c, "at": [c["at"][0] + c["outward"][0] * P.BALCONY, c["at"][1] + c["outward"][1] * P.BALCONY]}
            for c in plan["markers"]["chamfer_columns"]]                  # the columns projected onto the podium outline
    lay = podium_layout.layout([tuple(q) for q in poly], radii, RUNS, cols, entrance, cfg,
                               outline_radii=[PODIUM_CORNER_RADIUS] * len(radii))
    ground = [st["ground_floor_level"], slabs["upper_podium"]["z"][0]]
    upper = [slabs["upper_podium"]["z"][1], slabs["podium_roof"]["z"][0]]
    cfg["ground_lintel"] = [cfg["storefront"]["head"][1], ground[1]]
    ed = cfg["entrance_detail"]
    ed["veneer_panels"] = vp = veneer_panels(entrance, ed, ground, upper)     # user fix 15: the plates' joints
    hb = ed["head_band"]                     # user fix 17: one downlight at the centre of each of the band's plates
    edges = [vp["entrance"]["band_ends"][0]] + vp["entrance"]["band"] + [vp["entrance"]["band_ends"][1]]
    light_x = [round((a + b) / 2, 4) for a, b in zip(edges, edges[1:])]
    x_lining = entrance["half_width"] - entrance["jamb"] - ed["wood_lining"]      # the linings' faces at its ends
    dl = BALCONIES["downlight"]
    rim = round(x_lining - max(abs(x) for x in light_x) - dl["lens_radius"] - dl["trim"], 4)
    ed["head_band"] = {**hb, "light_x": light_x, "light_check": {
        "lights": len(light_x), "plates": len(edges) - 1, "rim_to_lining_m": rim, "clear_wall": hb["clear_wall"],
        "note": "user fix 17: one light per band plate, at its centre; the end plates' centres allow this rim to the "
                "linings (fix 14 asked clear_wall)"}}
    x_open = ed["loggia"]["half_width"] - ed["wood_lining"]          # the loggia jambs' stone returns
    y_wall, rv = entrance["y_back"], LOGGIA_COVER["reveal"]
    cover = {**LOGGIA_COVER, "half_width": round(x_open - rv, 4), "y_wall": y_wall,
             "y_back": round(y_wall + RETURNS["return"] - rv, 4), "z": [ed["loggia"]["head"], slabs["podium_roof"]["z"][1]],
             "notch": {"x": [-x_open, x_open], "y": [y_wall, round(y_wall + RETURNS["return"], 4)]},
             "comment": "user fix 2 (2026-10-15): the curved cover over the upper-podium loggia, its own piece "
                        "(layer_podium.py rb_loggia_cover) in the podium roof slab's notch (layer_structure.py); x from "
                        "the centre line, y_wall the wall line its front projects from, y_back its back face"}
    props = {
        "awnings_ai631": [{"run": b["run"], "bay": b["id"], "s": b["s"], "z": [cfg["storefront"]["panel"][0], cfg["storefront"]["head"][1]],
                           "projection": 1.2} for b in lay["bays"]],
        "upper_planter_boxes_ai628": [{"run": b["run"], "bay": b["id"], "s": b["s"], "v": [round(cfg["upper"]["plane_v"] + 0.12, 3), round(cfg["guard_v"] - 0.06, 3)],
                                       "z": upper[0] + cfg["paving"]} for b in lay["bays"]],
        "sidewalk_cafe_ai632": [{"run": b["run"], "bay": b["id"], "s": b["s"], "v": [0.4, 4.0]} for b in lay["bays"] if b["run"] in ("B", "H")],
        "street_planters_ai633": [{"at": [round(sgn * (entrance["half_width"] + 0.6), 3), round(entrance["y_front"] - 0.5, 3)], "radius": 0.45}
                                  for sgn in (-1, 1)],
    }
    return {**cfg, **lay, "entrance": entrance, "storeys": {"ground": ground, "upper": upper}, "props": props,
            "loggia_cover": cover,
            "comment": "AI 646 podium on the podium outline (the balcony-edge line, its corners sharp since user fix 1, "
                       "2026-10-15): positions along each run from its sharp start corner, v from the outline (outward +, "
                       "the walls go to -depth). Corner piers wrap the corners (their faces where the plan's fillets "
                       "ended + pier_ext); on run A they reach the entrance volume. The props lists are reservations for "
                       "AI 628, 631, 632 and 633."}


def roof(plan, poly, radii):
    """The roof layer: guard halves on the roof guard line, the terrace outline, the penthouse, annex, solar rows and
    units, the b8 sightline limits they must stay under, and the terrace prop zones (AI 629 / 630)."""
    cfg = json.loads(json.dumps(ROOF))
    b = plan["balconies"]
    lv = plan["levels_m"]
    top = lv["roof_slab_top"]
    shoe = b["shoe"]["width"]

    guard = guard_line(poly, b["guard_inset"])                                             # user fix 8b: sharp corners
    planter_ring = P.inset(guard, shoe / 2 + 0.7)                     # the troughs' inner line, sharp as the guard
    # the deck stops 1 mm short of the shoe's back face: a sealant joint. Flush, the shoe's long base n-gon (its
    # float32 normal tilts by ~3e-5) read as cut by the deck's side faces in the collision audit
    terrace_outer = P.inset(guard, shoe / 2 + 0.001)
    yf = min(y for _, y in guard)
    yr = max(y for _, y in guard)
    guard = balcony_layout._insert(guard, [(0.0, yf), (0.0, yr)])
    halves = [balcony_layout._path(guard, (0.0, yf), (0.0, yr)), balcony_layout._path(guard, (0.0, yr), (0.0, yf))]
    pr = plan["layers"]["penthouse"]["outline"]
    px = sorted({q[0] for q in pr})
    py = sorted({q[1] for q in pr})
    ph = cfg["penthouse"]
    sol, zone = cfg["solar"], cfg["units_zone"]
    inner = [px[0] + ph["wall"] + sol["margin"], px[1] - ph["wall"] - sol["margin"],
             py[0] + ph["wall"] + sol["margin"], py[1] - ph["wall"] - sol["margin"]]
    depth = sol["panel"] * math.cos(math.radians(sol["tilt_deg"]))
    rows, y = [], inner[2]
    while y + depth <= inner[3] + 1e-6:
        x0, x1 = inner[0], inner[1]
        if y < zone["y"][1] and y + depth > zone["y"][0]:
            x0 = zone["x"][1] + 0.1                       # leave the units' corner free
        rows.append({"x": [round(x0, 4), round(x1, 4)], "y": [round(y, 4), round(y + depth, 4)]})
        y += depth + sol["gap"]
    cam = plan["cameras"]["b8"]
    y_c, z_c = cam["location"][1], cam["location"][2]
    y_edge = P.Y_FRONT
    limit = lambda yy: round(z_c + (top - z_c) * (yy - y_c) / (y_edge - y_c) - top, 3)  # noqa: E731
    tilt = math.radians(sol["tilt_deg"])
    highest = {"penthouse_front_wall": [py[0], ph["parapet_top"] + ph["cap"]["height"]],
               "solar_front_row": [rows[0]["y"][0], ph["roof_slab"][1] + sol["clearance"] + depth * math.tan(tilt) + sol["thickness"]],
               "units": [min(u["y"][0] for u in cfg["units"]), ph["roof_slab"][1] + max(u["h"] for u in cfg["units"])],
               "annex": [cfg["annex"]["y"][0], cfg["paving"] + cfg["annex"]["height"] + cfg["annex"]["beam"]]}
    sightline = {k: {"y": round(v[0], 3), "height_above_roof_m": round(v[1], 3), "hidden_up_to_m": limit(v[0]),
                     "hidden": v[1] < limit(v[0])} for k, v in highest.items()}
    rd = lambda pts: [[round(x, 4), round(y, 4)] for x, y in pts]  # noqa: E731
    return {**cfg, "comment": "AI 647 roof: heights are above the roof slab top (z %.3f). Guard halves meet at the front "
                              "and rear centres; the terrace runs from the guard shoe to the penthouse walls; every part "
                              "above the roof stays under CAM_B8's sightline over the roof edge (sightline)." % top,
            "roof_top": top, "guard_halves": [rd(h) for h in halves], "terrace_outer": rd(terrace_outer),
            "penthouse_rect": {"x": px, "y": py}, "solar_rows": rows, "sightline": sightline,
            "props": {"terrace_planters_ai629": {"outer": rd(terrace_outer), "inner": rd(planter_ring),
                                                 "note": "planters and small trees behind the guard (b8), all round"},
                      "terrace_furniture_ai630": [{"name": "dining", "x": [-10.0, -6.0], "y": [-8.5, -4.5]},
                                                  {"name": "lounge", "x": [6.0, 10.0], "y": [-8.5, -4.5]},
                                                  {"name": "front_centre", "x": [-3.0, 3.0], "y": [-8.5, -5.5]}]}}


def podium_courses(datums, course_target, window):
    """User fix 13: one shared course height for the podium. Every band between two datums takes n = round(h / c)
    courses of h / n; c runs over course_target +- window and the one kept makes the bands' courses closest to it (the
    largest |log(course / c)| smallest, then the sum of their squares). Returns (c, bands, course planes)."""
    heights = [z1 - z0 for z0, z1 in zip(datums, datums[1:])]
    best = None
    for k in range(round(course_target * (1 - window) * 1000), round(course_target * (1 + window) * 1000) + 1):
        c = k / 1000
        n = [max(1, round(h / c)) for h in heights]
        dev = [math.log(h / m / c) for h, m in zip(heights, n)]
        score = (round(max(abs(d) for d in dev), 4), sum(d * d for d in dev))
        if best is None or score < best[0]:
            best = (score, c, n)
    _, c, counts = best
    planes, bands = [], []
    for (z0, z1), n in zip(zip(datums, datums[1:]), counts):
        bands.append({"z": [z0, z1], "courses": n, "course_m": round((z1 - z0) / n, 4)})
        planes += [round(z0 + (z1 - z0) * k / n, 4) for k in range(n + 1)]
    return c, bands, sorted(set(planes))


def podium_grid(plan, g, course_target):
    """User fix 11 / 13: the podium's joint grid. Fix 11 laid the front centre out as one regular grid (the entrance
    portal, the front piers beside it and the loggia, the corner piers' faces, the slab fascias over them); fix 13
    widens it to the whole podium, every run, so the storefront head bands, the column piers, the corner piers' chamfer
    faces and the returns share its course planes. The box holds the podium outline and the portal in front of run A,
    ground floor to podium top. Its datums are the edges every face there must meet: the ground floor, the door head
    (the sign band's soffit), the storefront heads' stone bottom (the ground lintels), the upper podium's top (the
    portal's top, the upper recesses' sill), the upper heads' stone bottom, the podium top. The slab soffits at 5.38
    and 9.76 fall inside courses (their flush seams are not cut). Since user fix 13b the datums sit on one course
    height (podium(): podium_course_datums), so every band has courses of 0.626 +- 1 mm: 6 to the door head (3.91), 1
    to the storefront heads (4.537), 2 up the head band to the upper podium (5.79; the sign band 3 equal courses), 5 to
    the upper heads (8.919), 2 up the upper head band to the podium top (10.17). Fix 13 had 0.642 / 0.75 / 0.52 /
    0.672 / 0.51 between the old datums (4.0, 4.75, 9.15)."""
    st, pd, lv = plan["structure"], plan["podium"], plan["levels_m"]
    slabs = {s["name"]: s["z"] for s in st["slabs"]}
    m = g["margin"]
    datums = sorted({round(z, 4) for z in (st["ground_floor_level"], pd["entrance_detail"]["lintel_bottom"],
                                            pd["ground_lintel"][0], slabs["upper_podium"][1], pd["upper"]["head"],
                                            lv["podium_top"])})
    c, bands, planes = podium_courses(datums, course_target, g["course_window"])
    xs = [q[0] for q in plan["layers"]["podium"]["outline"]]
    ys = [q[1] for q in plan["layers"]["podium"]["outline"]] + [pd["entrance"]["y_front"]]
    box = {"x": [round(min(xs) - m, 3), round(max(xs) + m, 3)], "y": [round(min(ys) - m, 3), round(max(ys) + m, 3)],
           "z": [round(datums[0] - 0.01, 3), round(datums[-1] + 0.01, 3)]}
    return dict(g, box=box, datums=datums, course_m=c, bands=bands, course_planes=planes)


def materials(plan):
    """The materials layer: the families and their slots, and the stone's joint layout. Course joints are z-planes:
    the datums (podium storey and band levels, the slab tops, the roof slab, the penthouse parapet) split the height
    into bands, each band divided into equal courses near course_target; up to the podium top the bands and planes are
    the podium grid's (user fix 13). Vertical joints are laid per flat stone face by layer_materials.py (equal panels
    of at most panel_max; per plane inside a grid)."""
    cfg = json.loads(json.dumps(MATERIALS))
    # user fix 17: the balcony soffits' plates wear the entrance's veneer in their own slot (wear class soffit), its
    # clear coat less glossy: seen from the street at grazing angles a 0.75 coat mirrored the bright ground below and
    # turned the warm wood olive (b8's soffits read warm and matte)
    cfg["soffit_veneer"] = {**cfg["veneer"], "coat": 0.3, "coat_roughness": 0.35, "slots": ["TM_RB_soffit_veneer"],
                            "note": "user fix 17: the veneer family (materials.veneer) with a satin, less glossy coat"}
    lv, st, pd, rf = plan["levels_m"], plan["structure"], plan["podium"], plan["roof"]
    slabs = {s["name"]: s["z"] for s in st["slabs"]}
    datums = [st["ground_floor_level"], pd["entrance_detail"]["lintel_bottom"], pd["ground_lintel"][0],
              slabs["upper_podium"][0], slabs["upper_podium"][1], pd["upper"]["head"], slabs["podium_roof"][0],
              lv["podium_top"]] + lv["balcony_slab_tops"] + [lv["roof_slab_bottom"], lv["roof_slab_top"],
                                                             round(rf["roof_top"] + rf["penthouse"]["parapet_top"], 3)]
    jt = cfg["joints"]
    jt["grids"] = [podium_grid(plan, g, jt["course_target"]) for g in jt["grids"]]
    podium = jt["grids"][0]                         # user fix 13: up to the podium top the courses are the podium grid's
    top = podium["datums"][-1]
    datums = sorted({round(z, 4) for z in datums if z >= top - 1e-6} | set(podium["datums"]))
    planes, bands = list(podium["course_planes"]), list(podium["bands"])
    for a, b in zip(datums, datums[1:]):
        if b <= top + 1e-6:
            continue
        n = max(1, round((b - a) / jt["course_target"]))
        bands.append({"z": [a, b], "courses": n, "course_m": round((b - a) / n, 4)})
        planes += [round(a + (b - a) * k / n, 4) for k in range(n + 1)]
    jt["datums"] = datums
    jt["bands"] = bands
    jt["course_planes"] = sorted(set(planes))
    cfg["soffit"]["rgb"] = plan["balconies"]["soffit_rgb"]
    cfg["comment"] = ("AI 648 materials: families -> TM_RB_* slots (re-dressed by name). Stone = the kit limestone "
                      "(assets/public/pbr/<set>, 4 m repeat) with joints cut as geometry: a groove of width w and depth d "
                      "with a bevel b each side, its floor in the joint material; course planes from the datums' bands, "
                      "vertical joints per flat face. Each panel gets its own UV offset (seeded) so the repeat does not show.")
    return cfg


def cameras(cal, plan):
    """The comparison cameras every layer renders its evidence from. CAM_B8 is fitted to this plan (b8_camera_fit.py),
    starting from calibrate_references.py's camera; the aerial camera fits the aerial's roof plane only."""
    picks = C.load_json(os.path.join(HERE, "reference_points.json"))
    cb, ca = cal["camera_b8"], cal["aerial"]["camera"]
    return {
        "b8": b8_camera_fit.fit(picks["b8"], plan, (cb["location"][1], cb["location"][2], cb["focal_px"])),
        "aerial": {"location": ca["location"], "rotation_deg": [round(90 - ca["pitch_down_deg"], 3), 0.0, 0.0],
                   "focal_px": ca["focal_px"], "shift_y": 0.0, "resolution": ca["resolution"],
                   "note": "fitted to the aerial's roof plane only: its facades cannot share one camera"},
        "rear": {"location": [46.0, 52.0, 34.0], "target": [0.0, -1.0, 12.5], "lens_mm": 35.0, "resolution": [1600, 1100]},
        "top": {"location": [0.0, 0.7, 80.0], "rotation_deg": [0.0, 0.0, 0.0], "ortho_scale": 32.0, "resolution": [1600, 1500]},
    }


def main():
    cal = C.load_json(P.CAL)
    opts = C.load_json(P.PLAN_OPTIONS)
    lv = opts["levels_m"]
    rear_line = P.aerial_rear_line(cal)
    poly, radii, dims = P.option_outline(APPROVED, rear_line)
    edge = P.dedupe(P.rounded(poly, radii))
    podium_edge = P.dedupe(P.rounded(poly, [PODIUM_CORNER_RADIUS] * len(radii)))       # user fix 1: sharp corners
    wall_sharp = P.inset(poly, P.BALCONY)
    wall = P.dedupe(P.rounded(wall_sharp, [max(r - P.BALCONY, 0.25) if r > 0 else 0.0 for r in radii]))
    guard = guard_line(poly, GUARD_INSET)                                                  # user fix 8b: sharp corners

    podium_top, roof_top = lv["podium_top"], lv["roof_slab_top"]
    roof_bot = round(roof_top - lv["roof_edge"], 3)
    slab_tops = [round(podium_top + n * lv["storey"], 3) for n in range(1, lv["residential_floors"])]
    y_front, y_wall = P.Y_FRONT, P.Y_FRONT + P.BALCONY
    e = P.ENTRANCE
    entrance = [(-e["half_width"], y_front - e["projection"]), (e["half_width"], y_front - e["projection"]),
                (e["half_width"], y_front), (-e["half_width"], y_front)]
    ph = PENTHOUSE
    penthouse = [(ph["x"][0], ph["y"][0]), (ph["x"][1], ph["y"][0]), (ph["x"][1], ph["y"][1]), (ph["x"][0], ph["y"][1])]
    hidden = penthouse_hidden_up_to(cal, y_front, y_wall, roof_top, ph["y"][0])

    # sharp corner order: A/B, B/C, C/D, D/E, E/F, F/G, G/H, H/A
    ha, ab, bc, cd, de, ef, fg, gh = [tuple(p) for p in poly]
    w = [tuple(p) for p in wall_sharp]
    columns = [
        {"run": "B", "at": lerp(w[1], w[2], 0.5), "source": "b8: the right chamfer's two bays meet at a rounded column (reads 0.9 m past mid-run, within the calibration error)"},
        {"run": "H", "at": lerp(w[7], w[0], 0.5), "source": "mirror of B"},
        {"run": "D", "at": lerp(w[3], w[4], 1 / 3), "source": "proposed: the rear chamfers in three bays, close to the front chamfer bay width"},
        {"run": "D", "at": lerp(w[3], w[4], 2 / 3), "source": "proposed"},
        {"run": "F", "at": lerp(w[5], w[6], 1 / 3), "source": "proposed"},
        {"run": "F", "at": lerp(w[5], w[6], 2 / 3), "source": "proposed"},
    ]
    for c, (i, j) in zip(columns, [(1, 2), (7, 0), (3, 4), (3, 4), (5, 6), (5, 6)]):
        d = np.subtract(w[j], w[i])
        d = d / np.linalg.norm(d)
        c["along"], c["outward"] = (float(d[0]), float(d[1])), (float(d[1]), float(-d[0]))   # CCW: outward = right normal
    front_bay = math.dist(w[1], w[2]) / 2
    rear_run = math.dist(w[3], w[4])
    sharp = [ha, ab, bc, cd, de, ef, fg, gh]
    run_len = {r: round(math.dist(sharp[i], sharp[(i + 1) % 8]), 3) for i, r in enumerate(RUNS)}
    xs, ys = [p[0] for p in edge], [p[1] for p in edge]

    plan = {
        "comment": "Terra & Mar rebuild (AI 642): the approved plan. Blender frame, metres: front faces -Y, z up, street z 0, the "
                   "front balcony edge at y -11. Every layer script reads its outlines and levels from here; nothing is hard-coded.",
        "approved": {"option": APPROVED, "date": "2026-10-12",
                     "by": "user: annotated top view of option A -- drop the rear face, run the rear chamfers on to one square "
                           "corner (\"more aligned to the aerial view\"); then cut that point with a rear face as short as the sides; "
                           "every junction rounded with the same small curvature"},
        "decisions": {
            "penthouse": "keep, set back out of b8's view (about 10 x 7.5 m at the rear of the roof, as in the aerial)",
            "front_centre_bay": "flush loggias between the two full-height pilasters, as b8: slab edges flush with the pilaster faces, glazing at the wall line",
            "footprint": "the rebuild's own (27.0 x 24.5 m); the game's 28 x 22 m podium is a comparison only -- no city spec places Terra & Mar yet",
            "superseded_prompts": "exterior AI 617-626 and 641 (written against the game shells); props AI 627-633 and interiors AI 634-638 retargeted to the rebuild; AI 639 and 640 unchanged",
        },
        "runs": {"order": RUNS, "names": {"A": "front", "B": "front-right chamfer", "C": "right side", "D": "right rear chamfer",
                                          "E": "rear", "F": "left rear chamfer", "G": "left side", "H": "front-left chamfer"},
                 "lengths_at_balcony_edge_sharp_m": run_len,
                 "sharp_corners": {lbl: [round(c[0], 4), round(c[1], 4)] for lbl, c in
                                   zip(["H/A", "A/B", "B/C", "C/D", "D/E", "E/F", "F/G", "G/H"], sharp)}},
        "dimensions_m": {"width": round(max(xs) - min(xs), 3), "depth": round(max(ys) - min(ys), 3), "front": 2 * P.FRONT_HALF,
                         "front_chamfer": f"{P.CHAMFER_DEPTH} x {P.CHAMFER_DEPTH} at 45 degrees", "side": dims["side_m"],
                         "balcony_depth": P.BALCONY, "corner_radius_front": P.R_FRONT, "corner_radius_other": P.R_SIDE,
                         "wall_line_corner_radius": 0.25, "podium_corner_radius": PODIUM_CORNER_RADIUS},
        "levels_m": {"street": 0.0, "ground_floor_top": lv["ground_floor_top"], "podium_top": podium_top, "storey": lv["storey"],
                     "residential_floors": lv["residential_floors"], "balcony_slab_tops": slab_tops, "slab_edge": lv["slab_edge"],
                     "roof_slab_bottom": roof_bot, "roof_slab_top": roof_top},
        "measured": {
            "source": "calibrate_references.py -> calibration.json, from the points in reference_points.json (b8 camera: horizon from the "
                      "pedestrians' heads, focal from the chamfer rails' vanishing point, scale from the 3.35 m storey)",
            "front_half_at_balcony_edge": cal["front_m"]["front_half_at_balcony_edge_m"], "pier_centres": cal["front_m"]["pier_centres_m"],
            "pier_width": cal["front_m"]["pier_width_m"], "chamfer_angle_deg": cal["chamfer"]["angle_deg"],
            "chamfer_end_half_width": cal["chamfer"]["end_half_width_m"], "front_corner_radius": cal["front_m"]["corner_radius_m"],
            "podium_top": cal["levels_m"]["podium_top_m"], "roof_slab_top": cal["levels_m"]["roof_slab_top_m"],
            "rounded_to": "front 10.0, chamfers 45 degrees to a 27.0 m width, radius 0.64; b8 and the aerial are AI images (+/-5-10 %)",
        },
        "layers": {
            "podium": {"outline": pts(podium_edge), "z": [0.0, podium_top],
                       "note": "ground + upper podium and the podium roof slab; outline = the balcony edge line with sharp "
                               "corners (user fix 1, 2026-10-15: b8's podium corners are plain vertical edges)"},
            "entrance": {"outline": pts(entrance), "z": [0.0, lv["ground_floor_top"]], "note": "projecting entrance volume on run A"},
            "tower_wall_line": {"outline": pts(wall), "z": [podium_top, roof_bot], "note": "glazing / wall line, 1.5 m inside the balcony edge"},
            "balcony_edge": {"outline": pts(edge), "slab_tops": slab_tops, "slab_edge": lv["slab_edge"],
                             "centre_bay": {"run": "A", "x": [P.PIERS[0][1], P.PIERS[1][0]], "mode": "flush_loggia",
                                            "note": "between the pilasters the slab edge is flush with the pilaster faces; the loggia is the 1.5 m behind"}},
            "roof_edge": {"outline": pts(edge), "z": [roof_bot, roof_top]},
            "roof_guard_line": {"outline": pts(guard), "inset_m": GUARD_INSET, "z": [roof_top, round(roof_top + 1.1, 3)]},
            "penthouse": {"outline": pts(penthouse), "z": [roof_top, round(roof_top + ph["height_m"], 3)],
                          "hidden_from_b8_up_to_m": round(hidden, 2),
                          "note": "kept out of b8's view: CAM_B8 sees over the roof edge only above this height at its front wall"},
        },
        "markers": {
            "front_pilasters": [{"x": list(xr), "y": [y_front, y_wall], "z": [podium_top, roof_bot]} for xr in P.PIERS],
            "chamfer_columns": [{"run": c["run"], "at": [round(c["at"][0], 3), round(c["at"][1], 3)], "width_m": COLUMN_WIDTH,
                                 "along": [round(v, 6) for v in c["along"]], "outward": [round(v, 6) for v in c["outward"]],
                                 "on": "tower_wall_line", "source": c["source"]} for c in columns],
        },
        "structure": structure(lv, slab_tops, podium_top, roof_bot, roof_top, ph, cal, y_front, y_wall,
                               {"front_chamfer_bay_m": round(front_bay, 3), "rear_chamfer_wall_run_m": round(rear_run, 3),
                                "rear_three_bays_m": round(rear_run / 3, 3), "rear_two_bays_m": round(rear_run / 2, 3),
                                "chosen_bays": 3, "why": "three bays (-11 %) sit much closer to the front chamfers' bay than two (+33 %)"}),
        "game_comparison": {"podium_m": [28, 22], "tower_m": [25, 19], "depth_difference_m": round(max(ys) - min(ys) - 22, 2)},
    }
    plan["cameras"] = cameras(cal, plan)
    plan["returns"] = {**RETURNS, "comment": "2026-10-14 stone returns and connection joints: where the stone stops at "
                                             "another material on an outside corner it wraps the corner (`return` at "
                                             "the entrance and loggia jambs and heads, `fascia_return` under the slab "
                                             "fascias; flush with the next material's face, arris eased by `arris`), "
                                             "then a shadow gap `gap` wide and `gap_depth` deep (TM_RB_stone_joint) "
                                             "before the wood; an inside corner (stone side wall -> wood panel) gets "
                                             "the same gap"}
    plan["envelope"] = envelope(plan, wall_sharp, columns)
    plan["balconies"] = balconies(plan, poly, radii)
    plan["podium"] = podium(plan, poly, radii)
    plan["roof"] = roof(plan, poly, radii)
    plan["materials"] = materials(plan)
    plan["props"] = {"balcony_plants": props_layout.balcony_plants(plan, P.BALCONY),       # AI 627
                     "podium_planters": props_layout.podium_planters(plan),               # AI 628
                     "roof_planters": props_layout.roof_planters(plan)}                   # AI 629
    plan["props"]["roof_furniture"] = props_layout.roof_furniture(plan)                    # AI 630 (needs roof_planters)
    plan["props"]["storefront_awnings"] = props_layout.storefront_awnings(plan)            # AI 631
    plan["props"]["sidewalk_cafe"] = props_layout.sidewalk_cafe(plan)                      # AI 632 (site dressing)
    plan["props"]["street_dressing"] = props_layout.street_dressing(plan)                  # AI 633 (site dressing)
    plan["props"]["entrance_plants"] = props_layout.entrance_plants(plan)                  # user fix 12 (props)
    plan["interior"] = {"base": props_layout.interior_base(plan)}                          # AI 634
    plan["interior"]["restaurant_l0"] = props_layout.restaurant_l0(plan)                   # AI 635
    plan["interior"]["dining_l1"] = props_layout.dining_l1(plan)                           # AI 636
    plan["interior"]["residential"] = props_layout.residential(plan)                       # AI 637
    plan["interior"]["penthouse"] = props_layout.penthouse(plan)                           # AI 638
    with open(PLAN, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(plan, fh, indent=2)
    draw(plan, poly, edge, wall, guard, entrance, penthouse, columns, cal)
    print("PLAN", json.dumps({"option": APPROVED, "size_m": [plan["dimensions_m"]["width"], plan["dimensions_m"]["depth"]],
                              "runs": run_len, "penthouse_hidden_up_to_m": round(hidden, 2)}))


def draw(plan, poly, edge, wall, guard, entrance, penthouse, columns, cal, scale=30, pad=80):
    top_y, bottom_y, half_w = 18.0, -14.0, 17.5
    w, h = int(2 * half_w * scale + 2 * pad), int((top_y - bottom_y) * scale + 2 * pad + 110)
    im = Image.new("RGB", (w, h), (250, 249, 246))
    d = ImageDraw.Draw(im, "RGBA")
    ox, oy = w / 2, pad + 110
    to = lambda p: (ox + p[0] * scale, oy + (top_y - p[1]) * scale)  # noqa: E731
    for g in range(-16, 17, 2):
        d.line([to((g, bottom_y)), to((g, top_y))], fill=(0, 0, 0, 16))
    for g in range(-14, 19, 2):
        d.line([to((-half_w, g)), to((half_w, g))], fill=(0, 0, 0, 16))
    pod, _ = P.game_outlines()
    d.polygon([to(p) for p in pod], outline=(170, 170, 170))
    d.polygon([to(p) for p in edge], fill=(214, 200, 182, 255), outline=(60, 50, 40))
    d.polygon([to(p) for p in wall], fill=(236, 230, 220, 255), outline=(120, 100, 80))
    for a, b in zip(guard, guard[1:] + guard[:1]):
        d.line([to(a), to(b)], fill=(40, 120, 170, 200), width=1)
    d.polygon([to(p) for p in entrance], fill=(170, 150, 120, 255), outline=(90, 80, 70))
    for xr in P.PIERS:
        d.rectangle([to((xr[0], P.Y_FRONT + P.BALCONY)), to((xr[1], P.Y_FRONT))], fill=(90, 80, 70))
    for c in columns:
        x, y = to(c["at"])
        r = COLUMN_WIDTH / 2 * scale
        proposed = c["source"].startswith("proposed")
        d.ellipse([x - r, y - r, x + r, y + r], fill=None if proposed else (90, 80, 70), outline=(90, 80, 70), width=2)
    d.polygon([to(p) for p in penthouse], outline=(180, 60, 60), fill=(200, 90, 90, 40))
    f, fb, fs = P.font(17), P.font(28, True), P.font(15)
    dm, lv = plan["dimensions_m"], plan["levels_m"]
    d.text((pad, 20), f"Terra & Mar rebuild -- approved plan (option {plan['approved']['option']}, 2026-10-12)", fill=(25, 25, 25), font=fb)
    d.text((pad, 62), f"{dm['width']:.1f} m wide x {dm['depth']:.1f} m deep at the balcony edge (= podium = roof edge)  |  balcony 1.5 m all around  |  "
                      f"corners R {dm['corner_radius_other']} (front {dm['corner_radius_front']}), wall line R 0.25", fill=(60, 60, 60), font=f)
    d.text((pad, 86), f"levels: podium top {lv['podium_top']}, storey {lv['storey']} x {lv['residential_floors']}, roof slab {lv['roof_slab_bottom']}-{lv['roof_slab_top']}  |  "
                      f"penthouse 10.0 x 7.5 m, hidden from b8 up to {plan['layers']['penthouse']['hidden_from_b8_up_to_m']} m", fill=(60, 60, 60), font=f)
    # run labels with lengths, outside each run
    cen = np.mean(np.asarray(poly, dtype=float), axis=0)
    lens = plan["runs"]["lengths_at_balcony_edge_sharp_m"]
    for r, a, b in zip(RUNS, poly, poly[1:] + poly[:1]):
        mid = (np.asarray(a) + np.asarray(b)) / 2
        n = mid - cen
        n = n / np.linalg.norm(n)
        x, y = to(tuple(mid + n * 2.0))
        text = f"{r}  {lens[r]:.1f} m"
        d.text((x - 34, y - 10), text, fill=(25, 25, 25), font=f)
    x, y = to((0, -11.9))
    d.text((x - 52, y - 2), "entrance 6.9 m", fill=(60, 50, 40), font=fs)
    x, y = to((0, -8.6))
    d.text((x - 92, y), "flush centre loggia", fill=(60, 50, 40), font=fs)
    x, y = to((0, 2.6))
    d.text((x - 58, y), "penthouse (kept)", fill=(160, 50, 50), font=fs)
    d.text((pad, h - 34), "dark rectangles: front pilasters (b8: 0.83 m at +/-3.07) | filled circles: chamfer columns (b8) | open circles: proposed rear "
                          "columns | blue: roof guard line | grey: game podium | 2 m grid", fill=(90, 90, 90), font=P.font(14))
    im.save(os.path.join(P.OUT, "plan_approved.png"))


if __name__ == "__main__":
    main()
