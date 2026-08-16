// src/app/buildings/window_mesh/ParallaxPanelOverscan.js
// Parallax interior panel overscan (AI 496).
//
// The interior parallax panel sits a short distance BEHIND the glass plane.
// When the panel is exactly opening-sized, a ray entering through the opening
// at a grazing angle can pass beside the panel and hit whatever is behind it —
// the bright L-shaped sliver along the reveal reported in the bug.
//
// Fix: oversize the panel proportionally to how deep it sits. A ray entering
// at angle theta from the surface normal travels `depth * tan(theta)` across
// the opening plane before reaching the panel plane, so extending the panel by
// that much on every side keeps it in front of every sightline up to theta.
//
// The extension is clamped twice: by an absolute cap (panels never balloon)
// and by the wall gap to the neighboring opening (an oversized panel must
// never reach into a neighbor's opening or past a wall edge).
//
// Three-free so the geometry builder, the generator and node tests share one
// implementation.
// @ts-check

/**
 * Grazing angle (degrees from the surface normal) the panel must still cover.
 * 72 deg (tan ~= 3.08) covers street-level gameplay sightlines — at a steeper
 * angle the opening itself is nearly edge-on and the frame occludes the gap.
 */
export const PARALLAX_PANEL_MAX_GRAZING_ANGLE_DEG = 72;

/** Absolute per-side cap, so a deep panel cannot balloon without bound. */
export const PARALLAX_PANEL_MAX_OVERSCAN_METERS = 0.5;

/**
 * Fraction of the wall gap an overscan may consume. Below 1.0 so two adjacent
 * panels never quite touch each other's opening edge.
 */
const NEIGHBOR_GAP_SAFETY = 0.9;

function clampNumber(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

/**
 * Finite number, or null for "unset". Never routes null/undefined/'' through
 * `Number()` — `Number(null)` is a finite 0, which would read as "no gap" and
 * silently collapse the overscan to zero.
 */
function toFiniteOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

/**
 * Geometric distance between the glass plane and the interior panel plane, in
 * window-local Z. Mirrors the placement math in WindowMeshGenerator:
 *   glassZ    = frame.depth + glass.zOffset
 *   interiorZ = glassZ + min(-0.02, shade ? shade.zOffset - 0.02 : -0.02)
 *               + interior.zOffset
 * Returns a positive depth (0 when the panel is not behind the glass).
 *
 * @param {object} settings sanitized window mesh settings
 * @returns {number} meters
 */
export function resolveParallaxPanelDepthMeters(settings) {
    const s = settings && typeof settings === 'object' ? settings : null;
    if (!s) return 0;
    const shadeEnabled = !!s.shade?.enabled;
    const shadeZOffset = Number(s.shade?.zOffset) || 0;
    const interiorZOffset = Number(s.interior?.zOffset) || 0;
    const behind = Math.min(-0.02, shadeEnabled ? (shadeZOffset - 0.02) : -0.02) + interiorZOffset;
    // `behind` is the signed offset from the glass plane; the panel is behind
    // the glass when it is negative.
    return Math.max(0, -behind);
}

/**
 * Per-side panel extension for a panel sitting `depthMeters` behind the glass.
 *
 * @param {object} options
 * @param {number} options.depthMeters distance behind the glass plane
 * @param {number} [options.maxGrazingAngleDeg]
 * @param {number} [options.maxOverscanMeters] absolute cap
 * @param {number|null} [options.neighborGapMeters] wall gap to the nearest
 *   adjacent opening (or wall edge); null/non-finite = unconstrained
 * @returns {number} meters (0 when the panel is not behind the glass)
 */
export function computeParallaxPanelOverscanMeters({
    depthMeters,
    maxGrazingAngleDeg = PARALLAX_PANEL_MAX_GRAZING_ANGLE_DEG,
    maxOverscanMeters = PARALLAX_PANEL_MAX_OVERSCAN_METERS,
    neighborGapMeters = null
} = {}) {
    const depth = clampNumber(depthMeters, 0, 100, 0);
    if (!(depth > 1e-6)) return 0;

    const angle = clampNumber(maxGrazingAngleDeg, 0, 89, PARALLAX_PANEL_MAX_GRAZING_ANGLE_DEG);
    const raw = depth * Math.tan(angle * (Math.PI / 180));

    let out = Math.min(raw, clampNumber(maxOverscanMeters, 0, 100, PARALLAX_PANEL_MAX_OVERSCAN_METERS));

    const gap = toFiniteOrNull(neighborGapMeters);
    if (gap !== null) {
        out = Math.min(out, Math.max(0, gap) * NEIGHBOR_GAP_SAFETY);
    }
    return Math.max(0, out);
}

/**
 * Convenience: resolve the overscan straight from sanitized settings.
 * `settings.interior.overscanClampMeters` carries the generator's per-placement
 * neighbor-gap clamp (see estimateOpeningNeighborGapMeters in the fabrication
 * generator); it is null/undefined when unconstrained.
 *
 * @param {object} settings sanitized window mesh settings
 * @returns {number} meters
 */
export function resolveParallaxPanelOverscanMeters(settings) {
    const s = settings && typeof settings === 'object' ? settings : null;
    if (!s?.interior?.enabled) return 0;
    return computeParallaxPanelOverscanMeters({
        depthMeters: resolveParallaxPanelDepthMeters(s),
        neighborGapMeters: toFiniteOrNull(s.interior.overscanClampMeters)
    });
}
