// Scales the landscape viewer's camera near plane with its height above ground so the 24-bit depth buffer resolves the far sea plane against low land.
// @ts-check
// AI 596 D6. A standard depth buffer spends its precision next to the near plane: with near n, far f (f >> n) and b bits the smallest resolvable
// step at view distance d is about d^2 / (n * 2^b). The viewer's 0.1 m near plane (the game's) resolves about 15 m at 5 km and 60 m at 10 km, so
// from the flyover's final climb (1 km up) the sea-level reference plane z-fought the surround's coastal land 2-20 m above it, 4-6 km away
// (tests/artifacts/screens/landscape/ai596/d6/flyover edge checks: 195 of 2,101 frames). A near plane of 0.002 x the height above the authoritative
// ground (0.1 m up to 50 m, 2 m at 1 km, 8 m from 4 km) resolves 0.75 m at 5 km from 1 km up while nothing a standing eye can see lies within
// 0.1 m; the view rebuilds the projection only when the value moves by more than a tenth, so a hovering camera never churns it. The module is pure:
// the view feeds the height above the ground under the camera (LandscapeView, the frame loop).

export const LANDSCAPE_CAMERA_DEPTH = Object.freeze({ nearPerMeter: 0.002, nearMinMeters: 0.1, nearMaxMeters: 8, farMeters: 25000, updateFraction: 0.1, depthBits: 24 });

/** @param {unknown} value @param {string} label */
function requireFinite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`[LandscapeCameraDepth] ${label} must be a finite number; received ${String(value)}`);
    return value;
}

/**
 * The near plane (m) of a perspective camera `aboveGroundMeters` above the ground under it: clamp(height x 0.002, 0.1, 8). A camera below the
 * ground or over it by less than 50 m keeps the game's 0.1 m.
 * @param {number} aboveGroundMeters
 */
export function landscapeCameraNear(aboveGroundMeters) {
    const height = requireFinite(aboveGroundMeters, 'the height above ground');
    const { nearPerMeter, nearMinMeters, nearMaxMeters } = LANDSCAPE_CAMERA_DEPTH;
    return Math.min(nearMaxMeters, Math.max(nearMinMeters, height * nearPerMeter));
}

/**
 * Whether the projection must be rebuilt for `nextNear`: it differs from `currentNear` by more than updateFraction (a tenth) of the current value.
 * @param {number} currentNear @param {number} nextNear
 */
export function landscapeCameraNearChanged(currentNear, nextNear) {
    const current = requireFinite(currentNear, 'the current near plane'), next = requireFinite(nextNear, 'the next near plane');
    if (current <= 0 || next <= 0) throw new Error(`[LandscapeCameraDepth] near planes must be positive; received ${current} and ${next}`);
    return Math.abs(next - current) > current * LANDSCAPE_CAMERA_DEPTH.updateFraction;
}

/**
 * The smallest depth step (m) a `bits`-bit standard depth buffer resolves at view distance `distanceMeters` with near plane `nearMeters` and far
 * plane `farMeters`: d^2 (f - n) / (n f 2^bits), the inverse slope of window depth f (1 - n / d) / (f - n).
 * @param {number} distanceMeters @param {number} nearMeters @param {{farMeters?:number,bits?:number}} [options]
 */
export function landscapeDepthStep(distanceMeters, nearMeters, { farMeters = LANDSCAPE_CAMERA_DEPTH.farMeters, bits = LANDSCAPE_CAMERA_DEPTH.depthBits } = {}) {
    const distance = requireFinite(distanceMeters, 'the view distance'), near = requireFinite(nearMeters, 'the near plane'), far = requireFinite(farMeters, 'the far plane');
    if (!Number.isInteger(bits) || bits < 1 || near <= 0 || far <= near || distance < near || distance > far) throw new Error(`[LandscapeCameraDepth] depth step needs 0 < near <= distance <= far and integer bits; received near ${near}, far ${far}, distance ${distance}, bits ${bits}`);
    return distance * distance * (far - near) / (near * far * 2 ** bits);
}
