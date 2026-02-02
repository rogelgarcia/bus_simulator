# Building v1 → v2 Conversion Specification

Status: **Proposed (draft)**  
Scope: **How to convert legacy “v1” building configs into a v2 model** (requirements, not implementation details)

Building v2 is the rendering/authoring target. Legacy building configs (v1) MUST be converted to v2 and rendered via the v2 engine.

---

## 1. Goals

The conversion MUST:

- Produce a valid Building v2 model from a Building v1 input.
- Preserve the visual intent of v1 as closely as possible at the original building dimensions.
- Produce a v2 model that behaves reasonably if the face length changes (pattern should carry where possible).
- Avoid “silent magic”: if v1 fields cannot be mapped meaningfully, surface a warning and use explicit v2 defaults.

---

## 2. v1 input assumptions (high level)

Building v1 (legacy) includes (conceptually):

- A global floors/floorHeight style of vertical definition.
- Face-level window placement defined by:
  - window type/catalog id,
  - window width/height/sill,
  - spacing between windows on the same face,
  - optional “space columns” with:
    - width,
    - material,
    - extrusion,
    - and an interval meaning “every X windows insert a column”.

The legacy behavior is documented in `specs/buildings/BUILDING_1_SPEC_legacy.md`.

---

## 3. v2 output requirements (high level)

Conversion output MUST:

- Produce a v2 layer stack (at minimum: 1 floor layer + 1 roof layer) derived from the v1 vertical definition.
- Produce a v2 per-face facade layout using bays/groups so that:
  - windows become bay content (openings),
  - columns become explicit column bays or column segments,
  - spacing is preserved via bay margins/padding.

---

## 4. Floors/layers mapping

- If v1 provides `floors` and `floorHeight`, conversion SHOULD create:
  - one **floor layer** with `floors = v1.floors` and `floorHeight = v1.floorHeight`,
  - one default **roof layer** (v2 defaults).
- If v1 has more complex vertical intent that cannot map cleanly:
  - create a minimal valid v2 layer stack,
  - warn that vertical layout was approximated.

---

## 5. Window spacing conversion (baseline)

To preserve v1 “spacing between windows” in a repeatable v2 bay layout:

- Create a `windowBay` item with `expandPreference = 'prefer_repeat'` and a window opening segment.
- Model spacing using margins on the window opening layout:
  - `marginLeft = 0.5 * legacySpacing`
  - `marginRight = 0.5 * legacySpacing`

This ensures:
- between adjacent repeated windows, `0.5 + 0.5 = 1.0 * legacySpacing`,
- at the face ends, there is a half-spacing margin (deterministic and symmetric).

Sizing guidance for faithful conversion:
- Prefer a fixed width (or min=preferred=max) for `windowBay` based on:
  - window width + legacy spacing, plus any required clearance rules.
- Use min/max limits intentionally:
  - if you want the solver to add more windows on longer faces, keep `max` bounded so bays can’t stretch indefinitely.

---

## 6. Space columns “every X windows” conversion

If v1 specifies “space columns every X windows”, conversion MUST express this as a repeatable v2 group pattern:

- Pattern: `[ windowBay repeated (min..max), columnBay ]`
- Default interval mapping:
  - `min = X`
  - `max = X` (exact match), or `max > X` if the conversion wants to allow resizing to distribute extra windows later.

Column bay spacing rule (to match v1’s “column width is added to spacing” intent):
- Keep `windowBay` margins at `0.5 * legacySpacing` on each side.
- Use **no margins** for `columnBay` openings/segments (spacing comes only from adjacent window bays).
  - This yields: `0.5*spacing + columnWidth + 0.5*spacing = spacing + columnWidth`.

Trailing column rule:
- The converted layout SHOULD avoid forcing a trailing column at the end of a face.
- If the pattern repeats as groups, ensure remainder handling allows a “tail” of window bays without requiring the final column.

---

## 7. Determinism + validation

Conversion MUST be deterministic and must validate the output:

- If the converted v2 layout cannot fit under its constraints, conversion MUST either:
  - relax conversion constraints in a documented fallback order, or
  - mark the result invalid with a surfaced error (preferred over silently producing broken geometry).
- Any approximations or dropped features MUST be surfaced as warnings.
