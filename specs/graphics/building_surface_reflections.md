# Opaque building environment reflections

The Buildings options tab has an experimental **Opaque building reflections**
toggle, off by default. It enables the existing global environment response on
opaque Standard/Physical building materials that explicitly suppress automatic
IBL. Window groups, glass, transmission materials and authored reflection materials
are excluded. It does not change color, maps, roughness, metalness, normal strength,
material AO, exposure or baked illumination settings.

The preference lives at `buildingWindowVisuals.surfaces.reflections` in the
existing version-1 building visuals bucket. Old preferences resolve to off.
Save, Cancel, Reset, preset import/export and Use defaults retain their normal
semantics. Global IBL intensity changes update enabled surfaces; a disabled
surface restores its original intensity, including repeated toggles.

The implementation keeps material identity and shader variants stable. It changes
only `envMapIntensity`, a runtime reflection uniform excluded from diffuse bake
source semantics. Calibrated diffuse IBL remains independently controlled by the
existing calibrated shader, and applied receiver irradiance remains unchanged.
In uncalibrated native PBR, the native environment intensity also affects diffuse
IBL; parity conclusions apply to calibrated lighting only.

Global environment reflections have no local specular occlusion or parallax.
This is an optional comparison feature, not a declaration that indirect transport
now matches Cycles. No new environment texture, local cubemap or render target
is allocated by this toggle.

Regression evidence: registered `building-review-capture` performs identical-pose
A/B captures with repeated, uniquely matched GPU queries in fresh browsers.
`building_surface_reflections.pwtest.js` exercises the actual Options events and
checks uninterrupted baked activation, material preservation and persistence.
