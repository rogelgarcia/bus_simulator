// Selects and validates the canonical AI 529 static-sun depth intermediate.
// @ts-check

import path from 'node:path';
import { canonicalJsonStringify } from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import { failStaticSunDepth } from './StaticSunDepthToolError.mjs';

export const STATIC_SUN_DEPTH_CHANNEL_ID = 'static_sun_depth';
export const AI529_PROOF_PROFILE_PREFIX = 'ai529.proof.';
export const AI529_PROOF_OUTPUT_ID = 'proof_static_sun_depth_position';

const DESCRIPTOR_KEYS = Object.freeze([
    'alphaCutout',
    'authoritativeBackend',
    'camera',
    'colorSpace',
    'components',
    'emptySentinel',
    'nearestVisibilityRule',
    'occupiedAlpha',
    'semantic'
]);
const ALPHA_KEYS = Object.freeze([
    'comparison',
    'compiledRepresentation',
    'coveredCellCount',
    'maskDimensions',
    'threshold',
    'transparentCellCount'
]);
const CAMERA_KEYS = Object.freeze([
    'clipFarMeters',
    'clipNearMeters',
    'locationMeters',
    'orthographicBoundsMeters',
    'projection'
]);
const BOUNDS_KEYS = Object.freeze(['bottom', 'left', 'right', 'top']);
const COMPONENTS = Object.freeze([
    'light_space_x_meters',
    'light_space_y_meters',
    'nearest_positive_depth_meters',
    'occupancy'
]);
const ZERO_SENTINEL = Object.freeze(['0', '0', '0', '0']);
const DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?(?:0|[1-9][0-9]*))?$/;

/**
 * Finds exactly one depth output and validates its proof descriptor.
 * @param {Readonly<Record<string, any>>} manifest
 */
export function selectStaticSunDepthIntermediate(manifest) {
    const matches = manifest.outputs.filter((entry) => entry.channel === STATIC_SUN_DEPTH_CHANNEL_ID);
    if (matches.length !== 1) {
        failStaticSunDepth(
            'static_sun_depth_output_inventory_invalid',
            'The intermediate manifest must contain exactly one static-sun depth output.',
            { count: matches.length }
        );
    }
    const output = matches[0];
    const descriptor = validateStaticSunDepthDescriptor(output.descriptor);
    if (manifest.profile.id.startsWith(AI529_PROOF_PROFILE_PREFIX)) {
        if (output.id !== AI529_PROOF_OUTPUT_ID || output.canonical.width !== 32 || output.canonical.height !== 32) {
            failStaticSunDepth(
                'ai529_proof_shape_invalid',
                'The checked AI 529 proof profile must retain its exact output ID and 32 by 32 shape.',
                {
                    outputId: output.id,
                    width: output.canonical.width,
                    height: output.canonical.height
                }
            );
        }
    }
    return Object.freeze({ output, descriptor });
}

/**
 * Validates the exact canonical descriptor emitted by the checked AI 529 depth proof.
 * @param {unknown} value
 */
export function validateStaticSunDepthDescriptor(value) {
    const descriptor = requireObject(value, 'Static-sun depth descriptor');
    requireExactKeys(descriptor, DESCRIPTOR_KEYS, 'Static-sun depth descriptor');
    requireExactValue(descriptor.authoritativeBackend, 'cycles_cpu', 'authoritativeBackend');
    requireExactValue(descriptor.colorSpace, 'raw_non_color_linear_float32', 'colorSpace');
    requireExactValue(
        descriptor.nearestVisibilityRule,
        'cycles_camera_primary_visibility_first_surface',
        'nearestVisibilityRule'
    );
    requireExactValue(descriptor.occupiedAlpha, '1_at_unfiltered_interior_samples', 'occupiedAlpha');
    requireExactValue(
        descriptor.semantic,
        'orthographic_light_space_position_and_nearest_depth',
        'semantic'
    );
    requireCanonicalEquality(descriptor.components, COMPONENTS, 'components');
    requireCanonicalEquality(descriptor.emptySentinel, ZERO_SENTINEL, 'emptySentinel');

    const alpha = requireObject(descriptor.alphaCutout, 'alphaCutout');
    requireExactKeys(alpha, ALPHA_KEYS, 'alphaCutout');
    requireExactValue(
        alpha.comparison,
        'coverage_greater_or_equal_threshold_is_present',
        'alphaCutout.comparison'
    );
    requireExactValue(
        alpha.compiledRepresentation,
        'deterministic_silhouette_geometry',
        'alphaCutout.compiledRepresentation'
    );
    requireNonNegativeInteger(alpha.coveredCellCount, 'alphaCutout.coveredCellCount');
    requireNonNegativeInteger(alpha.transparentCellCount, 'alphaCutout.transparentCellCount');
    if (!Array.isArray(alpha.maskDimensions) || alpha.maskDimensions.length !== 2) {
        failStaticSunDepth('static_sun_depth_descriptor_invalid', 'alphaCutout.maskDimensions must contain two positive integers.', {});
    }
    alpha.maskDimensions.forEach((entry, index) => requirePositiveInteger(entry, `alphaCutout.maskDimensions[${index}]`));
    if (alpha.coveredCellCount + alpha.transparentCellCount !== alpha.maskDimensions[0] * alpha.maskDimensions[1]) {
        failStaticSunDepth(
            'static_sun_depth_descriptor_invalid',
            'Alpha cutout covered and transparent counts do not match the declared mask dimensions.',
            {}
        );
    }
    const threshold = parseCanonicalDecimal(alpha.threshold, 'alphaCutout.threshold');
    if (threshold < 0 || threshold > 1) {
        failStaticSunDepth('static_sun_depth_descriptor_invalid', 'Alpha cutout threshold must be within zero and one.', {});
    }

    const camera = requireObject(descriptor.camera, 'camera');
    requireExactKeys(camera, CAMERA_KEYS, 'camera');
    requireExactValue(
        camera.projection,
        'right_handed_orthographic_camera_looks_negative_z',
        'camera.projection'
    );
    const clipNearMeters = parseCanonicalDecimal(camera.clipNearMeters, 'camera.clipNearMeters');
    const clipFarMeters = parseCanonicalDecimal(camera.clipFarMeters, 'camera.clipFarMeters');
    if (clipNearMeters <= 0 || clipFarMeters <= clipNearMeters) {
        failStaticSunDepth('static_sun_depth_descriptor_invalid', 'Camera clip distances must define a positive ordered range.', {});
    }
    if (!Array.isArray(camera.locationMeters) || camera.locationMeters.length !== 3) {
        failStaticSunDepth('static_sun_depth_descriptor_invalid', 'camera.locationMeters must contain three canonical decimals.', {});
    }
    const locationMeters = camera.locationMeters.map((entry, index) => (
        parseCanonicalDecimal(entry, `camera.locationMeters[${index}]`)
    ));
    const bounds = requireObject(camera.orthographicBoundsMeters, 'camera.orthographicBoundsMeters');
    requireExactKeys(bounds, BOUNDS_KEYS, 'camera.orthographicBoundsMeters');
    const orthographicBoundsMeters = Object.freeze({
        bottom: parseCanonicalDecimal(bounds.bottom, 'camera.orthographicBoundsMeters.bottom'),
        left: parseCanonicalDecimal(bounds.left, 'camera.orthographicBoundsMeters.left'),
        right: parseCanonicalDecimal(bounds.right, 'camera.orthographicBoundsMeters.right'),
        top: parseCanonicalDecimal(bounds.top, 'camera.orthographicBoundsMeters.top')
    });
    if (orthographicBoundsMeters.left >= orthographicBoundsMeters.right
        || orthographicBoundsMeters.bottom >= orthographicBoundsMeters.top) {
        failStaticSunDepth('static_sun_depth_descriptor_invalid', 'Orthographic bounds must be strictly ordered.', {});
    }

    return Object.freeze({
        alphaCutout: Object.freeze({
            comparison: alpha.comparison,
            compiledRepresentation: alpha.compiledRepresentation,
            coveredCellCount: alpha.coveredCellCount,
            maskDimensions: Object.freeze([...alpha.maskDimensions]),
            threshold,
            transparentCellCount: alpha.transparentCellCount
        }),
        camera: Object.freeze({
            clipFarMeters,
            clipNearMeters,
            locationMeters: Object.freeze(locationMeters),
            orthographicBoundsMeters,
            projection: camera.projection
        }),
        components: COMPONENTS,
        emptySentinel: Object.freeze(ZERO_SENTINEL.map(Number))
    });
}

/** @param {string} artifactDirectory @param {string} relativePath */
export function resolveIntermediatePath(artifactDirectory, relativePath) {
    const root = path.resolve(artifactDirectory);
    const resolved = path.resolve(root, ...relativePath.split('/'));
    const relative = path.relative(root, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        failStaticSunDepth(
            'static_sun_depth_input_path_escape',
            'A selected intermediate path escapes its promoted artifact directory.',
            { relativePath }
        );
    }
    return resolved;
}

/** @param {unknown} value @param {string} label */
function requireObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
        failStaticSunDepth('static_sun_depth_descriptor_invalid', `${label} must be a plain object.`, {});
    }
    return /** @type {Record<string, any>} */ (value);
}

/** @param {Record<string, any>} value @param {readonly string[]} expected @param {string} label */
function requireExactKeys(value, expected, label) {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (canonicalJsonStringify(actual) !== canonicalJsonStringify(wanted)) {
        failStaticSunDepth('static_sun_depth_descriptor_invalid', `${label} keys are invalid.`, { actual, expected: wanted });
    }
}

/** @param {unknown} actual @param {unknown} expected @param {string} label */
function requireExactValue(actual, expected, label) {
    if (actual !== expected) {
        failStaticSunDepth('static_sun_depth_descriptor_invalid', `${label} is unsupported.`, { actual, expected });
    }
}

/** @param {unknown} actual @param {unknown} expected @param {string} label */
function requireCanonicalEquality(actual, expected, label) {
    if (canonicalJsonStringify(actual) !== canonicalJsonStringify(expected)) {
        failStaticSunDepth('static_sun_depth_descriptor_invalid', `${label} does not match the canonical contract.`, {});
    }
}

/** @param {unknown} value @param {string} label */
function parseCanonicalDecimal(value, label) {
    if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) {
        failStaticSunDepth('static_sun_depth_descriptor_invalid', `${label} must be a canonical finite decimal string.`, {});
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        failStaticSunDepth('static_sun_depth_descriptor_invalid', `${label} must be finite.`, {});
    }
    return parsed;
}

/** @param {unknown} value @param {string} label */
function requireNonNegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        failStaticSunDepth('static_sun_depth_descriptor_invalid', `${label} must be a non-negative safe integer.`, {});
    }
}

/** @param {unknown} value @param {string} label */
function requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || Number(value) <= 0) {
        failStaticSunDepth('static_sun_depth_descriptor_invalid', `${label} must be a positive safe integer.`, {});
    }
}
