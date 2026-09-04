// Deterministic light-space fitting for the shared moving-object sun-shadow layer.
// @ts-check

export const DYNAMIC_SUN_SHADOW_PROJECTION_SCHEMA = 'dynamic-sun-shadow-projection-v1';

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const DIRECTION_EPSILON = 1e-8;

function finite(value, label) {
    const resolved = Number(value);
    if (!Number.isFinite(resolved)) throw new TypeError(`${label} must be finite.`);
    return Object.is(resolved, -0) ? 0 : resolved;
}

function positive(value, label) {
    const resolved = finite(value, label);
    if (resolved <= 0) throw new RangeError(`${label} must be greater than zero.`);
    return resolved;
}

function integer(value, label, minimum) {
    const resolved = finite(value, label);
    if (!Number.isSafeInteger(resolved) || resolved < minimum) {
        throw new RangeError(`${label} must be a safe integer >= ${minimum}.`);
    }
    return resolved;
}

function vector3(value, label) {
    if (!Array.isArray(value) || value.length !== 3) {
        throw new TypeError(`${label} must be a three-component array.`);
    }
    return value.map((component, index) => finite(component, `${label}[${index}]`));
}

function stableId(value, label) {
    if (typeof value !== 'string' || !value || value.trim() !== value
        || CONTROL_CHARACTER_PATTERN.test(value)) {
        throw new TypeError(`${label} must be a stable non-empty string.`);
    }
    return value;
}

function dot(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left, right) {
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0]
    ];
}

function normalized(value, label) {
    const source = vector3(value, label);
    const magnitude = Math.hypot(...source);
    if (magnitude <= DIRECTION_EPSILON) throw new RangeError(`${label} must have non-zero length.`);
    return source.map((component) => component / magnitude);
}

function scaledAdd(right, rightScale, up, upScale, depth, depthScale) {
    return [0, 1, 2].map((index) => (
        right[index] * rightScale
        + up[index] * upScale
        + depth[index] * depthScale
    ));
}

function lightBasis(pointDirection) {
    const depth = normalized(pointDirection, 'sunPointDirectionWorld');
    if (depth[1] <= DIRECTION_EPSILON) {
        throw new RangeError('sunPointDirectionWorld must point above the receiver plane.');
    }
    const reference = Math.abs(depth[1]) < 0.999 ? [0, 1, 0] : [0, 0, 1];
    const right = normalized(cross(reference, depth), 'derived right axis');
    const up = normalized(cross(depth, right), 'derived up axis');
    return { right, up, depth };
}

function validatedBounds(entry, index) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new TypeError(`casterBounds[${index}] must be an object.`);
    }
    const id = stableId(entry.id, `casterBounds[${index}].id`);
    const min = vector3(entry.min, `casterBounds[${index}].min`);
    const max = vector3(entry.max, `casterBounds[${index}].max`);
    for (let axis = 0; axis < 3; axis += 1) {
        if (min[axis] > max[axis]) {
            throw new RangeError(`casterBounds '${id}' has min greater than max on axis ${axis}.`);
        }
    }
    return Object.freeze({ id, min: Object.freeze(min), max: Object.freeze(max) });
}

function corners(bounds) {
    const result = [];
    for (const x of [bounds.min[0], bounds.max[0]]) {
        for (const y of [bounds.min[1], bounds.max[1]]) {
            for (const z of [bounds.min[2], bounds.max[2]]) result.push([x, y, z]);
        }
    }
    return result;
}

function normalizedZero(value) {
    return Object.is(value, -0) ? 0 : value;
}

function frozenVector(value) {
    return Object.freeze(value.map(normalizedZero));
}

/**
 * Fits a fixed-density, texel-snapped orthographic projection around every
 * registered dynamic caster. All casters share the same field, which makes
 * self-shadowing and moving-object-to-moving-object shadowing one operation.
 *
 * @param {{
 *   casterBounds: Array<{id: string, min: number[], max: number[]}>,
 *   sunPointDirectionWorld: number[],
 *   receiverMinimumY?: number,
 *   mapSize?: number,
 *   worldUnitsPerTexel?: number,
 *   paddingTexels?: number,
 *   depthPaddingMeters?: number
 * }} input
 */
export function fitDynamicSunShadowProjection(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('Dynamic sun-shadow projection input must be an object.');
    }
    const bounds = (input.casterBounds ?? [])
        .map(validatedBounds)
        .sort((left, right) => left.id.localeCompare(right.id));
    if (bounds.length === 0) throw new RangeError('At least one dynamic caster bound is required.');
    for (let index = 1; index < bounds.length; index += 1) {
        if (bounds[index - 1].id === bounds[index].id) {
            throw new RangeError(`Duplicate dynamic caster id '${bounds[index].id}'.`);
        }
    }

    const basis = lightBasis(input.sunPointDirectionWorld);
    const receiverMinimumY = finite(input.receiverMinimumY ?? 0, 'receiverMinimumY');
    const mapSize = integer(input.mapSize ?? 2048, 'mapSize', 16);
    const worldUnitsPerTexel = positive(input.worldUnitsPerTexel ?? 0.025, 'worldUnitsPerTexel');
    const paddingTexels = integer(input.paddingTexels ?? 8, 'paddingTexels', 0);
    const depthPaddingMeters = positive(input.depthPaddingMeters ?? 2, 'depthPaddingMeters');
    if (paddingTexels * 2 >= mapSize) throw new RangeError('paddingTexels leaves no usable map interior.');

    const points = [];
    let maximumCastDistanceMeters = 0;
    for (const entry of bounds) {
        for (const point of corners(entry)) {
            points.push(point);
            if (point[1] <= receiverMinimumY) continue;
            const rayDistance = (point[1] - receiverMinimumY) / basis.depth[1];
            maximumCastDistanceMeters = Math.max(maximumCastDistanceMeters, rayDistance);
            points.push([
                point[0] - basis.depth[0] * rayDistance,
                receiverMinimumY,
                point[2] - basis.depth[2] * rayDistance
            ]);
        }
    }

    const lightPoints = points.map((point) => [
        dot(point, basis.right),
        dot(point, basis.up),
        dot(point, basis.depth)
    ]);
    const minimum = [0, 1, 2].map((axis) => Math.min(...lightPoints.map((point) => point[axis])));
    const maximum = [0, 1, 2].map((axis) => Math.max(...lightPoints.map((point) => point[axis])));
    const unsnappedCenter = [
        (minimum[0] + maximum[0]) * 0.5,
        (minimum[1] + maximum[1]) * 0.5
    ];
    const snappedCenter = unsnappedCenter.map((value) => (
        normalizedZero(Math.round(value / worldUnitsPerTexel) * worldUnitsPerTexel)
    ));
    const halfExtentMeters = mapSize * worldUnitsPerTexel * 0.5;
    const paddingMeters = paddingTexels * worldUnitsPerTexel;
    const usableHalfExtent = halfExtentMeters - paddingMeters;
    const requiredHalfExtent = Math.max(
        maximum[0] - snappedCenter[0],
        snappedCenter[0] - minimum[0],
        maximum[1] - snappedCenter[1],
        snappedCenter[1] - minimum[1]
    );
    if (requiredHalfExtent > usableHalfExtent + 1e-9) {
        throw new RangeError(
            `Dynamic caster interaction group needs ${(requiredHalfExtent * 2).toFixed(3)} m `
            + `but the fixed projection provides ${(usableHalfExtent * 2).toFixed(3)} m.`
        );
    }

    const depthCenter = (minimum[2] + maximum[2]) * 0.5;
    const eyeDepth = maximum[2] + depthPaddingMeters;
    const targetWorld = scaledAdd(
        basis.right,
        snappedCenter[0],
        basis.up,
        snappedCenter[1],
        basis.depth,
        depthCenter
    );
    const eyeWorld = scaledAdd(
        basis.right,
        snappedCenter[0],
        basis.up,
        snappedCenter[1],
        basis.depth,
        eyeDepth
    );

    return Object.freeze({
        schema: DYNAMIC_SUN_SHADOW_PROJECTION_SCHEMA,
        casterIds: Object.freeze(bounds.map((entry) => entry.id)),
        casterCount: bounds.length,
        pointDirectionWorld: frozenVector(basis.depth),
        basis: Object.freeze({
            rightAxisWorld: frozenVector(basis.right),
            upAxisWorld: frozenVector(basis.up),
            depthAxisWorld: frozenVector(basis.depth)
        }),
        receiverMinimumY,
        mapSize,
        worldUnitsPerTexel,
        paddingTexels,
        paddingMeters,
        halfExtentMeters,
        usableHalfExtentMeters: usableHalfExtent,
        requiredHalfExtentMeters: requiredHalfExtent,
        centerLightMeters: frozenVector([snappedCenter[0], snappedCenter[1], depthCenter]),
        unsnappedCenterLightMeters: frozenVector([unsnappedCenter[0], unsnappedCenter[1], depthCenter]),
        boundsLightMeters: Object.freeze({ min: frozenVector(minimum), max: frozenVector(maximum) }),
        eyeWorld: frozenVector(eyeWorld),
        targetWorld: frozenVector(targetWorld),
        nearMeters: Math.max(0.01, depthPaddingMeters * 0.25),
        farMeters: maximum[2] - minimum[2] + depthPaddingMeters * 2,
        maximumCastDistanceMeters
    });
}
