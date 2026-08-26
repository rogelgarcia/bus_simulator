// src/app/buildings/RooftopPropsModel.js
// Rooftop props feature model (AI 492): ONE rooftop feature with a prop set and
// placement rules — not one feature per prop type. Prop kinds are modes:
//   - `water_tower`: wooden tank on a steel leg frame (the NYC skyline shape).
//   - `roof_bulkhead`: roof-access box with a door face.
//   - `mech_box`: HVAC-style boxes.
//   - `vent_pipe`: cheap filler pipe.
// Like FacadeAttachmentsModel this module is three-free: it returns placement
// data (positions, rotations, sizes) that the generator turns into geometry, so
// the generator, the BF2 GUI and node unit tests all share one normalizer and
// one solver.
// @ts-check

export const ROOFTOP_PROP_TYPE = Object.freeze({
    WATER_TOWER: 'water_tower',
    ROOF_BULKHEAD: 'roof_bulkhead',
    MECH_BOX: 'mech_box',
    VENT_PIPE: 'vent_pipe'
});

/**
 * Material roles shared by the whole prop set: one palette drives every prop
 * kind, so a config (or a `slot:<name>` reference) recolors the roof as a unit
 * instead of per prop type.
 */
export const ROOFTOP_PROP_MATERIAL_ROLE = Object.freeze({
    TANK: 'tank',
    FRAME: 'frame',
    BULKHEAD: 'bulkhead',
    MECH: 'mech'
});

export const ROOFTOP_PROP_MATERIAL_ROLE_IDS = Object.freeze([
    ROOFTOP_PROP_MATERIAL_ROLE.TANK,
    ROOFTOP_PROP_MATERIAL_ROLE.FRAME,
    ROOFTOP_PROP_MATERIAL_ROLE.BULKHEAD,
    ROOFTOP_PROP_MATERIAL_ROLE.MECH
]);

export const ROOFTOP_PROP_TYPE_IDS = Object.freeze([
    ROOFTOP_PROP_TYPE.WATER_TOWER,
    ROOFTOP_PROP_TYPE.ROOF_BULKHEAD,
    ROOFTOP_PROP_TYPE.MECH_BOX,
    ROOFTOP_PROP_TYPE.VENT_PIPE
]);

/**
 * Prop catalog: footprint (metres, unrotated) and height per size variant, plus
 * the scatter rule that scales counts by roof area. `perSquareMeter` sets the
 * slope, `minCount` guarantees the signature props appear on any roof large
 * enough (`minRoofAreaSqM`), `maxCount` keeps dense roofs from turning to soup.
 * Ordered biggest-first: the solver places in catalog order so the water tower
 * claims a good spot before the filler pipes crowd it out.
 */
export const ROOFTOP_PROP_CATALOG = Object.freeze({
    [ROOFTOP_PROP_TYPE.WATER_TOWER]: Object.freeze({
        scatter: Object.freeze({ perSquareMeter: 1 / 450, minCount: 1, maxCount: 2, minRoofAreaSqM: 55 }),
        variants: Object.freeze([
            Object.freeze({ id: 'small', widthMeters: 3.0, depthMeters: 3.0, heightMeters: 6.9 }),
            Object.freeze({ id: 'large', widthMeters: 3.9, depthMeters: 3.9, heightMeters: 8.7 })
        ])
    }),
    [ROOFTOP_PROP_TYPE.ROOF_BULKHEAD]: Object.freeze({
        scatter: Object.freeze({ perSquareMeter: 1 / 300, minCount: 1, maxCount: 2, minRoofAreaSqM: 45 }),
        variants: Object.freeze([
            Object.freeze({ id: 'small', widthMeters: 2.4, depthMeters: 2.0, heightMeters: 2.5 }),
            Object.freeze({ id: 'large', widthMeters: 3.4, depthMeters: 2.6, heightMeters: 3.0 })
        ])
    }),
    [ROOFTOP_PROP_TYPE.MECH_BOX]: Object.freeze({
        scatter: Object.freeze({ perSquareMeter: 1 / 110, minCount: 1, maxCount: 6, minRoofAreaSqM: 25 }),
        variants: Object.freeze([
            Object.freeze({ id: 'small', widthMeters: 1.2, depthMeters: 0.9, heightMeters: 0.8 }),
            Object.freeze({ id: 'medium', widthMeters: 1.8, depthMeters: 1.2, heightMeters: 1.1 }),
            Object.freeze({ id: 'large', widthMeters: 2.6, depthMeters: 1.6, heightMeters: 1.4 })
        ])
    }),
    [ROOFTOP_PROP_TYPE.VENT_PIPE]: Object.freeze({
        scatter: Object.freeze({ perSquareMeter: 1 / 90, minCount: 1, maxCount: 8, minRoofAreaSqM: 12 }),
        variants: Object.freeze([
            Object.freeze({ id: 'short', widthMeters: 0.34, depthMeters: 0.34, heightMeters: 0.85 }),
            Object.freeze({ id: 'tall', widthMeters: 0.4, depthMeters: 0.4, heightMeters: 1.6 })
        ])
    })
});

export const ROOFTOP_PROPS_DEFAULTS = Object.freeze({
    enabled: false,
    density: 1.0,
    edgeMarginMeters: 1.1,
    minSpacingMeters: 0.7,
    seedOffset: 0
});

const PLACEMENT_ATTEMPTS = 64;

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, Math.round(num)));
}

function normalizeMaterialRef(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
        const raw = value.trim();
        return raw ? raw : null;
    }
    if (typeof value !== 'object') return null;
    const kind = typeof value.kind === 'string' ? value.kind.trim() : '';
    if (!kind) return null;
    const id = typeof value.id === 'string' ? value.id.trim() : '';
    if (kind === 'match_wall') return { kind };
    return id ? { kind, id } : null;
}

/**
 * FNV-1a over the composed key mixed with the building seed, matching the
 * hashing used by facade attachments so both features stay stable across
 * rebuilds of the same city.
 */
export function hashRooftopKeyToUnit(seed, key, seedOffset = 0) {
    const s = (Number(seed) >>> 0) ^ ((clampInt(seedOffset, -99999, 99999, 0) * 2654435761) >>> 0);
    let h = (0x811c9dc5 ^ s) >>> 0;
    const text = String(key ?? '');
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d) >>> 0;
    h ^= h >>> 12;
    h = Math.imul(h, 0x297a2d39) >>> 0;
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}

function createSeededStream(seed, seedOffset, salt) {
    let state = (Math.floor(hashRooftopKeyToUnit(seed, salt, seedOffset) * 4294967296) >>> 0) || 0x9e3779b9;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
        t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function normalizeExplicitPlacement(src, index) {
    const type = typeof src?.type === 'string' ? src.type.trim().toLowerCase() : '';
    if (!ROOFTOP_PROP_TYPE_IDS.includes(type)) return null;
    const variants = ROOFTOP_PROP_CATALOG[type].variants;
    const variantId = typeof src?.variantId === 'string' ? src.variantId.trim() : '';
    const variant = variants.find((v) => v.id === variantId) ?? variants[0];
    const x = Number(src?.x);
    const z = Number(src?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return {
        id: typeof src?.id === 'string' && src.id ? src.id : `rooftop_prop_${index + 1}`,
        type,
        variantId: variant.id,
        x,
        z,
        rotationDegrees: clamp(src?.rotationDegrees, -360, 360, 0)
    };
}

/**
 * Normalizes a roof-layer `props` block. Returns null when the feature is off
 * or nothing survives, so callers can skip the whole solve.
 */
export function normalizeRooftopPropsConfig(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;
    if (src.enabled !== true) return null;

    const typesRaw = Array.isArray(src.types) ? src.types : null;
    const types = typesRaw
        ? typesRaw
            .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
            .filter((t, i, list) => ROOFTOP_PROP_TYPE_IDS.includes(t) && list.indexOf(t) === i)
        : ROOFTOP_PROP_TYPE_IDS.slice();
    if (!types.length) return null;

    const placementsRaw = Array.isArray(src.placements) ? src.placements : [];
    const placements = [];
    for (let i = 0; i < placementsRaw.length && placements.length < 32; i++) {
        const placement = normalizeExplicitPlacement(placementsRaw[i], i);
        if (placement) placements.push(placement);
    }

    const materialsSrc = src.materials && typeof src.materials === 'object' ? src.materials : {};
    return {
        enabled: true,
        density: clamp(src.density, 0.0, 3.0, ROOFTOP_PROPS_DEFAULTS.density),
        edgeMarginMeters: clamp(src.edgeMarginMeters, 0.0, 8.0, ROOFTOP_PROPS_DEFAULTS.edgeMarginMeters),
        minSpacingMeters: clamp(src.minSpacingMeters, 0.0, 8.0, ROOFTOP_PROPS_DEFAULTS.minSpacingMeters),
        seedOffset: clampInt(src.seedOffset, -99999, 99999, ROOFTOP_PROPS_DEFAULTS.seedOffset),
        types,
        placements,
        materials: {
            tank: normalizeMaterialRef(materialsSrc.tank),
            frame: normalizeMaterialRef(materialsSrc.frame),
            bulkhead: normalizeMaterialRef(materialsSrc.bulkhead),
            mech: normalizeMaterialRef(materialsSrc.mech)
        }
    };
}

function signedArea(loop) {
    let sum = 0;
    for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        sum += (a.x * b.z) - (b.x * a.z);
    }
    return sum * 0.5;
}

function isPointInLoop(loop, x, z) {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const zi = loop[i].z;
        const zj = loop[j].z;
        if ((zi > z) === (zj > z)) continue;
        const t = (z - zi) / (zj - zi);
        if (x < loop[i].x + t * (loop[j].x - loop[i].x)) inside = !inside;
    }
    return inside;
}

function distanceToSegment(px, pz, ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = (dx * dx) + (dz * dz);
    const t = lenSq > 0 ? Math.max(0, Math.min(1, (((px - ax) * dx) + ((pz - az) * dz)) / lenSq)) : 0;
    const cx = ax + (dx * t);
    const cz = az + (dz * t);
    return Math.hypot(px - cx, pz - cz);
}

function distanceToLoop(loop, x, z) {
    let best = Infinity;
    for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        const d = distanceToSegment(x, z, a.x, a.z, b.x, b.z);
        if (d < best) best = d;
    }
    return best;
}

function sanitizeLoop(loop) {
    if (!Array.isArray(loop)) return null;
    const out = [];
    for (const point of loop) {
        const x = Number(point?.x);
        const z = Number(point?.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
        const last = out[out.length - 1];
        if (last && Math.abs(last.x - x) < 1e-6 && Math.abs(last.z - z) < 1e-6) continue;
        out.push({ x, z });
    }
    if (out.length >= 2) {
        const first = out[0];
        const last = out[out.length - 1];
        if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.z - last.z) < 1e-6) out.pop();
    }
    return out.length >= 3 ? out : null;
}

/**
 * Yaw (degrees) that lines a prop's local +X axis up with the polygon edge
 * nearest to a point. Boxy props square up to the parapet they sit next to
 * instead of floating at a random angle, which is what makes a scatter read as
 * intentional rather than spilled.
 */
function nearestEdgeHeadingDegrees(loop, x, z) {
    let best = Infinity;
    let heading = 0;
    for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        const d = distanceToSegment(x, z, a.x, a.z, b.x, b.z);
        if (d >= best) continue;
        best = d;
        heading = Math.atan2(-(b.z - a.z), b.x - a.x) * (180 / Math.PI);
    }
    return heading;
}

function makeRegion({ outerLoop, holeLoops }) {
    const outer = sanitizeLoop(outerLoop);
    if (!outer) return null;
    const holes = [];
    for (const hole of Array.isArray(holeLoops) ? holeLoops : []) {
        const sanitized = sanitizeLoop(hole);
        if (sanitized) holes.push(sanitized);
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of outer) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    const holeArea = holes.reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0);
    return {
        outer,
        holes,
        bounds: { minX, maxX, minZ, maxZ },
        areaSqM: Math.max(0, Math.abs(signedArea(outer)) - holeArea)
    };
}

/**
 * Clearance from a point to the usable roof area: how far the point can grow in
 * every direction before it crosses the roof edge or falls into a courtyard.
 * Negative when the point is outside the roof entirely.
 */
function clearanceInRegion(region, x, z) {
    if (!isPointInLoop(region.outer, x, z)) return -1;
    let clearance = distanceToLoop(region.outer, x, z);
    for (const hole of region.holes) {
        if (isPointInLoop(hole, x, z)) return -1;
        clearance = Math.min(clearance, distanceToLoop(hole, x, z));
    }
    return clearance;
}

function footprintRadius(variant) {
    return Math.hypot(variant.widthMeters, variant.depthMeters) * 0.5;
}

function resolveVariant(type, variantId) {
    const variants = ROOFTOP_PROP_CATALOG[type].variants;
    return variants.find((v) => v.id === variantId) ?? variants[0];
}

function makePlacement({ id, type, variant, x, z, rotationDegrees, source }) {
    return {
        id,
        type,
        variantId: variant.id,
        x,
        z,
        rotationDegrees,
        widthMeters: variant.widthMeters,
        depthMeters: variant.depthMeters,
        heightMeters: variant.heightMeters,
        radiusMeters: footprintRadius(variant),
        source
    };
}

function resolveScatterCount({ type, areaSqM, density }) {
    const rule = ROOFTOP_PROP_CATALOG[type].scatter;
    if (areaSqM < rule.minRoofAreaSqM) return 0;
    const scaled = Math.round(areaSqM * rule.perSquareMeter * density);
    return Math.max(rule.minCount, Math.min(rule.maxCount, scaled));
}

/**
 * Seeded deterministic scatter over the roof slab. Explicit config placements
 * land first (and are rejected with a warning when they violate the margin, so
 * a hero building cannot silently hang a water tower over the street); the
 * remaining props are dart-thrown biggest-first against the same rules.
 *
 * @returns {Array<object>} placements in the loop's coordinate space, y is the
 *   roof surface (the caller adds the roof height).
 */
export function solveRooftopPropPlacements({
    config = null,
    outerLoop = null,
    holeLoops = null,
    seed = 0,
    warnings = null
} = {}) {
    const cfg = normalizeRooftopPropsConfig(config);
    if (!cfg) return [];
    const region = makeRegion({ outerLoop, holeLoops });
    if (!region) return [];

    const placed = [];
    const fits = (x, z, radius) => {
        const clearance = clearanceInRegion(region, x, z);
        if (clearance < radius + cfg.edgeMarginMeters) return false;
        for (const other of placed) {
            const gap = Math.hypot(x - other.x, z - other.z) - radius - other.radiusMeters;
            if (gap < cfg.minSpacingMeters) return false;
        }
        return true;
    };

    for (const placement of cfg.placements) {
        if (!cfg.types.includes(placement.type)) continue;
        const variant = resolveVariant(placement.type, placement.variantId);
        if (!fits(placement.x, placement.z, footprintRadius(variant))) {
            warnings?.push(`Rooftop props: explicit placement "${placement.id}" does not fit the roof margin; skipped.`);
            continue;
        }
        placed.push(makePlacement({
            id: placement.id,
            type: placement.type,
            variant,
            x: placement.x,
            z: placement.z,
            rotationDegrees: placement.rotationDegrees,
            source: 'explicit'
        }));
    }

    const { minX, maxX, minZ, maxZ } = region.bounds;
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;

    for (const type of ROOFTOP_PROP_TYPE_IDS) {
        if (!cfg.types.includes(type)) continue;
        const alreadyPlaced = placed.filter((p) => p.type === type).length;
        const count = resolveScatterCount({ type, areaSqM: region.areaSqM, density: cfg.density }) - alreadyPlaced;
        if (count <= 0) continue;

        const variants = ROOFTOP_PROP_CATALOG[type].variants;
        for (let i = 0; i < count; i++) {
            const rand = createSeededStream(seed, cfg.seedOffset, `${type}:${i}`);
            const variant = variants[Math.min(variants.length - 1, Math.floor(rand() * variants.length))];
            const radius = footprintRadius(variant);

            let chosen = null;
            for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
                const x = minX + (rand() * spanX);
                const z = minZ + (rand() * spanZ);
                const quarterTurn = rand() < 0.5 ? 0 : 90;
                if (!fits(x, z, radius)) continue;
                chosen = { x, z, rotationDegrees: nearestEdgeHeadingDegrees(region.outer, x, z) + quarterTurn };
                break;
            }
            if (!chosen) break;

            placed.push(makePlacement({
                id: `${type}_${i + 1}`,
                type,
                variant,
                x: chosen.x,
                z: chosen.z,
                rotationDegrees: chosen.rotationDegrees,
                source: 'scatter'
            }));
        }
    }

    return placed;
}

export const ROOFTOP_PROP_OPTIONS = Object.freeze([
    Object.freeze({ id: ROOFTOP_PROP_TYPE.WATER_TOWER, label: 'Water tower' }),
    Object.freeze({ id: ROOFTOP_PROP_TYPE.ROOF_BULKHEAD, label: 'Bulkhead' }),
    Object.freeze({ id: ROOFTOP_PROP_TYPE.MECH_BOX, label: 'Mech box' }),
    Object.freeze({ id: ROOFTOP_PROP_TYPE.VENT_PIPE, label: 'Vent pipe' })
]);

// Preview configs — minimal buildings the BF2 GUI feeds to its config
// thumbnail renderer so the rooftop section can show what each prop looks like.
// One explicit centred placement per config, which also keeps the scatter from
// adding a second prop of the same kind.
const PREVIEW_FOOTPRINT_LOOP = Object.freeze([
    Object.freeze({ x: -6, z: -5 }),
    Object.freeze({ x: 6, z: -5 }),
    Object.freeze({ x: 6, z: 5 }),
    Object.freeze({ x: -6, z: 5 })
]);

function makeRooftopPropPreviewConfig(type) {
    const variants = ROOFTOP_PROP_CATALOG[type].variants;
    const variantId = variants[variants.length - 1].id;
    return {
        id: `rooftop_prop_preview_${type}`,
        name: 'Rooftop prop preview',
        footprintLoops: [PREVIEW_FOOTPRINT_LOOP.map((point) => ({ x: point.x, z: point.z }))],
        layers: [
            {
                id: 'floor_1',
                type: 'floor',
                floors: 2,
                floorHeight: 3.4,
                material: { kind: 'texture', id: 'pbr.beige_wall_001' }
            },
            {
                id: 'roof_1',
                type: 'roof',
                ring: { enabled: true, outerRadius: 0.0, innerRadius: 0.35, height: 0.5 },
                props: {
                    enabled: true,
                    types: [type],
                    // Local +Z carries the door / louvre face; 45 degrees turns
                    // it toward the thumbnail camera.
                    placements: [{ id: `preview_${type}`, type, variantId, x: 0, z: 0, rotationDegrees: 45 }]
                }
            }
        ]
    };
}

export function getRooftopPropPreviewConfigs() {
    return ROOFTOP_PROP_TYPE_IDS.map((type) => makeRooftopPropPreviewConfig(type));
}

/**
 * Footprint corners of a placement in the roof's coordinate space. The bounds
 * test uses this to assert every prop sits inside the roof minus its margin.
 */
export function computeRooftopPropFootprintCorners(placement) {
    const halfW = (Number(placement?.widthMeters) || 0) * 0.5;
    const halfD = (Number(placement?.depthMeters) || 0) * 0.5;
    const rad = (Number(placement?.rotationDegrees) || 0) * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const x = Number(placement?.x) || 0;
    const z = Number(placement?.z) || 0;
    return [
        [halfW, halfD],
        [-halfW, halfD],
        [-halfW, -halfD],
        [halfW, -halfD]
    ].map(([lx, lz]) => ({
        x: x + (lx * cos) + (lz * sin),
        z: z - (lx * sin) + (lz * cos)
    }));
}
