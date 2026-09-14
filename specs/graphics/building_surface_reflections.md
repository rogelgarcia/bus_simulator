# Opaque building environment reflections

The Buildings options tab has an **Opaque building reflections**
toggle, on by default. It enables the existing global environment response on
opaque Standard/Physical building materials that explicitly suppress automatic
IBL. Window groups, glass, transmission materials and authored reflection materials
are excluded. It does not change color, maps, roughness, metalness, normal strength,
material AO, exposure or baked illumination settings.

The preference lives at `buildingWindowVisuals.surfaces.reflections` in the
existing version-1 building visuals bucket. Missing preferences, including old
window-only preferences, resolve to on. Explicit saved off remains off.
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
This is a material response correction, not a declaration that indirect transport
now matches Cycles. No new environment texture, local cubemap or render target
is allocated by this toggle.

Regression evidence: registered `building-review-capture` performs identical-pose
A/B captures with repeated, uniquely matched GPU queries in fresh browsers.
`building_surface_reflections.pwtest.js` exercises the actual Options events and
checks uninterrupted baked activation, material preservation and persistence.

The fixed v7-bake material matrix on poses 02/03 identified suppressed environment
specular as the larger mismatch: shaded brick brightness bias changed from -40.4%
to -24.7%, and dark stone from -44.7% to -4.5%. These are local linearized-display
luminance differences against Cycles, not isolated irradiance percentages.
Material texture AO is retained: the current Cycles export omits those maps, so
disabling them to minimize image error would remove authored micro-occlusion.
Registered `material-response-capture` and `material-response-analysis` preserve
the factorial study, fixed masks, all-five-pose validation and repeated GPU data.

AI568 additionally identified a reference-material mismatch. The source-texture
Cycles export omits the game's procedural wall wear, color and roughness changes,
as well as texture AO. Controlled source-material captures disable those inputs
only during isolated raw diagnostic renders and restore them before resuming.
Production appearance retains them. An original/Cycles beauty difference is
therefore not itself a remaining irradiance error. Export and comparison metadata
must state that distinction; do not compensate it with stronger global lighting.

The resolved reference now evaluates the native opaque procedural materials in
camera-independent atlases. Physical Cycles retains geometric visibility without
the extra authored texture AO. A separately labeled wall-only artistic control
uses that same AO policy on indirect lobes; it must not be called the physical
reference. All five poses and an independent close-up validate the export.

The isolated dielectric fixture also demonstrates differences between native
Schlick/DFG/PMREM response and Cycles' exact Fresnel/path integration. White and
HDR source checks distinguish these from weak sunlight, lost bake energy or
missing local city reflections. Do not introduce a global gain to compensate:
the discrepancy varies with roughness and viewing angle and can change sign.
No change to the native BRDF or extra runtime reflection allocation is part of
this correction. See AI568 for quantified residuals and performance limits.
