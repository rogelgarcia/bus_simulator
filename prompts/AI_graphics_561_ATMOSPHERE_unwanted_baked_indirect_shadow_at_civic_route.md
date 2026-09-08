# Problem

The user reports an unwanted shadow at the BigCity2 pose below and attributes it to baked indirect illumination. Treat this as a separate static-world indirect-lighting defect, not a reproduction of the moving bus-roof patches or the bus reflection-toggle issue. The user explicitly could not reproduce the same roof issue at this pose. The responsible receiver, lighting channel and cause still need verification.

# Request

Reproduce and deterministically fix the unwanted baked-indirect darkening while preserving the accepted lighting engine, enhanced indirect coverage (AI 548), live sunlight, baked shadows and original material appearance.

Tasks:
- [ ] Capture the exact supplied camera and bus pose, without rounding transforms, changing the camera or allowing simulation drift. Record effective lighting settings, source/package hashes and active channel statuses. Establish which surface contains the unwanted shadow; do not assume it is on the bus.
- [ ] Compare world baked indirect On/Off with all other settings fixed. Independently isolate bus diffuse probes, dynamic AO, static AO, baked sun shadows and live sun shadows as diagnostic variants. Record requested versus applied state so a fallback cannot be mistaken for a successful comparison. Preserve legitimate indirect occlusion and direct shadows.
- [ ] Inspect receiver mapping, atlas boundaries/padding, coplanar continuity, normals, sky visibility, source/export geometry and composition only as evidence warrants. Distinguish physically plausible sheltering from an erroneous mapping, interpolation or duplicate-lighting contribution. Do not assume increasing bake samples, changing exposure or editing topology will fix it.
- [ ] Add a deterministic regression that fails before the fix and demonstrates the identified cause. Apply a general correction at the responsible layer; avoid coordinate-specific brightness patches, disabling accepted baked indirect or hiding the artifact with AO/material changes. Check nearby surfaces and previously repaired sidewalk/facade cases.
- [ ] If new bake data is necessary, use the registered `node tools/bake.mjs` hierarchy and shared ignored Blender configuration; preserve validation/publication gates. Retain the installed baseline before regeneration and document whether existing packages remain valid.
- [ ] Save matched before/after and isolated-channel screenshots, resolved pose/settings, diagnostics and a brief research log under `tests/artifacts/screens/ai561_indirect_shadow/` (gitignored). Update the relevant illumination/receiver specification with the cause, fix and limitations. Report any unresolved ambiguity explicitly.

## Exact user-supplied pose

This pose identifies a separate unwanted-shadow report; it is not evidence that the original roof patches reproduce here.

```json
{
  "version": 1,
  "city": "bigcity2",
  "bus": {
    "modelId": "city",
    "transform": {
      "position": {
        "x": -170.06046435546867,
        "y": 1.7035786161894098,
        "z": 41.80680383300781
      },
      "quaternion": {
        "x": 0,
        "y": -0.7118414060762392,
        "z": 0,
        "w": 0.7023402399089794
      }
    }
  },
  "camera": {
    "position": {
      "x": -151.42626352426936,
      "y": 9.29357861623858,
      "z": 42.0571897102936
    },
    "quaternion": {
      "x": -0.11871787923611625,
      "y": 0.6925040970479305,
      "z": 0.11713339585386913,
      "w": 0.7018717178354248
    },
    "fovDeg": 55,
    "locked": true
  },
  "simulation": {
    "paused": true
  }
}
```

## On completion

- Mark this document DONE in the first line and add a high-level one-line summary per completed change, with validation evidence and remaining limitations.
- Rename to `prompts/AI_DONE_graphics_561_ATMOSPHERE_unwanted_baked_indirect_shadow_at_civic_route_DONE.md`; do not archive automatically.
- If the fix changes runtime cost, include comparable measured before/after frame time, FPS and relevant workload metrics with hardware, viewport, settings, pose, warm-up, sample count and statistic. Mark unavailable metrics as not measured with a reason.
