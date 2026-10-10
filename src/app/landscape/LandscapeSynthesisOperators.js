// Declares the typed operator, selector and layer catalogs of the landscape terrain synthesis recipe (AI 596).
// @ts-check
// Every operator parameter is declared once here with its type, unit, range and default, so the recipe boundary can reject unknown or
// out-of-range values and the executor resolves defaults from the same table. Parameters are the user's fine-tuning surface: edge
// profiles are expressed in engineering terms (rim width, face slope in degrees, talus slope, drop, blend), roads in grade percent and
// cut/fill slopes, and every length in meters. A null default marks an optional parameter. Layers name the full-grid arrays operators
// read and write, so the recipe validator can check the data flow before anything runs.

const number = (unit, description, options = {}) => Object.freeze({ type: 'number', unit, description, ...options });
const integer = (unit, description, options = {}) => Object.freeze({ type: 'integer', unit, description, ...options });
const string = (description, options = {}) => Object.freeze({ type: 'string', unit: 'none', description, ...options });
const boolean = (description, options = {}) => Object.freeze({ type: 'boolean', unit: 'none', description, ...options });
const enumeration = (description, values, options = {}) => Object.freeze({ type: 'enum', unit: 'none', description, values: Object.freeze(values), ...options });
const point = (description, options = {}) => Object.freeze({ type: 'point', unit: 'meters', description, ...options });
const polygon = (description, options = {}) => Object.freeze({ type: 'polygon', unit: 'meters', description, ...options });
const numbers = (unit, description, { items = {}, ...options } = {}) => Object.freeze({ type: 'array', unit, description, items: Object.freeze({ type: 'number', ...items }), ...options });
const freezePoints = points => Object.freeze(points.map(entry => Object.freeze(entry)));

export const LANDSCAPE_SYNTHESIS_FAMILIES = Object.freeze(['inputs', 'landforms', 'warps', 'erosion', 'geology', 'coastal', 'constraints', 'output']);

/** Layers an operator may read or write; transient masks are created and released inside operators. */
export const LANDSCAPE_SYNTHESIS_LAYERS = Object.freeze({
    height: Object.freeze({ type: 'float32', unit: 'meters', description: 'Absolute terrain height (world Y) on the working grid' }),
    cover: Object.freeze({ type: 'uint8', unit: 'id', description: 'Land-cover class of the aligned source sample' }),
    districtId: Object.freeze({ type: 'uint8', unit: 'id', description: 'Plan district id of the sample (0 outside every district)' }),
    landMask: Object.freeze({ type: 'float32', unit: 'dimensionless', description: '1 on the land side of the design shoreline, 0 on the sea side' }),
    roadDistance: Object.freeze({ type: 'float32', unit: 'meters', description: 'Euclidean distance to the nearest plan road centerline' }),
    roadHeight: Object.freeze({ type: 'float32', unit: 'meters', description: 'Design or constrained height of the nearest road centerline point' }),
    roadWidth: Object.freeze({ type: 'float32', unit: 'meters', description: 'Carriageway width of the nearest plan road' }),
    roadIndex: Object.freeze({ type: 'float32', unit: 'id', description: 'Index of the nearest road in the plan road list' }),
    shoreSigned: Object.freeze({ type: 'float32', unit: 'meters', description: 'Signed distance to the design shoreline, land positive' }),
    corridorMask: Object.freeze({ type: 'float32', unit: 'dimensionless', description: '1 inside the open-view corridor polygon' }),
    runwayMask: Object.freeze({ type: 'float32', unit: 'dimensionless', description: '1 inside the runway polygon' }),
    bedrock: Object.freeze({ type: 'float32', unit: 'meters', description: 'Bedrock surface (absolute world Y): height - regolith - depositThickness, never above the height' }),
    regolith: Object.freeze({ type: 'float32', unit: 'meters', description: 'Weathered in-place mantle thickness, 0..8' }),
    depositType: Object.freeze({ type: 'uint8', unit: 'id', description: 'Dominant loose deposit at the surface: 0 none, 1 talus, 2 colluvium, 3 alluvium, 4 beach sand, 5 dune sand, 6 reef rock' }),
    depositThickness: Object.freeze({ type: 'float32', unit: 'meters', description: 'Thickness of the dominant loose deposit, 0..30' }),
    lithology: Object.freeze({ type: 'uint8', unit: 'id', description: 'Index of the stratum the bedrock surface lies in (0 unstratified)' }),
    wear: Object.freeze({ type: 'float32', unit: 'meters', description: 'Cumulative fluvial and hydraulic erosion depth in meters until geology-channels normalizes it to 0..1' }),
    deposition: Object.freeze({ type: 'float32', unit: 'meters', description: 'Cumulative sediment deposition depth in meters until geology-channels normalizes it to 0..1' }),
    flow: Object.freeze({ type: 'float32', unit: 'dimensionless', description: 'Normalized ln(A / spacing) of the surface (terrain-fields convention), 0..1' }),
    drainage: Object.freeze({ type: 'uint8', unit: 'id', description: 'Drainage class: 0 hillslope, 1 rill, 2 gully, 3 channel, 4 flat/pond, 5 sea' }),
    faceMask: Object.freeze({ type: 'float32', unit: 'dimensionless', description: 'Slope beyond what the heightfield represents faithfully (smoothstep between the face start and full slopes), 0..1' }),
    coastalZone: Object.freeze({ type: 'uint8', unit: 'id', description: 'Coastal zone class: 0 inland, 1 offshore, 2 reef, 3 bar, 4 surf, 5 swash, 6 berm, 7 backshore, 8 foredune, 9 platform, 10 bluff toe, 11 bluff face, 12 bluff crown' }),
    waveExposure: Object.freeze({ type: 'float32', unit: 'dimensionless', description: 'Exposure of the shore to the open-sea fetch (headlands 1, sheltered coves 0), 0..1' }),
    hardness: Object.freeze({ type: 'float32', unit: 'dimensionless', description: 'Hardness of the stratum at the rock surface, 0..1 (1 hardest; 0.5 where nothing stratified the rock), written by strata and read by erosion' }),
    apronMask: Object.freeze({ type: 'float32', unit: 'dimensionless', description: '1 inside the airport apron polygon' })
});

/** Selector (mask) types; every selector accepts `invert` and the combinators nest other selectors. */
export const LANDSCAPE_SYNTHESIS_SELECTORS = Object.freeze({
    all: Object.freeze({ description: 'The whole grid', requires: Object.freeze([]), parameters: Object.freeze({}) }),
    slope: Object.freeze({ description: 'Smoothstep of the local slope between edge.from and edge.to degrees', requires: Object.freeze(['height']),
        parameters: Object.freeze({ edge: Object.freeze({ type: 'edge', unit: 'degrees', required: true }) }) }),
    curvature: Object.freeze({ description: 'Smoothstep of the convexity (negative Laplacian of the height smoothed over scaleMeters, 1/m)', requires: Object.freeze(['height']),
        parameters: Object.freeze({ edge: Object.freeze({ type: 'edge', unit: 'per-meter', required: true }), scaleMeters: number('meters', 'Gaussian smoothing scale before the Laplacian', { default: 0, min: 0, max: 2000 }) }) }),
    height: Object.freeze({ description: 'Smoothstep of the absolute height between edge.from and edge.to meters', requires: Object.freeze(['height']),
        parameters: Object.freeze({ edge: Object.freeze({ type: 'edge', unit: 'meters', required: true }) }) }),
    flow: Object.freeze({ description: 'Smoothstep of log10 of the contributing area (square meters) of the current surface', requires: Object.freeze(['height']),
        parameters: Object.freeze({ edge: Object.freeze({ type: 'edge', unit: 'log10-square-meters', required: true }) }) }),
    distance: Object.freeze({ description: 'Smoothstep of the distance to the nearest plan road (unsigned) or to the design shoreline (signed, land positive)', requires: Object.freeze([]),
        parameters: Object.freeze({ feature: enumeration('Plan feature measured', ['road', 'shoreline'], { required: true }), edge: Object.freeze({ type: 'edge', unit: 'meters', required: true }) }) }),
    cover: Object.freeze({ description: '1 where the land-cover class is one of the listed ids', requires: Object.freeze(['cover']),
        parameters: Object.freeze({ classes: Object.freeze({ type: 'array', unit: 'id', items: Object.freeze({ type: 'integer', min: 0, max: 255 }), minItems: 1, maxItems: 256, required: true, description: 'Land-cover ids selected' }) }) }),
    polygon: Object.freeze({ description: '1 inside the polygon, or a smoothstep of the signed distance (positive inside) when an edge is given', requires: Object.freeze([]),
        parameters: Object.freeze({ polygon: polygon('World XZ polygon', { required: true }), edge: Object.freeze({ type: 'edge', unit: 'meters', default: null }) }) }),
    district: Object.freeze({ description: '1 inside the listed plan districts, or a smoothstep of the signed distance to their union boundary when an edge is given', requires: Object.freeze(['districtId']),
        parameters: Object.freeze({ ids: Object.freeze({ type: 'array', unit: 'id', items: Object.freeze({ type: 'integer', min: 1, max: 255 }), minItems: 1, maxItems: 255, required: true, description: 'District ids selected' }),
            edge: Object.freeze({ type: 'edge', unit: 'meters', default: null }) }) }),
    min: Object.freeze({ description: 'Minimum of the nested selectors', requires: Object.freeze([]), parameters: Object.freeze({}), combinator: true }),
    max: Object.freeze({ description: 'Maximum of the nested selectors', requires: Object.freeze([]), parameters: Object.freeze({}), combinator: true }),
    multiply: Object.freeze({ description: 'Product of the nested selectors', requires: Object.freeze([]), parameters: Object.freeze({}), combinator: true })
});

const IMPORT_COMBINATION = Object.freeze({
    importId: string('Id of the entry in recipe.inputs.imports that names the file, kind and encoding', { required: true, format: 'id' }),
    target: string('Float layer the map combines into: height, or a geology layer (bedrock, regolith, depositThickness, hardness, wear, deposition, flow, faceMask, waveExposure); categorical layers are rejected; replace without a mask creates a missing layer', { default: 'height', format: 'id' }),
    mode: enumeration('replace sets the map value; add sums it; multiply scales the layer by it; max and min keep the higher or lower of layer and map', ['replace', 'add', 'multiply', 'max', 'min'], { default: 'replace' }),
    scale: number('dimensionless', 'Factor applied to the decoded map values (meters for heights, 0..1 for masks) before combining', { default: 1, min: -1e6, max: 1e6 }),
    offset: number('meters', 'Added to the scaled map values before combining (meters for height layers, dimensionless for 0..1 layers)', { default: 0, min: -1e6, max: 1e6 })
});

/** Override types evaluated after the operator loop in document order; every override carries an id, a type and a mask (null = whole grid where allowed). */
export const LANDSCAPE_SYNTHESIS_OVERRIDES = Object.freeze({
    import: Object.freeze({ description: 'Combines a declared interchange map into a float layer under the mask (the import-map operator as data: an imported map replaces or combines a stage output)', maskRequired: false, parameters: IMPORT_COMBINATION }),
    region: Object.freeze({ description: 'Sets, raises or lowers the height inside the mask (the selector edges give the smoothstep transition)', maskRequired: true,
        parameters: Object.freeze({ height: Object.freeze({ type: 'object', unit: 'meters', description: 'set replaces the height with meters, raise adds meters, lower subtracts meters', required: true,
            fields: Object.freeze({ mode: enumeration('Height change mode', ['set', 'raise', 'lower'], { required: true }), meters: number('meters', 'Target height (set) or change (raise, lower)', { required: true, min: -10000, max: 10000 }) }) }) }) }),
    operator: Object.freeze({ description: 'Re-runs an enabled recipe operator (landform, warp, erosion, geology, coastal or constraint family) on the current state with these parameters replacing its own, inside the mask (multiplied with the operator mask when both exist)', maskRequired: false,
        parameters: Object.freeze({ operatorId: string('Id of the enabled recipe operator re-run', { required: true, format: 'id' }),
            params: Object.freeze({ type: 'object', unit: 'none', description: 'Partial parameter set, validated against the operator catalog after merging over the operator parameters', required: true, fields: null }) }) }),
    exclude: Object.freeze({ description: 'Protects the mask: every layer another override changes is restored to its pre-override state there (float layers blend by the mask, categorical layers restore where the mask exceeds 0.5)', maskRequired: true, parameters: Object.freeze({}) })
});

// shared by every operator that builds a designed edge outward from a polygon boundary
const EDGE_PROFILE_PARAMETERS = Object.freeze({
    profile: enumeration('Designed edge outward from the boundary: escarpment (rim, rock face, talus apron), embankment (one engineered slope), retaining (near-vertical, limited by maxHeightfieldSlopeDegrees), ramp (linear over rampLengthMeters), feather (v2 smoothstep over featherMeters)',
        ['escarpment', 'embankment', 'retaining', 'ramp', 'feather'], { default: 'escarpment' }),
    rimWidthMeters: number('meters', 'Escarpment: flat rim band outside the boundary before the face', { default: 12, min: 0, max: 500 }),
    faceSlopeDegrees: number('degrees', 'Escarpment: rock face slope', { default: 60, min: 10, max: 89 }),
    faceDropMeters: number('meters', 'Escarpment: height of the rock face; 0 continues the face down to the base level', { default: 20, min: 0, max: 500 }),
    talusSlopeDegrees: number('degrees', 'Escarpment: talus apron slope below the face', { default: 32, min: 1, max: 60 }),
    slopeDegrees: number('degrees', 'Embankment: engineered slope', { default: 26.6, min: 1, max: 89 }),
    maxHeightfieldSlopeDegrees: number('degrees', 'Retaining: steepest slope a heightfield may hold', { default: 75, min: 45, max: 89 }),
    rampLengthMeters: number('meters', 'Ramp: horizontal length of the linear descent to the base level', { default: 60, min: 1, max: 2000 }),
    featherMeters: number('meters', 'Feather: smoothstep width of the v2-style blend', { default: 150, min: 1, max: 2000 }),
    baseMode: enumeration('Where the profile meets the ground, measured outward along the boundary normal on the ground before the operator: daylight marches the descent until it meets the ground; probe takes the ground at baseProbeMeters and cuts everything above it down to that base until the probe distance (removes an old feather; use with combine replace); extrapolate continues the ground slope measured beyond baseProbeMeters back under the old feather and daylights the descent against that line (removes a feather without a bench); sample-ground uses the ground under each sample; explicit uses baseHeightMeters',
        ['daylight', 'probe', 'extrapolate', 'sample-ground', 'explicit'], { default: 'daylight' }),
    daylightReachMeters: number('meters', 'daylight and extrapolate: farthest distance the descent is followed; a run that never meets the ground ends there and is counted', { default: 400, min: 1, max: 5000 }),
    baseProbeMeters: number('meters', 'probe and extrapolate: distance outward from the boundary where the base ground is read (the v2 feather width)', { default: 150, min: 1, max: 5000 }),
    extrapolationMeters: number('meters', 'extrapolate: span beyond baseProbeMeters over which the natural ground slope is measured', { default: 60, min: 1, max: 2000 }),
    baseHeightMeters: number('meters', 'explicit: base level the profile descends to', { default: null, min: -1000, max: 1000 }),
    blendMeters: number('meters', 'Horizontal width of the smooth toe where the profile meets the ground', { default: 40, min: 0, max: 500 }),
    combine: enumeration('Outside the boundary: max fills the profile over the ground (smooth toe), replace cuts and fills inside the profile run, blend feathers the replaced run into the ground over blendMeters', ['max', 'replace', 'blend'], { default: 'max' })
});

const NOISE_OCTAVES = Object.freeze({
    wavelengthsMeters: numbers('meters', 'Octave wavelengths, strictly decreasing', { minItems: 1, maxItems: 16, items: Object.freeze({ min: .5, max: 100000 }), default: Object.freeze([900, 450, 225, 112, 56]) }),
    amplitudes: numbers('dimensionless', 'Relative octave amplitudes matching wavelengthsMeters', { minItems: 1, maxItems: 16, items: Object.freeze({ min: 0, max: 1 }), default: Object.freeze([1, .5, .25, .125, .0625]) })
});

// world-anchored stratification geometry: declared by strata and repeated by terraces so the benches follow the same stack
const STRATA_GEOMETRY_PARAMETERS = Object.freeze({
    origin: point('World XZ origin of the dip planes; the base of stratum 0 lies at offsetMeters there', { default: freezePoints([[0, 0]])[0] }),
    dipEastMetersPerKm: number('meters-per-kilometer', 'Height change of the strata per kilometer toward east (positive: the beds rise toward east)', { default: 0, min: -500, max: 500 }),
    dipNorthMetersPerKm: number('meters-per-kilometer', 'Height change of the strata per kilometer toward north (positive: the beds rise toward north)', { default: 0, min: -500, max: 500 }),
    offsetMeters: number('meters', 'Height of the base of stratum 0 at the origin', { default: 0, min: -5000, max: 5000 }),
    thicknessMeters: number('meters', 'Stratum thickness before the thickness pattern factors', { default: 6, min: .25, max: 500 }),
    thicknessPattern: numbers('dimensionless', 'Thickness factors cycling through the stack: stratum k is thicknessMeters times pattern[k mod length]', { minItems: 1, maxItems: 32, items: Object.freeze({ min: .05, max: 20 }), default: Object.freeze([1]) }),
    warpMeters: number('meters', 'Bound of the world-anchored warp bending the strata (two octaves at warpWavelengthMeters)', { default: 2, min: 0, max: 500 }),
    warpWavelengthMeters: number('meters', 'Wavelength of the strata warp', { default: 400, min: 1, max: 100000 }),
    hardnessPattern: numbers('dimensionless', 'Hardness 0..1 cycling through the stack (1 hardest): stratum k takes pattern[k mod length]', { minItems: 1, maxItems: 32, items: Object.freeze({ min: 0, max: 1 }), default: Object.freeze([.9, .3]) })
});

// shared by the coastal operators that must leave the plan's beach features untouched
const PLAN_PROTECTION_PARAMETERS = Object.freeze({
    protectPlan: boolean('Leave the plan districts, the plan beach points within protectRadiusMeters and, where the operator says so, the open-view corridor and the southwest swim zone untouched (needs plan-inputs)', { default: true }),
    protectRadiusMeters: number('meters', 'Radius around every plan beach point (arrival pad, bus stop) left untouched, blended over the next 10 m', { default: 60, min: 0, max: 1000 }),
    swimZone: Object.freeze({ type: 'object', unit: 'meters', description: 'The plan swim zone kept untouched where the operator protects it: the design-shoreline band between zMin and zMax, seawardMeters offshore and landwardMeters inland (the v2 plan southwest swim beach by default); null when the plan has no swim zone',
        nullable: true, default: Object.freeze({ zMin: 184, zMax: 936, seawardMeters: 150, landwardMeters: 60 }),
        fields: Object.freeze({ zMin: number('meters', 'Southern Z of the zone', { required: true, min: -1e6, max: 1e6 }), zMax: number('meters', 'Northern Z of the zone', { required: true, min: -1e6, max: 1e6 }),
            seawardMeters: number('meters', 'Reach offshore from the design shoreline', { required: true, min: 0, max: 5000 }), landwardMeters: number('meters', 'Reach inland from the design shoreline', { required: true, min: 0, max: 5000 }) }) })
});

const operator = (op, family, description, parameters, reads, writes) => Object.freeze({ op, family, description, parameters: Object.freeze(parameters), layers: Object.freeze({ reads: Object.freeze(reads), writes: Object.freeze(writes) }) });

/** Operator catalog keyed by `op`. Units: meters, degrees, percent, samples, dimensionless; ids and enums carry unit `none`/`id`. */
export const LANDSCAPE_SYNTHESIS_OPERATORS = Object.freeze({
    'import-heights': operator('import-heights', 'inputs', 'Loads the source heights and land cover: the bound landscape directory (native chunks) or a float32 little-endian raw file with declared dimensions; a source coarser than the recipe grid by an integer factor over the same extent is upsampled with the resample filter (its cover takes the nearest source label; upsampled samples are interpolation, never source detail, reported as importResample); a coarser working grid receives the separable tent average aligned to its samples', {
        source: enumeration('Height source', ['landscape', 'raw-float32'], { default: 'landscape' }),
        file: string('raw-float32: relative path of the row-major float32 little-endian heights (row 0 north)', { default: null, format: 'relative-path' }),
        columns: integer('samples', 'raw-float32: declared columns, equal to the recipe grid', { default: null, min: 2, max: 16385 }),
        rows: integer('samples', 'raw-float32: declared rows, equal to the recipe grid', { default: null, min: 2, max: 16385 }),
        coverFile: string('raw-float32: optional relative path of a uint8 land-cover raster with the same dimensions', { default: null, format: 'relative-path' }),
        coverClass: integer('id', 'raw-float32: land-cover class filled when no coverFile is given', { default: 2, min: 0, max: 255 }),
        filter: enumeration('Decimation filter from the native to a coarser working grid', ['tent', 'nearest'], { default: 'tent' }),
        resample: enumeration('Upsampling filter from a source grid coarser than the recipe grid (integer factor): catmull-rom (separable Catmull-Rom with linearly continued edges), bilinear or nearest; the cover always takes the nearest source label', ['catmull-rom', 'bilinear', 'nearest'], { default: 'catmull-rom' })
    }, [], ['height', 'cover']),
    'plan-inputs': operator('plan-inputs', 'inputs', 'Rasterizes the plan: district polygons, road centerlines (exact Euclidean distance transform with nearest road height and width), the design shoreline as a signed distance field, the open-view corridor, runway and apron polygons', {
        landSide: enumeration('Side of the shoreline polyline that is land (probe at the middle of that landscape edge)', ['east', 'west', 'north', 'south'], { default: 'east' }),
        clipDistrictsToLand: boolean('Intersect district masks with the land side of the design shoreline', { default: true }),
        runwayPolygon: polygon('Runway pad polygon, null for a plan without a runway (v2: image uv rectangle (.382,.156)-(.388,.321))', { default: freezePoints([[1528, 3376], [1552, 3376], [1552, 2716], [1528, 2716]]), nullable: true }),
        apronPolygon: polygon('Airport apron polygon, null for a plan without an apron (v2: image uv (.415,.190),(.499,.190),(.506,.260),(.415,.260))', { default: freezePoints([[1660, 3240], [1996, 3240], [2024, 2960], [1660, 2960]]), nullable: true })
    }, ['height', 'cover'], ['districtId', 'landMask', 'roadDistance', 'roadHeight', 'roadWidth', 'roadIndex', 'shoreSigned', 'corridorMask', 'runwayMask', 'apronMask']),
    'landform-plateau': operator('landform-plateau', 'landforms', 'Raises a district or explicit polygon to a (tilted) target height and builds a designed edge outward from its boundary', {
        districtId: integer('id', 'Plan district whose polygon and target elevation are used', { default: null, min: 1, max: 255 }),
        polygon: polygon('Explicit plateau polygon (instead of districtId)', { default: null }),
        heightMeters: number('meters', 'Target height at the polygon centroid; null uses the district target elevation', { default: null, min: -1000, max: 5000 }),
        tiltEastMetersPerKm: number('meters-per-kilometer', 'Target height change toward east from the centroid', { default: 0, min: -200, max: 200 }),
        tiltNorthMetersPerKm: number('meters-per-kilometer', 'Target height change toward north from the centroid', { default: 0, min: -200, max: 200 }),
        insideMode: enumeration('target replaces the inside with the (tilted) target surface; keep leaves the inside unchanged and starts the edge profile from the ground height at the nearest boundary point (a bluff cut along an existing terrace)', ['target', 'keep'], { default: 'target' }),
        ...EDGE_PROFILE_PARAMETERS
    }, ['height'], ['height']),
    'landform-hills': operator('landform-hills', 'landforms', 'Adds bounded ridged multi-scale relief (world-anchored gradient noise octaves with ridged shaping, optional domain warp and anisotropy) inside the mask envelope', {
        amplitudeMeters: number('meters', 'Peak-to-peak relief bound of the summed octaves', { default: 25, min: 0, max: 2000 }),
        ...NOISE_OCTAVES,
        ridgedMix: number('dimensionless', 'Ridged-mix shaping weight (0 plain gradient noise, 1 fully ridged)', { default: .6, min: 0, max: 1 }),
        offset: enumeration('signed centers the relief on zero, positive adds 0..amplitude', ['positive', 'signed'], { default: 'positive' }),
        warpMeters: number('meters', 'Domain warp displacement bound per axis before the octaves are sampled', { default: 60, min: 0, max: 5000 }),
        warpWavelengthMeters: number('meters', 'Wavelength of the domain warp field', { default: 600, min: 1, max: 100000 }),
        anisotropy: number('dimensionless', 'Stretch factor of the relief along bearingDegrees (1 isotropic)', { default: 1, min: 1, max: 20 }),
        bearingDegrees: number('degrees', 'Compass bearing of the stretch (0 north, 90 east)', { default: 0, min: 0, max: 360 }),
        combine: enumeration('add sums the relief, max keeps the higher of the relief surface (sea level base) and the terrain', ['add', 'max'], { default: 'add' })
    }, ['height'], ['height']),
    'landform-valley': operator('landform-valley', 'landforms', 'Carves a valley along a polyline by min-compositing a channel of the given width and depth below the terrain height at the valley axis', {
        polyline: Object.freeze({ type: 'array', unit: 'meters', items: Object.freeze({ type: 'point' }), minItems: 2, maxItems: 4096, required: true, description: 'World XZ axis of the valley' }),
        widthMeters: number('meters', 'Full width of the channel at the terrain surface', { default: 120, min: 1, max: 5000 }),
        depthMeters: number('meters', 'Depth of the channel axis below the terrain height along the axis', { default: 15, min: 0, max: 1000 }),
        profile: enumeration('Cross-section shape', ['parabolic', 'v'], { default: 'parabolic' }),
        endTaperMeters: number('meters', 'Depth tapers to zero over this length at both ends of the axis', { default: 60, min: 0, max: 5000 })
    }, ['height'], ['height']),
    warp: operator('warp', 'warps', 'Domain-warps the height layer: each sample takes the bilinear height at its position displaced by two world-anchored noise fields', {
        strengthMeters: number('meters', 'Displacement bound per axis', { default: 30, min: 0, max: 5000 }),
        wavelengthsMeters: numbers('meters', 'Warp octave wavelengths, strictly decreasing', { minItems: 1, maxItems: 8, items: Object.freeze({ min: .5, max: 100000 }), default: Object.freeze([400, 160]) }),
        amplitudes: numbers('dimensionless', 'Relative warp octave amplitudes', { minItems: 1, maxItems: 8, items: Object.freeze({ min: 0, max: 1 }), default: Object.freeze([1, .4]) }),
        shaping: enumeration('Octave shaping', ['none', 'quintic-odd'], { default: 'none' })
    }, ['height'], ['height']),
    noise: operator('noise', 'warps', 'Adds bounded world-anchored gradient noise octaves (plain or ridged-mix) scaled by the mask', {
        amplitudeMeters: number('meters', 'Bound of the added noise', { default: 2, min: 0, max: 2000 }),
        wavelengthsMeters: numbers('meters', 'Octave wavelengths, strictly decreasing', { minItems: 1, maxItems: 16, items: Object.freeze({ min: .5, max: 100000 }), default: Object.freeze([64, 32, 16, 8]) }),
        amplitudes: numbers('dimensionless', 'Relative octave amplitudes', { minItems: 1, maxItems: 16, items: Object.freeze({ min: 0, max: 1 }), default: Object.freeze([1, .5, .25, .125]) }),
        shaping: enumeration('Octave shaping', ['none', 'ridged-mix'], { default: 'none' }),
        ridgedMix: number('dimensionless', 'Ridged-mix weight when shaping is ridged-mix', { default: 0, min: 0, max: 1 })
    }, ['height'], ['height']),
    'constrain-districts': operator('constrain-districts', 'constraints', 'Re-imposes the target band of plan districts inside their polygons (replace with the tilted target surface, or clamp into a band and limit the slope) with a designed edge outward', {
        districtIds: Object.freeze({ type: 'array', unit: 'id', items: Object.freeze({ type: 'integer', min: 1, max: 255 }), minItems: 1, maxItems: 255, default: null, description: 'Districts constrained; null constrains every plan district' }),
        heightOverrideMeters: number('meters', 'Target height replacing the plan target elevation', { default: null, min: -1000, max: 5000 }),
        tiltEastMetersPerKm: number('meters-per-kilometer', 'Target height change toward east from the district centroid (v2: 0.75)', { default: .75, min: -200, max: 200 }),
        tiltNorthMetersPerKm: number('meters-per-kilometer', 'Target height change toward north from the district centroid (v2: 0.5)', { default: .5, min: -200, max: 200 }),
        inside: enumeration('replace sets the target surface; band clamps heights into +/- bandMeters of it and limits the slope to maxSlopeDegrees', ['replace', 'band'], { default: 'replace' }),
        bandMeters: number('meters', 'Half band kept around the target surface when inside is band', { default: 1.5, min: 0, max: 100 }),
        maxSlopeDegrees: number('degrees', 'Slope limit enforced inside the district when inside is band (chamfer lower envelope)', { default: 8, min: .5, max: 60 }),
        ...EDGE_PROFILE_PARAMETERS
    }, ['height', 'districtId'], ['height']),
    'constrain-roads': operator('constrain-roads', 'constraints', 'Carries every plan road on a grade-limited centerline profile fitted over the whole network (coupled junctions and merging corridors; district interiors and level end sections anchored) and rebuilds the carriageway with designed cut and fill shoulders; refreshes the road layers', {
        profileSource: enumeration('design uses the plan centerline heights, terrain samples the current surface along the centerline', ['terrain', 'design'], { default: 'terrain' }),
        maxGradePercent: number('percent', 'Maximum sustained centerline grade', { default: 6, min: .1, max: 50 }),
        profileSmoothingMeters: number('meters', 'Moving-average window along the centerline before grade limiting', { default: 40, min: 0, max: 2000 }),
        junctionLevelMeters: number('meters', 'Level approach held at the end height on both ends of every road before grade limiting', { default: 30, min: 0, max: 500 }),
        couplingMeters: number('meters', 'Stations of different roads (junctions, merging corridors) or non-consecutive stations of one road within this distance share one profile height', { default: 6, min: 0, max: 100 }),
        endFitToleranceMeters: number('meters', 'A road whose fitted end heights leave the sampled ground by more than this is reported infeasible at the grade limit', { default: .25, min: 0, max: 100 }),
        marginMeters: number('meters', 'Level margin beyond the half carriageway width', { default: 1, min: 0, max: 50 }),
        shoulderWidthMeters: number('meters', 'Width of the cut/fill shoulder beyond the carriageway margin', { default: 12, min: 0, max: 500 }),
        cutSlopeDegrees: number('degrees', 'Slope of cut faces above the road', { default: 45, min: 5, max: 85 }),
        fillSlopeDegrees: number('degrees', 'Slope of fill embankments below the road', { default: 30, min: 5, max: 85 }),
        roadNames: Object.freeze({ type: 'array', unit: 'none', items: Object.freeze({ type: 'string' }), minItems: 1, maxItems: 512, default: null, description: 'Roads constrained; null constrains every plan road' })
    }, ['height', 'roadDistance', 'districtId'], ['height', 'roadDistance', 'roadHeight', 'roadWidth', 'roadIndex']),
    'constrain-shoreline': operator('constrain-shoreline', 'constraints', 'Keeps the sea-level crossing within the tolerance of the design shoreline: land beyond the tolerance stays above minLandHeightMeters, sea below maxSeaHeightMeters, with the near-shore bounded by bandSlopeDegrees over blendMeters', {
        toleranceMeters: number('meters', 'Half width of the band around the design shoreline where the crossing may lie', { default: 10, min: .5, max: 500 }),
        minLandHeightMeters: number('meters', 'Minimum height of land beyond the tolerance', { default: .3, min: 0, max: 50 }),
        maxSeaHeightMeters: number('meters', 'Maximum height of the seabed beyond the tolerance', { default: -.3, min: -50, max: 0 }),
        bandSlopeDegrees: number('degrees', 'Steepest designed rise of the envelope bounds across the band', { default: 12, min: .5, max: 80 }),
        blendMeters: number('meters', 'Reach of the sloped bounds beyond the tolerance band', { default: 30, min: 0, max: 1000 })
    }, ['height', 'shoreSigned'], ['height']),
    'constrain-points': operator('constrain-points', 'constraints', 'Levels the beach arrival pad flush with the sand, the bus-stop footprint, and imposes the open-view corridor descent toward the sea', {
        source: enumeration('plan takes the beach points, bus stop footprint and corridor from beach_points.json; params uses the explicit parameters', ['plan', 'params'], { default: 'plan' }),
        beachArrival: point('Beach arrival pad center (params source)', { default: freezePoints([[1090, 490]])[0] }),
        beachArrivalHeightMeters: number('meters', 'Pad height, flush with the sand', { default: 2.6, min: -100, max: 1000 }),
        padRadiusMeters: number('meters', 'Level pad radius', { default: 20, min: 0, max: 500 }),
        padBlendMeters: number('meters', 'Smoothstep blend beyond the pad radius', { default: 25, min: 0, max: 500 }),
        busStop: point('Bus-stop reservation center (params source)', { default: freezePoints([[1260, 520]])[0] }),
        busStopHeightMeters: number('meters', 'Bus-stop footprint height', { default: 2.6, min: -100, max: 1000 }),
        busStopFootprintMeters: numbers('meters', 'Footprint extent along X and along Z', { minItems: 2, maxItems: 2, items: Object.freeze({ min: .5, max: 1000 }), default: Object.freeze([30, 6]) }),
        busStopBlendMeters: number('meters', 'Smoothstep blend beyond the footprint', { default: 10, min: 0, max: 500 }),
        corridor: enumeration('Open-view corridor treatment: descent imposes a smooth surface falling toward the sea, none leaves it', ['descent', 'none'], { default: 'descent' }),
        corridorPolygon: polygon('Corridor polygon (params source)', { default: freezePoints([[1096, 1020], [1348, 1024], [1416, 776], [1252, 608], [1020, 664]]) }),
        corridorSeaHeightMeters: number('meters', 'Corridor surface height at the seaward end of the descent', { default: 2.6, min: -100, max: 1000 }),
        corridorInlandHeightMeters: number('meters', 'Corridor surface height at the inland end of the descent', { default: 8, min: -100, max: 1000 }),
        corridorOrigin: point('Seaward origin of the descent axis', { default: freezePoints([[1200, 628]])[0] }),
        corridorBearingDegrees: number('degrees', 'Compass bearing of the inland direction of the descent axis (0 north)', { default: 0, min: 0, max: 360 }),
        corridorRunMeters: number('meters', 'Length of the linear rise from the seaward to the inland height', { default: 400, min: 1, max: 5000 }),
        corridorBlendMeters: number('meters', 'Smoothstep blend outside the corridor polygon (v2: 55)', { default: 55, min: 0, max: 1000 }),
        corridorShoreFadeMeters: number('meters', 'The corridor surface fades in over this land distance from the shoreline (v2: 85)', { default: 85, min: 0, max: 1000 })
    }, ['height', 'shoreSigned', 'corridorMask'], ['height']),
    'constrain-runway': operator('constrain-runway', 'constraints', 'Levels the runway pad to its height plus a tiny grade along a bearing and blends it into the terrain over blendMeters (v2: 20 m, 0.2 percent toward north, 28 m feather)', {
        heightMeters: number('meters', 'Pad height at the runway polygon centroid', { default: 20, min: -100, max: 5000 }),
        gradePercent: number('percent', 'Grade of the pad along gradeBearingDegrees', { default: .2, min: -10, max: 10 }),
        gradeBearingDegrees: number('degrees', 'Compass bearing along which the pad rises (0 north)', { default: 0, min: 0, max: 360 }),
        blendMeters: number('meters', 'Smoothstep blend outside the polygon', { default: 28, min: 0, max: 1000 })
    }, ['height', 'runwayMask'], ['height']),
    'height-cap': operator('height-cap', 'constraints', 'Clips heights above capMeters, with an optional soft shoulder that compresses heights above capMeters - shoulderMeters asymptotically toward the cap', {
        capMeters: number('meters', 'Maximum height', { default: 50, min: -1000, max: 10000 }),
        shoulderMeters: number('meters', 'Soft shoulder height below the cap (0 hard clip)', { default: 0, min: 0, max: 1000 })
    }, ['height'], ['height']),
    'geology-channels': operator('geology-channels', 'output', 'Finalizes the geology channel layers at the end of a recipe: the face mask from the slope of the final height, flow and drainage recomputed over the final surface (conditioned Priority-Flood, flat resolution, Quinn MFD, ln(A / spacing) over land percentiles as the terrain fields), wear and deposition normalized from meters to 0..1, regolith and deposit thickness clamped into their published ranges with the bedrock re-derived from height = bedrock + regolith + depositThickness, sea samples without a coastal class marked offshore; layers no earlier operator produced are created with their neutral values and reported; refuses a mask', {
        faceStartDegrees: number('degrees', 'Slope where the face mask starts rising', { default: 55, min: 0, max: 89 }),
        faceFullDegrees: number('degrees', 'Slope where the face mask reaches 1', { default: 75, min: 1, max: 90 }),
        recomputeFlow: boolean('Recompute flow and drainage over the final surface; false keeps the layers of earlier operators (neutral when absent) and only clamps them', { default: true }),
        flowConditioningSamples: number('samples', 'Gaussian sigma of the routing surface before the depression fill (terrain fields: 3)', { default: 3, min: 0, max: 64 }),
        flowExponent: number('dimensionless', 'Quinn multiple-flow-direction exponent (terrain fields: 1.1)', { default: 1.1, min: .5, max: 10 }),
        flowFlatSuppressionSamples: number('samples', 'Gaussian sigma of the flat share that fades the flow channel over flats (terrain fields: 2)', { default: 2, min: 0, max: 64 }),
        flowPercentiles: numbers('percent', 'Land percentiles of ln(A / spacing) mapped to 0 and 1 (terrain fields: 60 and 99.7)', { minItems: 2, maxItems: 2, items: Object.freeze({ min: 0, max: 100 }), default: Object.freeze([60, 99.7]) }),
        rillAreaSquareMeters: number('square-meters', 'Contributing area where a hillslope becomes a rill', { default: 2000, min: 1, max: 1e9 }),
        gullyAreaSquareMeters: number('square-meters', 'Contributing area where a rill becomes a gully', { default: 20000, min: 1, max: 1e9 }),
        channelAreaSquareMeters: number('square-meters', 'Contributing area where a gully becomes a channel', { default: 200000, min: 1, max: 1e9 }),
        pondFillMeters: number('meters', 'Depression fill depth above which a sample is a pond (flat samples of the filled surface are flat/pond regardless)', { default: .05, min: 0, max: 100 }),
        wearNormalizationMeters: number('meters', 'Wear depth mapped to 1; null uses the land p99 of the wear layer (then its land maximum when p99 is 0)', { default: null, min: 1e-6, max: 1000 }),
        depositionNormalizationMeters: number('meters', 'Deposition depth mapped to 1; null uses the land p99 of the deposition layer (then its land maximum when p99 is 0)', { default: null, min: 1e-6, max: 1000 })
    }, ['height'], ['bedrock', 'regolith', 'depositType', 'depositThickness', 'lithology', 'wear', 'deposition', 'flow', 'drainage', 'faceMask', 'coastalZone', 'waveExposure']),
    'derive-land-cover': operator('derive-land-cover', 'output', 'Derives the natural land cover (0 water, 1 sand, 2 grass and scrub, 3 forest soil, 4 rock) of every sample from the final geology after geology-channels and writes the cover layer: the planning classes are copied from the source cover exactly, samples below sea level become water, sand where the deposit is beach or dune sand or the coastal zone is a sand zone, rock where the face mask reaches faceMaskThreshold, the slope reaches rockSlopeDegrees, talus is at least talusRockMinMeters thick or bedrock is exposed (mantle at most exposedMantleMeters) on a slope of at least bedrockSlopeDegrees with a stratum hardness of at least rockHardnessThreshold (needs the hardness layer of strata, else that rule is off), grass and scrub on alluvium valley floors (at least alluviumGrassMinMeters thick on slopes up to valleyFloorSlopeDegrees), otherwise the source class where it is natural (the forest/grass partition is kept where the geology is neutral) and emergedLandClass where the source held water; reports the full class transition matrix with sample counts and per-class totals; requires recipe.outputs.coverPolicy derive', {
        planningClasses: Object.freeze({ type: 'array', unit: 'id', items: Object.freeze({ type: 'integer', min: 0, max: 255 }), minItems: 0, maxItems: 256, default: Object.freeze([5, 6, 7]), description: 'Source classes copied exactly wherever they occur (planning cover: urban, road, runway)' }),
        sandCoastalZones: Object.freeze({ type: 'array', unit: 'id', items: Object.freeze({ type: 'integer', min: 0, max: 12 }), minItems: 0, maxItems: 13, default: Object.freeze([5, 6, 7, 8]), description: 'Coastal zone classes that are sand on land (swash, berm, backshore, foredune)' }),
        faceMaskThreshold: number('dimensionless', 'Face mask from which a sample is rock', { default: .5, min: 0, max: 1 }),
        rockSlopeDegrees: number('degrees', 'Slope from which a sample is rock regardless of its mantle', { default: 40, min: 5, max: 89 }),
        bedrockSlopeDegrees: number('degrees', 'Slope from which exposed hard bedrock is rock (outcrops on steep convex ground)', { default: 25, min: 0, max: 89 }),
        exposedMantleMeters: number('meters', 'Regolith plus deposit thickness up to which the bedrock counts as exposed', { default: .05, min: 0, max: 10 }),
        rockHardnessThreshold: number('dimensionless', 'Stratum hardness from which exposed bedrock is rock (the hardness layer of strata; without it exposed bedrock is rock only by slope)', { default: .6, min: 0, max: 1 }),
        talusRockMinMeters: number('meters', 'Talus deposit thickness from which a sample is rock (scree)', { default: .5, min: 0, max: 30 }),
        alluviumGrassMinMeters: number('meters', 'Alluvium thickness from which a gentle valley floor is grass and scrub', { default: .3, min: 0, max: 30 }),
        valleyFloorSlopeDegrees: number('degrees', 'Steepest slope of an alluvium valley floor that becomes grass and scrub', { default: 6, min: 0, max: 45 }),
        emergedLandClass: integer('id', 'Class of land whose source cover was water and that no sand rule covers', { default: 2, min: 1, max: 4 })
    }, ['height', 'cover', 'regolith', 'depositType', 'depositThickness', 'faceMask', 'coastalZone'], ['cover']),
    'import-map': operator('import-map', 'inputs', 'Combines a declared interchange map (recipe.inputs.imports, authenticated by its metadata sidecar) into a float layer under the operator mask: the scaled and offset map values replace, add to, multiply, or bound (max, min) the layer; the map frame must equal the working grid, or the output grid when the recipe works coarse (then the aligned tent average decimates it); the file hash enters the recipe identity',
        IMPORT_COMBINATION, [], []),
    'export-map': operator('export-map', 'output', 'Writes a float layer of the working grid as an interchange map (RAW float32, PNG 8/16-bit gray or EXR float32) with its metadata sidecar under the runtime export root, carrying the recipe identity and this operator id as provenance; placed after every input operator so the identity is complete', {
        layer: string('Float layer exported', { default: 'height', format: 'id' }),
        kind: enumeration('heights writes meters; mask writes 0..1 values (rejected outside that range)', ['heights', 'mask'], { default: 'heights' }),
        file: string('Relative path of the map under the export root; the sidecar is <file>.meta.json', { required: true, format: 'relative-path' }),
        encoding: enumeration('Map encoding', ['raw-float32', 'png-gray16', 'png-gray8', 'exr-float32'], { default: 'exr-float32' }),
        range: numbers('meters', 'PNG heights: [min, max] quantization range in meters (values outside are rejected); null for the float encodings and for masks', { minItems: 2, maxItems: 2, items: Object.freeze({ min: -100000, max: 100000 }), default: null })
    }, [], []),
    'fluvial-erosion': operator('fluvial-erosion', 'erosion', 'Landscape-scale stream-power incision (Braun & Willett 2013 implicit scheme, n = 1) over a Priority-Flood drainage network of the current surface (steepest-descent receivers, Quinn multiple-flow-direction contributing areas, routing refreshed every routingEveryIterations) with explicit linear hillslope diffusion and uplift; outlets (landscape edge, below sea level) are fixed base levels, loose deposits and regolith erode before bedrock, creep moves regolith, wear accumulates the incision in meters and the flow and drainage channels are classified on the final surface', {
        iterations: integer('iterations', 'Implicit incision steps (retain-target equilibrates in about 1 / retainRate iterations)', { default: 50, min: 1, max: 5000 }),
        dt: number('dimensionless', 'Time step multiplier of one iteration (scales the erodibility and the diffusion)', { default: 1, min: 1e-6, max: 1e6 }),
        erodibility: number('meters^(1-2m)-per-iteration', 'Stream-power erodibility K: incision per iteration = K * A^m * S for n = 1 (A in square meters); with retain-target a channel equilibrates S * K * A^m / retainRate below the design surface', { default: 5e-3, min: 0, max: 10 }),
        m: number('dimensionless', 'Contributing-area exponent m of the stream-power law', { default: .5, min: .1, max: 1.5 }),
        routingEveryIterations: integer('iterations', 'Recompute the Priority-Flood routing, receivers and contributing areas every this many iterations', { default: 1, min: 1, max: 5000 }),
        uplift: enumeration('none lets the surface incise freely; retain-target pulls every sample toward its pre-operator height by retainRate per iteration (keeps the designed landform while channels incise); constant raises the bedrock by upliftMetersPerIteration', ['none', 'retain-target', 'constant'], { default: 'retain-target' }),
        retainRate: number('per-iteration', 'retain-target: share of the gap to the pre-operator height closed per iteration', { default: .02, min: 0, max: 1 }),
        upliftMetersPerIteration: number('meters-per-iteration', 'constant: bedrock uplift per iteration', { default: .01, min: 0, max: 100 }),
        diffusivity: number('square-meters-per-iteration', 'Linear hillslope diffusivity D of the explicit 5-point creep scheme (stability-limited sub-steps; lowering erodes the column, raising thickens the regolith)', { default: .2, min: 0, max: 1e4 }),
        useHardness: boolean('Scale the erodibility by (1 - hardnessWeight * hardness) when a hardness layer exists (written by strata); without that layer the erodibility stays uniform and the statistics report hardnessApplied false', { default: true }),
        hardnessWeight: number('dimensionless', 'Erodibility reduction at hardness 1', { default: .8, min: 0, max: 1 }),
        rillAreaM2: number('square-meters', 'Contributing area from which a sample is a rill (drainage class 1)', { default: 2000, min: 1, max: 1e9 }),
        gullyAreaM2: number('square-meters', 'Contributing area from which a sample is a gully (class 2)', { default: 10000, min: 1, max: 1e9 }),
        channelAreaM2: number('square-meters', 'Contributing area from which a sample is a channel (class 3)', { default: 50000, min: 1, max: 1e9 }),
        pondDepthMeters: number('meters', 'Filled depressions deeper than this are class 4 (flat/pond)', { default: .1, min: 0, max: 100 })
    }, ['height'], ['height', 'bedrock', 'regolith', 'depositType', 'depositThickness', 'wear', 'flow', 'drainage']),
    'hydraulic-erosion': operator('hydraulic-erosion', 'erosion', 'Detail-scale particle erosion (Beyer 2015): seeded droplets start at deterministic positions above sea level inside the mask, follow the bilinear gradient with inertia, erode over a radius brush (weighted by the mask) or deposit on the four cell corners according to their sediment capacity, and end when they leave the grid (exported load), stop, enter the sea or run out of steps; deposits settle as colluvium on slopes above colluviumSlopeDegrees, else as alluvium, and never raise a corner above the repose plane of its neighbours (colluviumReposeDegrees / alluviumReposeDegrees: the refused share stays in the droplet, reported as reposeLimitedSamples and reposeDeferredVolumeCubicMeters); wear and deposition accumulate in meters and the mass balance eroded = deposited + exported is reported', {
        droplets: integer('droplets', 'Number of droplets; null derives it from dropletsPerSquareKilometer and the grid area', { default: 200000, min: 1, max: 100000000, nullable: true }),
        dropletsPerSquareKilometer: number('droplets-per-square-kilometer', 'Droplet density used when droplets is null', { default: 12500, min: 0, max: 1e8 }),
        maxSteps: integer('steps', 'Lifetime of a droplet in samples travelled', { default: 64, min: 1, max: 4096 }),
        inertia: number('dimensionless', 'Share of the previous direction kept per step (0 follows the gradient exactly)', { default: .05, min: 0, max: 1 }),
        capacity: number('dimensionless', 'Sediment capacity factor: capacity = max(drop, minSlope) * speed * water * capacity', { default: 4, min: 0, max: 1000 }),
        minSlope: number('meters-per-sample', 'Lower bound of the height drop per step inside the capacity', { default: .01, min: 0, max: 100 }),
        erosionRate: number('dimensionless', 'Share of the free capacity eroded per step', { default: .3, min: 0, max: 1 }),
        depositionRate: number('dimensionless', 'Share of the excess sediment deposited per step', { default: .3, min: 0, max: 1 }),
        evaporation: number('dimensionless', 'Water lost per step', { default: .01, min: 0, max: 1 }),
        gravity: number('dimensionless', 'Speed gain per meter of descent: speed^2 += drop * gravity', { default: 4, min: 0, max: 1000 }),
        radius: integer('samples', 'Erosion brush radius (weights fall linearly to zero at the radius)', { default: 3, min: 1, max: 16 }),
        initialWater: number('dimensionless', 'Water volume of a new droplet', { default: 1, min: 0, max: 1000 }),
        initialSpeed: number('dimensionless', 'Speed of a new droplet', { default: 1, min: 0, max: 1000 }),
        maxErosionPerStepMeters: number('meters', 'Upper bound of the material one droplet erodes in one step before the brush spreads it (the model runs in meters: drops, capacities and the sediment load are heights in meters per step)', { default: .05, min: 1e-6, max: 100 }),
        colluviumSlopeDegrees: number('degrees', 'Deposits on slopes steeper than this are colluvium, gentler ones alluvium', { default: 12, min: 0, max: 89 }),
        colluviumReposeDegrees: number('degrees', 'Repose angle of colluvium deposits: a deposit never raises a cell above h + d * tan(angle) of any 8-neighbour', { default: 34, min: 1, max: 80 }),
        alluviumReposeDegrees: number('degrees', 'Repose angle of alluvium deposits (same bound)', { default: 30, min: 1, max: 80 }),
        endOfLife: enumeration('What a droplet that stops, enters the sea or runs out of steps on the grid does with its load: deposit settles it at its position under the repose bound (what the mask or the bound refuses is exported), export counts it as exported', ['deposit', 'export'], { default: 'deposit' })
    }, ['height'], ['height', 'bedrock', 'regolith', 'depositType', 'depositThickness', 'wear', 'deposition']),
    'thermal-weathering': operator('thermal-weathering', 'erosion', 'Thermal weathering and talus (Musgrave, Kolb & Mace 1989): each iteration converts bedrock above sea level into regolith at weatheringRateMetersPerIteration * f(slope), then moves loose material (regolith and deposits; reef rock stays) from every sample to its lower 8-neighbours wherever the slope exceeds the repose angle of its surface material, order independent through two buffers; a sample takes inflow only up to repose (talusReposeDegrees) against its highest neighbour as that neighbour stands after shedding, so donors converging on a hollow cannot stack a needle (the refused share stays at the donors, reported as reposeLimitedSamples and reposeHeldVolumeCubicMeters); material arriving along a source slope above talusSourceSlopeDegrees is talus, otherwise colluvium; beyond the landscape edge a virtual neighbour continues the local slope and what moves there is exported', {
        iterations: integer('iterations', 'Weathering and settling iterations', { default: 50, min: 1, max: 5000 }),
        weatheringRateMetersPerIteration: number('meters-per-iteration', 'Bedrock converted to regolith per iteration where f(slope) = 1', { default: .01, min: 0, max: 100 }),
        weatheringSlopeDegrees: number('degrees', 'f(slope) rises linearly from 0 at this slope to 1 at 90 degrees; 0 weathers every slope at the full rate', { default: 25, min: 0, max: 89 }),
        maxRegolithMeters: number('meters', 'Regolith thickness at which weathering stops', { default: 8, min: 0, max: 100 }),
        talusReposeDegrees: number('degrees', 'Repose angle of talus and colluvium', { default: 34, min: 1, max: 80 }),
        sandReposeDegrees: number('degrees', 'Repose angle of alluvium, beach sand and dune sand', { default: 32, min: 1, max: 80 }),
        regolithReposeDegrees: number('degrees', 'Repose angle of regolith without a deposit on top', { default: 30, min: 1, max: 80 }),
        talusSourceSlopeDegrees: number('degrees', 'Material leaving a sample along a slope steeper than this arrives as talus, otherwise as colluvium', { default: 45, min: 1, max: 89 }),
        settleRate: number('dimensionless', 'Share of the largest repose excess a sample sheds per iteration (0.5 settles a two-sample step in one iteration)', { default: .5, min: 0, max: 1 })
    }, ['height'], ['height', 'bedrock', 'regolith', 'depositType', 'depositThickness']),
    'sediment-deposit': operator('sediment-deposit', 'erosion', 'Transport-limited sediment routing: the flux (inflow plus the wear supply) travels donors-first over the Quinn multiple-flow-direction network of the filled current surface; filled depressions trap it up to their spill level (ponds, filled flat from the floor), where it exceeds the capacity c = capacityCoefficient * A^capacityAreaExponent * max(S, minSlope)^capacitySlopeExponent * spacing the excess deposits as alluvium (depositionFraction per sample, never above the repose plane of the sample\'s neighbours at alluviumReposeDegrees; the rest continues downstream: fans and valley floors; reposeLimitedSamples and reposeDeferredVolumeCubicMeters report the bound), where the capacity exceeds it the mobile share of the loose material is entrained (never bedrock); outlets export', {
        iterations: integer('iterations', 'Routing passes (the network is recomputed before each pass)', { default: 1, min: 1, max: 100 }),
        mobileFraction: number('dimensionless', 'Share of the loose thickness (regolith and deposits) one pass may entrain where the capacity exceeds the flux', { default: .5, min: 0, max: 1 }),
        supplyLayer: enumeration('Fresh sediment added to the flux at every sample: wear adds supplyFraction of the wear layer when it exists (otherwise the statistics report supplyApplied false), none adds nothing', ['none', 'wear'], { default: 'wear' }),
        supplyFraction: number('dimensionless', 'Share of the supply layer depth entering the flux', { default: 1, min: 0, max: 1 }),
        capacityCoefficient: number('cubic-meters-per-meter-width', 'Transport capacity coefficient per unit width (capacity in cubic meters per pass = coefficient * A^a * S^b * spacing, A in square meters)', { default: .01, min: 0, max: 1e3 }),
        capacityAreaExponent: number('dimensionless', 'Exponent a of the contributing area (square meters) in the capacity', { default: 1, min: 0, max: 3 }),
        capacitySlopeExponent: number('dimensionless', 'Exponent b of the slope in the capacity', { default: 1, min: 0, max: 3 }),
        minSlope: number('dimensionless', 'Lower bound of the slope inside the capacity, so flats keep a trickle of transport instead of a mound at their entrance', { default: .001, min: 1e-6, max: 1 }),
        depositionFraction: number('dimensionless', 'Share of the excess flux deposited at each sample; the rest continues downstream', { default: .3, min: 0, max: 1 }),
        alluviumReposeDegrees: number('degrees', 'Repose angle of the alluvium: a deposit never raises a sample above h + d * tan(angle) of any 8-neighbour; the refused excess continues in the flux', { default: 30, min: 1, max: 80 })
    }, ['height'], ['height', 'bedrock', 'regolith', 'depositType', 'depositThickness', 'deposition']),
    strata: operator('strata', 'geology', 'Stratifies the rock into a dipping layered stack: the stratum index of a sample is its stack level (rock height minus the datum of the dip planes, the offset and the world-anchored warp) located in the cycling thickness pattern; writes the lithology index (1..255 cycling, 0 unstratified) where the mask is at least 0.5 and blends the hardness of the cycling pattern plus grain noise by the mask; the rock surface is bedrock when an earlier operator created that layer and source is bedrock, otherwise the height (the statistics report sourceLayer)', {
        source: enumeration('Rock surface stratified: bedrock (when an earlier erosion, geology or coastal operator created the layer, otherwise the height) or always the height', ['bedrock', 'height'], { default: 'bedrock' }),
        ...STRATA_GEOMETRY_PARAMETERS,
        hardnessNoise: number('dimensionless', 'Bound of the world-anchored grain noise added to the pattern hardness (clamped to 0..1)', { default: .1, min: 0, max: 1 }),
        hardnessNoiseWavelengthMeters: number('meters', 'Largest wavelength of the grain noise (two octaves)', { default: 50, min: 1, max: 10000 })
    }, ['height'], ['lithology', 'hardness']),
    terraces: operator('terraces', 'geology', 'Cuts benches along hard strata: where stratified rock (lithology above 0) in a soft stratum rests on a hard one (pattern hardness at or above hardThreshold) on a slope steeper than minSlopeDegrees, the soft rock above the hard top within benchWidthMeters horizontally is cut down to that top (the riser steepens over the last 30 percent of the bench), scaled by strength and the mask; the cut rock is routed down the steepest descent of the pre-operator surface past the cut, spread over talusSpreadMeters and settled as talus (depositType 1) at talusReposeDegrees (a sample takes talus up to the repose plane of its neighbours, the rest rolls on to its lowest neighbour for at most 512 hops, then is exported), so the mass is conserved (deposited + exported = cut, reported with reposeLimitedSamples, reposeHops and reposeExportedVolumeCubicMeters) and the height invariant holds; repeats the strata geometry of the strata operator that stratified the rock', {
        ...STRATA_GEOMETRY_PARAMETERS,
        hardThreshold: number('dimensionless', 'Pattern hardness from which a stratum resists and carries a bench on its top', { default: .6, min: 0, max: 1 }),
        minSlopeDegrees: number('degrees', 'Slope of the pre-operator surface from which benches are cut', { default: 15, min: 0, max: 89 }),
        benchWidthMeters: number('meters', 'Horizontal reach of the bench above the hard top', { default: 12, min: .5, max: 500 }),
        strength: number('dimensionless', 'Share of the cut applied (1 flattens fully onto the hard top)', { default: 1, min: 0, max: 1 }),
        depositTalus: boolean('Drop the cut rock as talus below the bench; false removes it (reported as the mass balance)', { default: true }),
        talusSpreadMeters: number('meters', 'Length of the descent over which each cut sample\'s talus is spread with decreasing shares', { default: 16, min: .5, max: 500 }),
        talusReposeDegrees: number('degrees', 'Repose angle of the settled talus: a sample never rises above h + d * tan(angle) of any 8-neighbour; the rest rolls on downhill', { default: 34, min: 1, max: 80 })
    }, ['height', 'lithology'], ['height', 'bedrock', 'regolith', 'depositType', 'depositThickness']),
    'landform-headland': operator('landform-headland', 'landforms', 'Raises a promontory at a shoreline point: an elliptical dome footprint from a quarter of lengthMeters landward of center to lengthMeters seaward along bearingDegrees, heightMeters above sea level at the dome center (mid footprint) falling to sea level at the footprint edge with ridged noise texture, max-composited over the terrain and scaled by the mask (when the geology ledger exists the rise lifts the bedrock and a cut goes through the ledger); it moves the sea-level crossing deliberately and reports the displacement and the affected design-shoreline vertices; protectPlan leaves districts, the plan beach points and the southwest swim zone untouched', {
        center: point('Shoreline point at the root of the promontory', { required: true }),
        bearingDegrees: number('degrees', 'Compass bearing of the seaward axis (0 north, 90 east; the coastal city sea lies west at 270)', { default: 270, min: 0, max: 360 }),
        lengthMeters: number('meters', 'Seaward reach of the footprint from center', { default: 150, min: 1, max: 5000 }),
        widthMeters: number('meters', 'Full width of the footprint across the axis', { default: 120, min: 1, max: 5000 }),
        heightMeters: number('meters', 'Crest height above sea level at center', { default: 8, min: 0, max: 500 }),
        noiseMeters: number('meters', 'Bound of the ridged noise texture (three octaves, scaled by the dome)', { default: 1, min: 0, max: 100 }),
        noiseWavelengthMeters: number('meters', 'Largest wavelength of the texture octaves', { default: 60, min: 1, max: 10000 }),
        ...PLAN_PROTECTION_PARAMETERS
    }, ['height', 'shoreSigned', 'districtId'], ['height']),
    'landform-cove': operator('landform-cove', 'landforms', 'Scoops an embayment at a shoreline point: an elliptical footprint from lengthMeters landward of center to a quarter of lengthMeters seaward along bearingDegrees, depthMeters below sea level at the scoop center (mid footprint) rising to sea level at the footprint edge with ridged noise texture, min-composited under the terrain and scaled by the mask (through the geology ledger when it exists); it moves the sea-level crossing deliberately and reports the displacement and the affected design-shoreline vertices; protectPlan leaves districts, the plan beach points and the southwest swim zone untouched', {
        center: point('Shoreline point at the mouth of the cove', { required: true }),
        bearingDegrees: number('degrees', 'Compass bearing of the seaward direction (0 north, 90 east); the cove extends landward against it', { default: 270, min: 0, max: 360 }),
        lengthMeters: number('meters', 'Landward reach of the footprint from center', { default: 150, min: 1, max: 5000 }),
        widthMeters: number('meters', 'Full width of the footprint across the axis', { default: 120, min: 1, max: 5000 }),
        depthMeters: number('meters', 'Depth of the scoop below sea level at center', { default: 4, min: 0, max: 100 }),
        noiseMeters: number('meters', 'Bound of the ridged noise texture (three octaves, scaled by the scoop)', { default: 1, min: 0, max: 100 }),
        noiseWavelengthMeters: number('meters', 'Largest wavelength of the texture octaves', { default: 60, min: 1, max: 10000 }),
        ...PLAN_PROTECTION_PARAMETERS
    }, ['height', 'shoreSigned', 'districtId'], ['height']),
    'coastal-exposure': operator('coastal-exposure', 'coastal', 'Wave exposure of the shore: from every waterline sample (land with a sea 4-neighbour) rays over the current surface across the seaward half plane around the design-shoreline normal count as open fetch when they stay below sea level plus surfaceClearanceMeters for fetchMeters or leave the landscape; the open fraction, scaled by the mask, is carried to every sample from its nearest waterline sample and faded by a smoothstep over inlandReachMeters on land and offshoreReachMeters at sea (waveExposure); coastalZone receives 1 (offshore) on sea samples still unclassified and 0 (inland) on land samples beyond the inland reach still marked offshore, leaving the classes of other coastal operators untouched', {
        fetchDirections: integer('directions', 'Rays per waterline sample, evenly spread over the open 180 degree seaward fan', { default: 24, min: 2, max: 360 }),
        fetchMeters: number('meters', 'Length of every ray', { default: 1500, min: 1, max: 100000 }),
        rayStepMeters: number('meters', 'Sampling step along a ray (bilinear height)', { default: 4, min: .1, max: 1000 }),
        surfaceClearanceMeters: number('meters', 'A ray is blocked where the surface rises to sea level plus this clearance', { default: 0, min: -10, max: 100 }),
        inlandReachMeters: number('meters', 'Landward smoothstep fade of the exposure from the waterline', { default: 60, min: 0, max: 5000 }),
        offshoreReachMeters: number('meters', 'Seaward smoothstep fade of the exposure from the waterline; sea samples farther out count as offshore', { default: 200, min: 0, max: 50000 })
    }, ['height', 'shoreSigned'], ['waveExposure', 'coastalZone']),
    'coastal-bluff': operator('coastal-bluff', 'coastal', 'Bluff retreat with a wave-cut platform, cut only: the crest line is the polygon boundary (source polygon, like the D1 bluff) or, per sample along the design-shoreline normal, the first point within maxDistanceFromShoreMeters where the pre-operator ground reaches minCliffHeightMeters (source detect); the crest moves landward by retreatMeters and takes the pre-operator ground height there, the face descends at faceSlopeDegrees to the platform at platformHeightMeters above sea level, the platform slopes seaward at platformSlopeDegrees over platformWidthMeters beyond the toe and blends into the former surface over blendMeters, an optional notch grooves the toe, and talusVolumeFraction of the cut rock settles as a talus wedge (depositType 1) against the face at talusSlopeDegrees; writes coastalZone 12 crown (crownWidthMeters behind the crest), 11 face, 10 toe (toeBandMeters beyond the toe and the talus), 9 platform and faceMask 1 on the face; the geology ledger keeps the height invariant; protectPlan leaves districts, the plan beach points and the open-view corridor untouched; reports the sea-level crossing displacement', {
        source: enumeration('Crest line source: an explicit polygon (its boundary) or detection along the design-shoreline normal', ['detect', 'polygon'], { default: 'detect' }),
        polygon: polygon('Crest polygon (the landward side is inside), required with source polygon', { default: null }),
        maxDistanceFromShoreMeters: number('meters', 'detect: distance from the design shoreline within which the ground must reach minCliffHeightMeters', { default: 160, min: 1, max: 5000 }),
        minCliffHeightMeters: number('meters', 'detect: ground height above sea level that marks the crest', { default: 6, min: 0, max: 500 }),
        retreatMeters: number('meters', 'Landward displacement of the crest', { default: 10, min: 0, max: 500 }),
        faceSlopeDegrees: number('degrees', 'Slope of the bluff face', { default: 65, min: 10, max: 89 }),
        platformHeightMeters: number('meters', 'Platform height above sea level at the toe', { default: .8, min: -10, max: 20 }),
        platformSlopeDegrees: number('degrees', 'Seaward slope of the platform', { default: 1, min: 0, max: 30 }),
        platformWidthMeters: number('meters', 'Platform width beyond the toe before the former surface resumes', { default: 30, min: 0, max: 1000 }),
        notchDepthMeters: number('meters', 'Depth of the groove at the toe (its half width is twice the depth); 0 for none', { default: 0, min: 0, max: 5 }),
        talusVolumeFraction: number('dimensionless', 'Share of the cut volume dropped as a talus wedge at the toe', { default: .3, min: 0, max: 1 }),
        talusSlopeDegrees: number('degrees', 'Slope of the talus wedge (below faceSlopeDegrees)', { default: 33, min: 1, max: 80 }),
        crownWidthMeters: number('meters', 'Band behind the crest classified as bluff crown', { default: 10, min: 0, max: 500 }),
        toeBandMeters: number('meters', 'Platform band beyond the toe classified as bluff toe', { default: 3, min: 0, max: 100 }),
        blendMeters: number('meters', 'Smoothstep from the platform end into the former surface', { default: 6, min: 0, max: 500 }),
        ...PLAN_PROTECTION_PARAMETERS
    }, ['height', 'shoreSigned', 'districtId', 'corridorMask'], ['height', 'bedrock', 'regolith', 'depositType', 'depositThickness', 'coastalZone', 'faceMask']),
    'coastal-beach': operator('coastal-beach', 'coastal', 'Equilibrium beach profile in distance from the design shoreline: seaward of the foreshore the Dean 1991 curve h = -deanA x^(2/3) (x from a virtual origin, reported as deanOriginMeters, chosen so the curve meets the foreshore at swashDepthMeters) cuts the seabed where it is shallower (offshoreMode cut) or replaces it (offshoreMode replace, raising sand where the seabed lies below the profile), faded over offshoreReachMeters; with deanDepthMeters the curve hands over at that depth to a planar shelf at shelfSlopeDegrees down to shelfFloorDepthMeters (reported as the distance of the handover); from -swashDepthMeters through the waterline the straight 1:foreshoreSlopeRatio foreshore, the berm face over bermFaceRunMeters up to the crest at bermHeightMeters and bermDistanceMeters, the flat berm over bermWidthMeters and the backshore descending at backshoreSlopeDegrees replace the ground (raising sand, lowering a too-high ramp) inside beachBandMeters with a smoothstep into the existing ground over blendMeters, all scaled by the mask; where the profile dominates (weight at least 0.5) the surface carries at least minSandMeters of beach sand (depositType 4) and coastalZone 4 surf (profile above -surfDepthMeters), 5 swash, 6 berm or 7 backshore; measures the foreshore slope, berm height and distance and where the backshore meets the ground on transectCount transects; protectPlan leaves districts and the plan beach points untouched; reports the sea-level crossing displacement', {
        deanA: number('meters^(1/3)', 'Dean profile scale A (fine sand 0.1..0.14)', { default: .1, min: .01, max: 1 }),
        offshoreMode: enumeration('cut lowers the seabed to the designed profile only where the seabed is shallower (the D2 behaviour); replace sets the seabed to the designed profile inside the offshore reach, depositing beach sand where it rises', ['cut', 'replace'], { default: 'cut' }),
        deanDepthMeters: number('meters', 'Depth below sea level where the Dean curve hands over to the shelf; null continues the Dean curve to the offshore reach', { default: null, min: .2, max: 100 }),
        shelfSlopeDegrees: number('degrees', 'Seaward slope of the planar shelf beyond the Dean handover', { default: 2, min: .1, max: 45 }),
        shelfFloorDepthMeters: number('meters', 'Depth below sea level where the shelf flattens', { default: 30, min: .5, max: 1000 }),
        foreshoreSlopeRatio: number('dimensionless', 'Foreshore slope as 1:N (horizontal meters per meter of rise; 20 is 1:20, about 2.9 degrees)', { default: 20, min: 2, max: 200 }),
        swashDepthMeters: number('meters', 'Depth below sea level where the straight foreshore starts (seaward end at swashDepthMeters times the ratio)', { default: 1, min: .1, max: 20 }),
        bermHeightMeters: number('meters', 'Berm crest height above sea level', { default: 1.8, min: 0, max: 20 }),
        bermDistanceMeters: number('meters', 'Distance of the berm crest from the waterline', { default: 30, min: 1, max: 500 }),
        bermFaceRunMeters: number('meters', 'Horizontal run of the steeper berm face between the foreshore top and the crest', { default: 6, min: .5, max: 100 }),
        bermWidthMeters: number('meters', 'Width of the flat berm', { default: 12, min: 0, max: 500 }),
        backshoreSlopeDegrees: number('degrees', 'Landward descent of the backshore behind the berm', { default: 1, min: 0, max: 30 }),
        beachBandMeters: number('meters', 'Landward reach of the profile from the waterline', { default: 120, min: 1, max: 5000 }),
        blendMeters: number('meters', 'Smoothstep width at the landward and seaward ends of the applied profile', { default: 20, min: 0, max: 1000 }),
        offshoreReachMeters: number('meters', 'Seaward reach of the Dean profile from the waterline', { default: 400, min: 1, max: 20000 }),
        surfDepthMeters: number('meters', 'Depth to which the profile seaward of the foreshore is classified surf', { default: 3, min: .2, max: 50 }),
        minSandMeters: number('meters', 'Minimum beach sand thickness kept on the applied profile', { default: .5, min: 0, max: 30 }),
        transectCount: integer('transects', 'Design-shoreline vertices, evenly spread, where the profile is measured', { default: 5, min: 1, max: 64 }),
        ...PLAN_PROTECTION_PARAMETERS
    }, ['height', 'shoreSigned', 'districtId'], ['height', 'bedrock', 'regolith', 'depositType', 'depositThickness', 'coastalZone']),
    'coastal-foredune': operator('coastal-foredune', 'coastal', 'Foredune ridge where the backshore has room: per design-shoreline station the free space landward of baseDistanceMeters (the berm\'s landward edge) up to the first district, road (half width plus roadMarginMeters), open-view corridor or bluff zone sample is measured along the shoreline normal; where it is at least minSpaceMeters a ridge with its crest crestDistanceMeters behind the base, heightMeters varied by world-anchored noise (heightVariationMeters at wavelengthMeters), a seaward face at seawardSlopeDegrees (its run clipped to the crest distance so the dune never starts on the berm: the effective slope is reported) and a lee face at leeSlopeDegrees inside widthMeters (the height is limited to fit and reported) is added as dune sand (depositType 5, coastalZone 8 where at least 0.2 m), fading out over blendMeters before the obstacle; protectPlan leaves districts, the plan beach points and the open-view corridor untouched; reports the sea-level crossing displacement', {
        baseDistanceMeters: number('meters', 'Distance from the design shoreline where the backshore starts (berm distance plus berm width)', { default: 42, min: 0, max: 1000 }),
        minSpaceMeters: number('meters', 'Free backshore width required before a dune is placed', { default: 40, min: 0, max: 1000 }),
        heightMeters: number('meters', 'Nominal crest height above the backshore', { default: 4, min: 0, max: 50 }),
        crestDistanceMeters: number('meters', 'Crest distance behind the base', { default: 20, min: 0, max: 500 }),
        widthMeters: number('meters', 'Footprint width; the faces at the declared slopes limit the height when they need more', { default: 40, min: 1, max: 1000 }),
        heightVariationMeters: number('meters', 'Bound of the crest height variation (two world-anchored octaves)', { default: 1.5, min: 0, max: 50 }),
        wavelengthMeters: number('meters', 'Largest wavelength of the crest variation', { default: 120, min: 1, max: 10000 }),
        seawardSlopeDegrees: number('degrees', 'Slope of the seaward face', { default: 8, min: 1, max: 60 }),
        leeSlopeDegrees: number('degrees', 'Slope of the lee face', { default: 20, min: 1, max: 60 }),
        roadMarginMeters: number('meters', 'Clearance beyond the half carriageway width that counts a road as an obstacle', { default: 5, min: 0, max: 100 }),
        blendMeters: number('meters', 'Fade of the dune before the obstacle that ends the free space', { default: 15, min: 0, max: 500 }),
        ...PLAN_PROTECTION_PARAMETERS
    }, ['height', 'shoreSigned', 'districtId', 'roadDistance', 'roadWidth', 'corridorMask', 'coastalZone'], ['height', 'bedrock', 'regolith', 'depositType', 'depositThickness', 'coastalZone']),
    'coastal-nearshore': operator('coastal-nearshore', 'coastal', 'Longshore bar: a raised-cosine bar of barWidthMeters and barHeightMeters above the surrounding seabed with its crest barDistanceMeters seaward of the design shoreline (null places it where the pre-operator seabed first reaches barDepthMeters along the shoreline normal of each station), a trough troughDepthMeters deep and troughWidthMeters wide on its landward side, the crest position wandering with world-anchored noise (wanderMeters at wavelengthMeters) and never raised above maxCrestDepthMeters below sea level; sand (depositType 4), coastalZone 3 over the bar core, scaled by the mask; reports the measured crest depth and distance', {
        barDepthMeters: number('meters', 'Seabed depth (negative, below sea level) on which the crest is centered when barDistanceMeters is null', { default: -2.5, min: -100, max: 0 }),
        barDistanceMeters: number('meters', 'Crest distance seaward of the design shoreline; null derives it from barDepthMeters', { default: null, min: 1, max: 5000 }),
        barHeightMeters: number('meters', 'Crest height above the surrounding seabed', { default: 1.2, min: 0, max: 20 }),
        barWidthMeters: number('meters', 'Full width of the bar', { default: 40, min: 1, max: 1000 }),
        troughDepthMeters: number('meters', 'Depth of the trough landward of the bar below the surrounding seabed', { default: .5, min: 0, max: 20 }),
        troughWidthMeters: number('meters', 'Full width of the trough', { default: 30, min: 1, max: 1000 }),
        wanderMeters: number('meters', 'Bound of the crest position wander', { default: 15, min: 0, max: 500 }),
        wavelengthMeters: number('meters', 'Largest wavelength of the wander (two octaves)', { default: 250, min: 1, max: 10000 }),
        maxCrestDepthMeters: number('meters', 'Shallowest crest allowed (negative, below sea level)', { default: -1.5, min: -100, max: 0 }),
        searchMeters: number('meters', 'How far seaward the barDepthMeters contour is sought when barDistanceMeters is null', { default: 600, min: 1, max: 20000 })
    }, ['height', 'shoreSigned'], ['height', 'bedrock', 'regolith', 'depositType', 'depositThickness', 'coastalZone']),
    'coastal-reef': operator('coastal-reef', 'coastal', 'Rocky reef where the mask selects: over the sea samples below maxDepthMeters the ridged world-anchored noise is thresholded at its exact quantile so coverageFraction of the masked area becomes reef, raised toward a top between minDepthMeters and maxDepthMeters (never above the latter) as reef rock (depositType 6, thickness equal to the raise, coastalZone 2 where at least 0.1 m); protectPlan keeps the southwest swim zone of the plan (derived from the design shoreline between Z 184 and 936) clean; reports the sea-level crossing displacement (zero by construction)', {
        minDepthMeters: number('meters', 'Reef top depth at the coverage threshold (negative, below sea level)', { default: -4, min: -100, max: 0 }),
        maxDepthMeters: number('meters', 'Shallowest reef top (negative, below sea level); samples already shallower are not eligible', { default: -1, min: -100, max: 0 }),
        coverageFraction: number('dimensionless', 'Share of the eligible masked samples that becomes reef', { default: .5, min: 0, max: 1 }),
        wavelengthsMeters: numbers('meters', 'Reef noise octave wavelengths, strictly decreasing', { minItems: 1, maxItems: 8, items: Object.freeze({ min: .5, max: 100000 }), default: Object.freeze([60, 30, 15]) }),
        amplitudes: numbers('dimensionless', 'Relative reef noise octave amplitudes', { minItems: 1, maxItems: 8, items: Object.freeze({ min: 0, max: 1 }), default: Object.freeze([1, .5, .25]) }),
        ridgedMix: number('dimensionless', 'Ridged-mix shaping weight of the reef noise', { default: .8, min: 0, max: 1 }),
        protectPlan: boolean('Keep the southwest swim zone of the plan free of reef (needs plan-inputs)', { default: true }),
        swimZone: PLAN_PROTECTION_PARAMETERS.swimZone
    }, ['height', 'shoreSigned'], ['height', 'bedrock', 'regolith', 'depositType', 'depositThickness', 'coastalZone']),
    resample: operator('resample', 'output', 'Resamples the working grid to the output grid (bounds unchanged, corners exact) with the declared filter; a no-op when the working grid is the output grid', {
        filter: enumeration('Interpolation filter: bilinear or bicubic (Catmull-Rom)', ['bilinear', 'bicubic'], { default: 'bicubic' })
    }, ['height'], ['height'])
});
