# Building Fabrication 2 — Testing and Evidence Specification

Status: **Current through AI 541**

## AI 541 acceptance matrix

Automated coverage is split by responsibility:

- model/path units: default-off normalization, ids, duplicate ownership,
  centered/asymmetric stations, meeting bias, deterministic sampling, endpoint
  tangency, and repeated source-bay adjacency;
- generator units/browser regression: positive/negative/mixed depth, wedge
  tangents, same-face/cross-face joins, material ownership, wall geometry,
  opening/frontage rejection, and catalog/export round trips;
- topology remap units: physical local-u reversal while preserving authored
  transition and boundary-depth settings;
- editor browser regression: controls, P0/J/P1 handles, live invalid state,
  Apply/Cancel, linked boundary depths, and outer undo/redo;
- existing balcony/face-link regression: explicit AI 537 interaction and
  physical controls on reversed face-linked slaves;
- visual capture: matched sharp/rounded catalog variants, front, three-quarter,
  top/plan, cross-face close-up, final showcase, editor handles, and invalid
  feedback.

Evidence is generated under
tests/artifacts/screens/ai541-bay-boundary-curvature/ and remains gitignored.
The 3D captures are 3840×2160 and use
ibl.hdri.german_town_street_2k as both visible background and reflection
environment. manifest.json records variants, camera inputs, viewport, and
HDRI settings.

Known unrelated core-suite failures must be reported separately; an AI 541
test failure may not be waived as baseline noise.
