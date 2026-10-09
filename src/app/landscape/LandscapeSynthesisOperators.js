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

export const LANDSCAPE_SYNTHESIS_FAMILIES = Object.freeze(['inputs', 'landforms', 'warps', 'constraints', 'output']);

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

const operator = (op, family, description, parameters, reads, writes) => Object.freeze({ op, family, description, parameters: Object.freeze(parameters), layers: Object.freeze({ reads: Object.freeze(reads), writes: Object.freeze(writes) }) });

/** Operator catalog keyed by `op`. Units: meters, degrees, percent, samples, dimensionless; ids and enums carry unit `none`/`id`. */
export const LANDSCAPE_SYNTHESIS_OPERATORS = Object.freeze({
    'import-heights': operator('import-heights', 'inputs', 'Loads the source heights and land cover: the bound landscape directory (native chunks) or a float32 little-endian raw file with declared dimensions; a coarser working grid receives the separable tent average aligned to its samples', {
        source: enumeration('Height source', ['landscape', 'raw-float32'], { default: 'landscape' }),
        file: string('raw-float32: relative path of the row-major float32 little-endian heights (row 0 north)', { default: null, format: 'relative-path' }),
        columns: integer('samples', 'raw-float32: declared columns, equal to the recipe grid', { default: null, min: 2, max: 16385 }),
        rows: integer('samples', 'raw-float32: declared rows, equal to the recipe grid', { default: null, min: 2, max: 16385 }),
        coverFile: string('raw-float32: optional relative path of a uint8 land-cover raster with the same dimensions', { default: null, format: 'relative-path' }),
        coverClass: integer('id', 'raw-float32: land-cover class filled when no coverFile is given', { default: 2, min: 0, max: 255 }),
        filter: enumeration('Decimation filter from the native to a coarser working grid', ['tent', 'nearest'], { default: 'tent' })
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
    resample: operator('resample', 'output', 'Resamples the working grid to the output grid (bounds unchanged, corners exact) with the declared filter; a no-op when the working grid is the output grid', {
        filter: enumeration('Interpolation filter: bilinear or bicubic (Catmull-Rom)', ['bilinear', 'bicubic'], { default: 'bicubic' })
    }, ['height'], ['height'])
});
