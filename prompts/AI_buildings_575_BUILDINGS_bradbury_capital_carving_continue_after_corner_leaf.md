# AI 575: the Bradbury capital's carving — continue from the finished corner leaf

# Problem

The Bradbury Block's pilaster capital, a terracotta Corinthian-style capital, is being carved in 3D from a reference
photo: `tests/artifacts/screens/bradbury_fix/references/capital_ref.png` (1536 x 1024, a true front elevation). Its
decoration is:
- acanthus corner leaves whose tips roll over into scrolls;
- volutes over them;
- C-scrolls, with beads and balls down the middle;
- inner acanthus leaves;
- a fleuron on the abacus;
- a hanging pendant.

The production capital (`ornaments/capital.py` -> `capital.blend`, mesh `capital`, linked about 80 times by the
portal and every column and springing capital) must stay untouched. The carving is developed in an editing copy
that nothing links: `ornaments/capital_edit.py` -> `capital_edit.blend`. It moves into `capital.py` only when the
user approves.

Done so far, over many iterations steered by the user's annotated screenshots:
- The blank capital, at the photo's levels. Height decision "50% 50%": `VSCALE` 0.898, so the capital is 0.463 m and
  the bell 0.356 m.
- A line trace of the photo (`capital_drawing.svg`).
- A leaf toolkit (`carving.py` plus `make_leaf` in the editing copy).
- The seven-point leaf, flat beside the capital (`FLAT_X` 1.5). It is the model for the inner leaves.
- The corner leaf, finished to the user's satisfaction:
  - It is wrapped round the bell's right front corner.
  - Its top leaflet is rolled into a scroll whose eye is filled by a knob merged into the leaf, hidden behind the
    leaf's own curled-in edges.
  - A flat copy of its pattern stands beside the seven-point leaf.
- Nothing else is carved yet.
- Nothing is committed. `capital_edit.py`, `carving.py`, `capital_drawing.svg` and `overlay_drawing.py` are
  untracked; the BradburyBlock `README.md` is modified.

Paths below are relative to `src/graphics/content3d/buildings/authoring/BradburyBlock/` unless they start with
`tests/` or `prompts/`.

## Current state: how things are built

- **Blank** (`blank`, `bell_outline`): the neck (cove, fillet, torus), the bell and the abacus.
  - The bell is lofted between `BELL_K` = 14 rings of `bell_outline(t)`. Its faces are concave. It flares from the
    pilaster footprint (`W` 0.725 x `D` 0.85) to `BELL_TOP_HALF` 0.455.
  - Each corner is cut at 45 degrees, the cut growing as t**2. The cut's midline stays in the diagonal plane
    through the pilaster's corner (`CORNER_U`; directions `CN` out of the corner and `CU` across it).
  - `BELL` is a BVH of the bell alone.
- **Leaves** (`make_leaf`, over `carving.grow_leaf` and `carving.leaf_solid`), in a flat frame: s across (0 = the
  midrib), t up from the foot, w out of the face.
  - Spines: `curl_vein`, a natural spiral whose tangent angle grows as length**2.5 (the user chose curl 2.5).
  - Leaflets are grown round the spines and fused by a tight smooth union (0.8 mm). Webs (`web_polygon`, `sinus`)
    join neighbouring leaflets down to set notch bottoms, with the notch bottoms rounded (`web_soft` 3 mm).
  - `foot` gives a trumpet flare, or a straight stem when both half-widths are equal.
  - The body is a somewhat flat plate, not contoured round its veins (the user's rule), 5 mm thick (6.5 mm at the
    foot) times `depth`, rounded over its last 3.5 mm.
  - Veins are fine incised V lines, 1.6 mm wide and 1 mm deep (the user: "the vein is too thick"). `vein_stop`
    sets where each starts; only the main vein reaches the foot.
  - Options: `taper(s, t)`, `back_vein` (a vein cut into the back, where the back shows), `back_extra`, and `cut`
    (the outline trimmed flat at a height).
  - The mesh is line-conforming: every drawn line is a chain of edges with its own section.
- **Corner leaf** (the `CORNER_*` constants):
  - Five leaflets: a pointed top leaflet 65 mm wide, and two side points each side, turned up. Joined by webs, on a
    straight 75 mm stem. Flat it is 0.128 m wide and 0.327 m tall.
  - Its parameters were fitted to the user's drawn outlines, in steps: the first outline, then "twice as large"
    (wider), then "make the leaflets connect more", then "the silhouette is more squeezed". Earlier versions'
    renders and the user's notes are in the screens folder, `corner_v1/` to `corner_v6/`.
  - Depth: `CORNER_DEPTH` 3, a 15 mm plate ("make this decoration 3x deeper").
- **Wrap** (`corner_surface`, `corner_place`): the flat frame is laid on the bell.
  - s becomes arc length round the bell's plan outline, measured from the corner cut's midline.
  - t becomes arc length up that midline.
  - w goes along the surface normal.
  - The outline's corners are rounded 4 mm (`WRAP_ROUND`), so the leaf bends round the arris instead of creasing.
- **Scroll** (`lobe_split`, `roll_curve`, `corner_place_rolled`). Only the top leaflet rolls; the side points stay on
  the bell. It rolls from the notch above the side points (`ROLL_T0`, about 0.218).
  - The midrib rises `ROLL_STRAIGHT`, then spirals about 420 degrees round a centre 16.3 mm up and 28.9 mm out, its
    radius shrinking from 29 mm to 6 mm. This centre and size were fitted to the user's drawn loop on the profile
    view.
  - Each section turns with the midrib and relaxes from the wrap's V to flat over `ROLL_FLAT`; kept rigid it looked
    like a tulip.
  - The rolled part is stretched about 1.9x along its length for the material ("expand the material"). It is
    trimmed blunt at `CORNER_CUT` 0.30 so no point is left in the eye.
  - Its edges coil in to 12% of the midrib's radius (`ROLL_DOME` 0.88). The scroll's sides are whorls sloping into
    the eye, and from the front it is a rounded dome ("make it more rounded when seen from the front", then "the
    edges should come inside").
  - Each strip's thickness is capped by its own coiled radius (`corner_fill_taper`), and the inner end aims its
    thickness at the spiral's centre.
  - The main vein is cut into the scroll's outside (`back_vein`).
- **Eye** (`fill_eye`): an ellipsoid knob, `EYE_R` 16 mm round and `EYE_HALF` 27 mm along the roll's axis.
  - It is united with the leaf by an exact boolean (`use_self`); a separate object was rejected: "no ball".
  - Only the vertices near both surfaces (`EYE_BLEND` 4 mm) are smoothed.
  - It stays inside the curled edges: it must not show from the front ("this ball should not be visible from the
    front").
  - Checked: no non-manifold, open or degenerate faces round the eye, and no ray along the roll's axis gets through.
- **Renders**: `capital_edit.py -- corner` (about 5 min) renders the corner views into
  `tests/artifacts/screens/bradbury_fix/portal_project/ornaments/`.
  - Views: `CornerFront`, `CornerDiagonal`, `CornerQuarter`, `CornerProfile` (along the corner, the scroll's
    side), `CornerLow`, `CornerLeafFront`, `CornerFlatFront`.
  - `-- flat` renders the seven-point leaf, `-- none` builds and saves without rendering, and no argument renders
    everything.
  - Everything is Cycles with the plain clay material `EDIT_terracotta`. Wire proofs are Workbench.

## How the user works (important)

- The user steers with annotated screenshots: red or green strokes drawn over our renders. Read those strokes
  precisely.
  - Images sent with a message arrive in the session's images folder; images sent mid-turn often do not, so read
    those by eye.
  - Match an image to the render it was drawn on by its silhouette against the background (search scale and
    offset). If a close crop shows no background, use normalized cross-correlation on a patch with a unique
    horizontal feature, such as the torus edge; a long stem alone matches at the wrong zoom.
  - Then map the strokes into leaf or world coordinates, and fit.
- Their drawings drift: the hand sits about 5 mm off the midrib, and the halves differ by 3–4 mm. Fold a drawing on
  its own axis before fitting.
- Vocabulary (Portuguese senses):
  - "larger" means wider (largo);
  - "afunilate" means to taper like a funnel;
  - "veil" means vein.
  - Say your reading in the reply, so a wrong guess is caught at once.
- They want to see each intermediate step: a new element flat first, then placed or wrapped. Do the step asked for,
  not the next one.
- Show [their notes or the reference | before | after] composites at one scale.
- Style rules they have set:
  - curves from natural formulas;
  - pointed tips;
  - hairline veins;
  - flat plates, not contoured round the veins;
  - no procedural noise;
  - fills blended into the leaf, never separate objects.

## Methods and gotchas that worked

- **Fitting a drawn outline:** run a pattern search over `make_leaf`'s parameters (including the sinus points) on a
  two-way nearest-distance metric, with a penalty on inward kinks of the stem's edge; about 2.5 mm total is the
  drawings' own noise. For a width change, refit to the stretched outline rather than stretching the leaf, but keep
  the top leaflet's proportions (a fitted blunt tip turns into a bulb).
- **Thick leaves in tight curls:**
  - Cap the thickness below the local radius.
  - Aim the thickness at the spiral's centre; a tightening spiral's normals miss it by up to 25 degrees.
  - Never let the leaf pass through itself: the exact boolean then leaves non-manifold pinches.
- **Unions in a bpy script:**
  - Call `view_layer.update()` before `new_from_object`, or it returns the unmodified mesh.
  - Smooth only the join band; Laplacian smoothing of a whole knob shrinks it and reopens the gap.
  - A filler that grazes thin edges leaves pinches; make it cross them at an angle, or stay inside them.
- **Probes that settled arguments:**
  - a ray grid along the roll's axis through the eye (see-through gaps);
  - a bmesh check for non-manifold, boundary and degenerate faces near the eye;
  - silhouette matching of the user's images.
- **Wire proofs:** the Wireframe modifier's even thickness spikes at sharp leaflet points; keep it off.

## File references

- `ornaments/capital_edit.py` — the editing copy: blank, leaves, wrap, scroll, eye, cameras and renders. The
  module docstring and the comment above each section record the user's requests verbatim.
- `ornaments/carving.py` — the kit:
  - the SVG reader;
  - `curl_vein`, `spine_track`, `soft_max`, `contour_loops`;
  - `grow_leaf` (`webs`, `web_soft`, `foot`, `top`), `polygon_field`, `web_polygon`;
  - `_line_mesh`, `_line_height`, `relief_patch`, `leaf_solid` (`lift`), `bpy_mesh_from`.
- `ornaments/capital_drawing.svg` — the trace of the photo in photo pixels (right half). The elements still to build
  are there, by label:
  - `leaf2`, `leaf3`, `leaf4` (the inner leaves);
  - `volute`;
  - `cscroll`;
  - `medallion`;
  - `fleuron` (three paths);
  - `pendant`.
  - Also `leaf1` and `leaf1tip`: the corner leaf and its turnover, now superseded by the model.
- `ornaments/overlay_drawing.py` — draws the trace over the photo, as a check.
- `ornaments/capital.py` — the production capital. Do not change it until the user approves the promotion.
- `portal_lib.py` — helpers: `camera`, `render`, `setup_scene`, `mesh_from_bm`, `mat_plain`, `ensure_collection`,
  `sweep`, `CAPITAL_DEPTH`.
- `README.md`, section "The capital's carving" — the full record of the corner leaf's steps and choices.
- `tests/artifacts/screens/bradbury_fix/references/capital_ref.png` — the reference photo.
- `tests/artifacts/screens/bradbury_fix/portal_project/ornaments/` — renders:
  - `capital_edit_corner_*.png`, including the compare and sheet composites;
  - `corner_v1/` to `corner_v6/`: earlier versions and the user's annotated notes, including
    `user_notes_scroll.webp`, `user_notes_scroll_front.webp`, `user_notes_eye.png`, `14.png` and `15.png`.
- `tests/artifacts/blender/bradbury/portal_project/ornaments/capital_edit.blend` — the saved build.
- If present, the Claude memory notes `capital-carving-editing-copy.md` and `user-shape-vocabulary.md` repeat the
  key decisions.

# Request

Continue the capital's carving from the finished corner leaf, one element at a time, with the user steering each step.

Tasks:
- Rebuild the editing copy headless and show the current corner leaf: the sheet and the eye close-up. This confirms
  the handoff reproduces the user's accepted state before anything changes.
- Ask which element comes next. The agreed order is:
  1. the volute over the corner leaf;
  2. the C-scrolls, with the beads and balls;
  3. the inner leaves (`leaf2`–`leaf4`, starting from the seven-point leaf model);
  4. the fleuron and the pendant.
  Build each one flat first and show it, then place or wrap it on the capital. Iterate on the user's annotated
  screenshots until they accept it.
- Keep the corner leaf as accepted unless the user asks for changes. When the front is assembled, mirror it to the
  left front corner.
- Check the assembled front against the photo: the pixel-aligned `EditFront` render and the trace overlay.
- Promote the carving into `capital.py` only when the user approves. Promotion needs the portal to take 0.053 m more
  capital height: ask the user how (a shorter shaft, or everything above rises) before changing any height.
- Constraints:
  - Build headless: `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P
    <capital_edit.py> -- corner`. AGENTS.md prefers headed Blender through MCP when it is free, but the user's
    headed session may hold `bradbury_portal.blend`; do not touch it.
  - Write outputs under `tests/artifacts/...` only.
  - Keep the README's capital section current.
  - Do not commit unless the user asks.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to `prompts/AI_DONE_buildings_575_BUILDINGS_bradbury_capital_carving_continue_after_corner_leaf_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
