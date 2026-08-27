// src/app/buildings/PortalFabricationCatalog.js
// AI 510: portal fabrication defs — the dedicated framework for entry portals,
// parallel to the window/door fabrication catalog.
//
// A portal is a BOX inserted into the facade (the facade opens to the box's
// rectangle; the box's own mass forms the walls around the entry, aligned
// with and proud of the facade plane). Into that box, nested inset LEVELS
// telescope inward — each level cuts a smaller hole into the previous face
// and steps deeper — until the innermost hole is the door opening (matching
// the actual door where it is inserted). If the door is arched, every level's
// hole can follow the arch contour (concentric with the door's cut circle)
// or stay rectangular. Everything else is decoration attached to elements:
// ring mouldings contouring a level's hole (semicircular rings over an arch,
// a rectangular frame otherwise), impost/base courses borrowing the facade
// decorator profiles (flat | stepped | molded), blind panel insets on the box
// face, engaged colonettes/pilasters, a frieze band, steps, and registered
// custom mesh parts (sculpted GLB ornaments) placeable anywhere on the face.
//
// Depth convention: level `depthMeters` steps INWARD (each level deeper than
// the previous); `box.projectionMeters` stands the box face proud of the
// facade. Levels are authored OUTERMOST first (level 0 is the hole in the
// box face). Part materials use the storefront-zone dialect (`match_wall` |
// `match_frame` | `pbr` | `slot`); an unset part material falls back to the
// def's own `palette` — never silently to the wall texture.
// @ts-check
import { normalizeStorefrontZoneMaterial } from './window_mesh/WindowFabricationCatalog.js';

export const PORTAL_RING_PROFILES = Object.freeze(['band', 'roll', 'cavetto']);
export const PORTAL_RING_JAMB_MODES = Object.freeze(['run', 'stop']);
// Impost/base cross-sections borrowed from the facade decorators (the
// cornice profile kit): 'wedge' is the impost console (projecting cap whose
// underside slopes back into the wall — the crown_molding section), 'skirt'
// the plinth foot (tall face, sloped top returning to the wall). 'flat',
// 'stepped' and 'molded' map onto the same kit.
export const PORTAL_DECOR_PROFILES = Object.freeze(['flat', 'stepped', 'molded', 'wedge', 'skirt']);
// Which walls a wrapped decoration (impost band, base plinth) applies to:
// the outer box faces, the inner reveal walls of the void, or both.
export const PORTAL_DECOR_WALLS = Object.freeze(['outer', 'inner', 'both']);
// 'capital' crowns each colonette/pilaster cluster (shafts shorten to leave
// room); 'face' places the part anywhere on the box face (offsetMeters.x =
// distance from the portal center, mirrored on both sides; offsetMeters.y =
// the part's base height above the threshold).
export const PORTAL_ORNAMENT_ANCHORS = Object.freeze(['springing', 'crown', 'jamb_base', 'capital', 'face']);
export const PORTAL_COLONETTE_SHAPES = Object.freeze(['round', 'pilaster']);
export const PORTAL_COLONETTE_TOPS = Object.freeze(['springing', 'arch_crown']);

// Default palette: a portal reads as composed trim, not the wall rerun.
const DEFAULT_PALETTE = Object.freeze({
    box: Object.freeze({ mode: 'pbr', materialId: 'pbr.limestone_smooth' }),
    level: Object.freeze({ mode: 'pbr', materialId: 'pbr.limestone_smooth' }),
    ring: Object.freeze({ mode: 'pbr', materialId: 'pbr.limestone_smooth' }),
    impost: Object.freeze({ mode: 'pbr', materialId: 'pbr.limestone_smooth' }),
    panel: Object.freeze({ mode: 'pbr', materialId: 'pbr.limestone_smooth' }),
    base: Object.freeze({ mode: 'pbr', materialId: 'pbr.limestone_smooth' }),
    colonettes: Object.freeze({ mode: 'pbr', materialId: 'pbr.limestone_smooth' }),
    frieze: Object.freeze({ mode: 'pbr', materialId: 'pbr.limestone_smooth' }),
    recess: Object.freeze({ mode: 'pbr', materialId: 'pbr.brownstone' }),
    steps: Object.freeze({ mode: 'pbr', materialId: 'pbr.limestone_smooth' }),
    custom: null
});

function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function normalizeZoneMaterialOrNull(value) {
    if (!value || typeof value !== 'object') return null;
    return normalizeStorefrontZoneMaterial(value, 'match_wall');
}

function normalizeDecorProfile(value, fallback) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return PORTAL_DECOR_PROFILES.includes(raw) ? raw : fallback;
}

function normalizeDecorWalls(value, fallback) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return PORTAL_DECOR_WALLS.includes(raw) ? raw : fallback;
}

function normalizePortalLevelSpec(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src || src.enabled === false) return null;
    const ringSrc = src.ring && typeof src.ring === 'object' && src.ring.enabled !== false ? src.ring : null;
    const profileRaw = typeof ringSrc?.profile === 'string' ? ringSrc.profile.trim().toLowerCase() : '';
    const jambsRaw = typeof ringSrc?.jambs === 'string' ? ringSrc.jambs.trim().toLowerCase() : '';
    return {
        // visible face-ring width of this level around the next hole
        frameWidthMeters: clampNumber(src.frameWidthMeters, 0.05, 0.9, 0.25),
        // step inward from the previous face to this level's face
        depthMeters: clampNumber(src.depthMeters, 0.05, 1.2, 0.3),
        // whether this level's hole follows the door's arch contour
        arch: src.arch !== false,
        // optional ring moulding contouring this level's hole, sitting on
        // the face OUTSIDE it (the archivolt)
        ring: ringSrc
            ? {
                widthMeters: clampNumber(ringSrc.widthMeters, 0.03, 0.45, 0.12),
                projectionMeters: clampNumber(ringSrc.projectionMeters, 0.02, 0.3, 0.06),
                profile: PORTAL_RING_PROFILES.includes(profileRaw) ? profileRaw : 'band',
                jambs: PORTAL_RING_JAMB_MODES.includes(jambsRaw) ? jambsRaw : 'run',
                material: normalizeZoneMaterialOrNull(ringSrc.material)
            }
            : null
    };
}

function normalizePortalPanelSpec(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src || src.enabled === false) return null;
    return {
        // center distance from the portal center; panels emit mirrored (±x)
        xMeters: clampNumber(src.xMeters, 0.0, 4.0, 1.0),
        // panel bottom height above the threshold
        yMeters: clampNumber(src.yMeters, 0.0, 6.0, 0.4),
        widthMeters: clampNumber(src.widthMeters, 0.1, 1.5, 0.4),
        heightMeters: clampNumber(src.heightMeters, 0.2, 5.0, 1.6),
        depthMeters: clampNumber(src.depthMeters, 0.01, 0.12, 0.04)
    };
}

function normalizePortalCustomPartSpec(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src || src.enabled === false) return null;
    const part = typeof src.part === 'string' ? src.part.trim() : '';
    if (!part) return null;
    const anchorRaw = typeof src.anchor === 'string' ? src.anchor.trim().toLowerCase() : '';
    const offsetSrc = src.offsetMeters && typeof src.offsetMeters === 'object' ? src.offsetMeters : {};
    const anchor = PORTAL_ORNAMENT_ANCHORS.includes(anchorRaw) ? anchorRaw : 'springing';
    const mountRaw = typeof src.mount === 'string' ? src.mount.trim().toLowerCase() : '';
    return {
        part,
        anchor,
        // 'relief' mounts the part like a 3D decal ON the wall — its back
        // half embeds in the face, only the sculpted front projects (the
        // reference capitals). 'proud' places it free-standing. Face-anchored
        // parts default to relief.
        mount: mountRaw === 'relief' || mountRaw === 'proud' ? mountRaw : (anchor === 'face' ? 'relief' : 'proud'),
        // target height of the part; the loader derives the uniform scale
        scaleMeters: clampNumber(src.scaleMeters, 0.05, 2.0, 0.3),
        offsetMeters: {
            x: clampNumber(offsetSrc.x, -4.0, 4.0, 0.0),
            y: clampNumber(offsetSrc.y, -4.0, 6.0, 0.0),
            out: clampNumber(offsetSrc.out, -1.0, 1.0, 0.0)
        },
        material: normalizeZoneMaterialOrNull(src.material)
    };
}

/**
 * Normalizes one portal fabrication def. Returns null for disabled/idless
 * input. Sub-part configs reuse the AI 488/509 portal-part shapes so the
 * generator's emitters serve both the legacy config and defs.
 */
export function normalizePortalFabricationDef(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src || src.enabled === false) return null;
    const id = typeof src.id === 'string' ? src.id.trim() : '';
    if (!id) return null;

    const paletteSrc = src.palette && typeof src.palette === 'object' ? src.palette : {};
    const palette = {};
    for (const key of Object.keys(DEFAULT_PALETTE)) {
        palette[key] = normalizeZoneMaterialOrNull(paletteSrc[key]) ?? (DEFAULT_PALETTE[key] ? { ...DEFAULT_PALETTE[key] } : null);
    }

    const boxSrc = src.box && typeof src.box === 'object' ? src.box : {};
    const levels = (Array.isArray(src.levels) ? src.levels : [])
        .map((entry) => normalizePortalLevelSpec(entry))
        .filter((entry) => !!entry)
        .slice(0, 4);
    const panels = (Array.isArray(src.panels) ? src.panels : [])
        .map((entry) => normalizePortalPanelSpec(entry))
        .filter((entry) => !!entry)
        .slice(0, 6);

    const impostSrc = src.impost && typeof src.impost === 'object' ? src.impost : {};
    const baseSrc = src.base && typeof src.base === 'object' && src.base.enabled !== false && src.base.heightMeters !== undefined
        ? src.base
        : null;
    const custom = (Array.isArray(src.custom) ? src.custom : [])
        .map((entry) => normalizePortalCustomPartSpec(entry))
        .filter((entry) => !!entry)
        .slice(0, 8);

    return {
        id,
        name: typeof src.name === 'string' && src.name ? src.name : id,
        box: {
            // pier width the box face keeps beside the outermost hole
            sideMarginMeters: clampNumber(boxSrc.sideMarginMeters, 0.15, 1.5, 0.6),
            // box face height above the outermost hole's crown
            topMarginMeters: clampNumber(boxSrc.topMarginMeters, 0.1, 1.5, 0.5),
            // how proud the box face stands of the facade plane
            projectionMeters: clampNumber(boxSrc.projectionMeters, 0.0, 0.4, 0.12),
            material: normalizeZoneMaterialOrNull(boxSrc.material)
        },
        levels,
        impost: {
            heightMeters: clampNumber(impostSrc.heightMeters, 0.05, 0.5, 0.16),
            projectionMeters: clampNumber(impostSrc.projectionMeters, 0.0, 0.4, 0.05),
            profile: normalizeDecorProfile(impostSrc.profile, 'wedge'),
            // outer = under the stop-ring springing; inner = a band across
            // the reveal walls inside the void at the springing line.
            walls: normalizeDecorWalls(impostSrc.walls, 'outer'),
            material: normalizeZoneMaterialOrNull(impostSrc.material)
        },
        panels,
        base: baseSrc
            ? {
                heightMeters: clampNumber(baseSrc.heightMeters, 0.05, 0.8, 0.25),
                projectionMeters: clampNumber(baseSrc.projectionMeters, 0.01, 0.3, 0.06),
                profile: normalizeDecorProfile(baseSrc.profile, 'skirt'),
                // 'both' circulates the plinth around the entire structure:
                // the outer piers AND the reveal walls inside the void.
                walls: normalizeDecorWalls(baseSrc.walls, 'outer'),
                material: normalizeZoneMaterialOrNull(baseSrc.material)
            }
            : null,
        colonettes: src.colonettes && typeof src.colonettes === 'object' && src.colonettes.enabled === true
            ? (() => {
                const shapeRaw = typeof src.colonettes.shape === 'string' ? src.colonettes.shape.trim().toLowerCase() : '';
                const topRaw = typeof src.colonettes.top === 'string' ? src.colonettes.top.trim().toLowerCase() : '';
                return {
                    enabled: true,
                    // 'round' = engaged cylindrical colonettes; 'pilaster' =
                    // broad rectangular piers.
                    shape: PORTAL_COLONETTE_SHAPES.includes(shapeRaw) ? shapeRaw : 'round',
                    countPerSide: Math.max(1, Math.min(2, Math.round(Number(src.colonettes.countPerSide) || 1))),
                    radiusMeters: clampNumber(src.colonettes.radiusMeters, 0.03, 0.3, 0.09),
                    widthMeters: clampNumber(src.colonettes.widthMeters, 0.2, 1.2, 0.6),
                    projectionMeters: clampNumber(src.colonettes.projectionMeters, 0.05, 0.5, 0.16),
                    gapMeters: clampNumber(src.colonettes.gapMeters, 0.0, 0.6, 0.05),
                    // Where the shaft assembly tops out: the arch springing
                    // line, or the crown of the outermost level's hole.
                    top: PORTAL_COLONETTE_TOPS.includes(topRaw) ? topRaw : 'springing',
                    material: normalizeZoneMaterialOrNull(src.colonettes.material)
                };
            })()
            : null,
        frieze: src.frieze && typeof src.frieze === 'object' && src.frieze.enabled === true
            ? {
                enabled: true,
                heightMeters: clampNumber(src.frieze.heightMeters, 0.1, 1.5, 0.5),
                depthMeters: clampNumber(src.frieze.depthMeters, 0.02, 0.5, 0.08),
                widthPaddingMeters: clampNumber(src.frieze.widthPaddingMeters, 0.0, 1.5, 0.3),
                yOffsetMeters: clampNumber(src.frieze.yOffsetMeters, -2.0, 3.0, 0.0),
                material: normalizeZoneMaterialOrNull(src.frieze.material)
            }
            : null,
        steps: src.steps && typeof src.steps === 'object'
            ? {
                count: Math.max(0, Math.min(8, Math.round(Number(src.steps.count) || 0))),
                riseMeters: clampNumber(src.steps.riseMeters, 0.05, 0.3, 0.15),
                treadDepthMeters: clampNumber(src.steps.treadDepthMeters, 0.15, 0.6, 0.32),
                widthPaddingMeters: clampNumber(src.steps.widthPaddingMeters, 0.0, 1.0, 0.25),
                material: normalizeZoneMaterialOrNull(src.steps.material)
            }
            : null,
        custom,
        palette
    };
}

// ---------------------------------------------------------------------------
// Stock defs
// ---------------------------------------------------------------------------
// Classical two-level entry: a limestone box with a stopped archivolt ring on
// the box face landing on molded imposts, a second deep level stepping down
// to the recessed door, coupled colonettes crowned by the foliate-capital
// ornament, and one step.
const PORTAL_FABRICATION_CATALOG = Object.freeze([
    Object.freeze({
        id: 'portal_classical_orders',
        name: 'Classical Orders Entry',
        box: { sideMarginMeters: 0.5, topMarginMeters: 0.45, projectionMeters: 0.1 },
        levels: [
            {
                frameWidthMeters: 0.16,
                depthMeters: 0.14,
                arch: true,
                ring: { widthMeters: 0.13, projectionMeters: 0.07, profile: 'band', jambs: 'stop' }
            },
            {
                frameWidthMeters: 0.12,
                depthMeters: 0.32,
                arch: true,
                ring: { widthMeters: 0.09, projectionMeters: 0.045, profile: 'roll', jambs: 'run' }
            }
        ],
        impost: { heightMeters: 0.15, projectionMeters: 0.05, profile: 'stepped' },
        colonettes: { enabled: true, countPerSide: 2, radiusMeters: 0.085, gapMeters: 0.06 },
        steps: { count: 1, riseMeters: 0.12, treadDepthMeters: 0.34, widthPaddingMeters: 0.35 },
        custom: [
            { part: 'foliate_capital', anchor: 'capital', scaleMeters: 0.3, offsetMeters: { x: 0.0, y: 0.0, out: 0.02 } }
        ],
        palette: {
            box: { mode: 'pbr', materialId: 'pbr.limestone_smooth' },
            level: { mode: 'pbr', materialId: 'pbr.limestone_smooth' },
            ring: { mode: 'pbr', materialId: 'pbr.limestone_smooth' },
            impost: { mode: 'pbr', materialId: 'pbr.limestone_smooth' },
            colonettes: { mode: 'pbr', materialId: 'pbr.terracotta_smooth' },
            recess: { mode: 'pbr', materialId: 'pbr.brownstone' },
            steps: { mode: 'pbr', materialId: 'pbr.limestone_smooth' },
            custom: { mode: 'pbr', materialId: 'pbr.terracotta_smooth' }
        }
    })
]);

export function getPortalFabricationCatalogEntries() {
    return PORTAL_FABRICATION_CATALOG
        .map((entry) => normalizePortalFabricationDef(entry))
        .filter((entry) => !!entry);
}

export function getPortalFabricationCatalogEntryById(id) {
    const wanted = typeof id === 'string' ? id.trim() : '';
    if (!wanted) return null;
    return getPortalFabricationCatalogEntries().find((entry) => entry.id === wanted) ?? null;
}
