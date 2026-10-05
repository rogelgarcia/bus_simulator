# LOD0 catalog integration verification

The installed package passes all asset integrity checks and retains every
geometry accessor byte from AI591. Leaf-light tests verify zero-factor versus
0.17-factor backlighting, both faces and an occluding shadow caster.

During first Inspector captures, zero shadow bias produced narrow self-shadow
bands on the large flat inner cards and bark. The hypothesis was shadow acne,
not damaged PBR data. A local comparison disabled receiving shadows, then
restored them with a small depth/normal bias. Disabling reception removed the
bands, and biased receiving shadows retained canopy shading without the bands.
The minimal Inspector fix adds -0.0001 depth bias and 0.025 m normal bias.
Expected verification is a smooth bark/card surface with cast canopy shadows
still present. This affects only the Inspector's light, not game-world lighting.
Comparisons are under `tests/artifacts/screens/ai592_lod0_catalog/debug_*.png`.

The initial browser assertions also expected the old PNG loader's empty color
space tag for normal/ORM maps. KTX2 correctly supplies `srgb-linear`; the tests
now check this linear tag and sRGB only for base color.

Final captures use the game's environment lighting. All 15 forms are loaded
through their actual catalog entries, including semantic/solid mode switching.
Geometry counts, shared compressed canopy textures, distinct baked wood maps,
physical dimensions and shader compilation are checked for every form.
This is a loading/rendering check, not a benchmark of city-scale placement.
