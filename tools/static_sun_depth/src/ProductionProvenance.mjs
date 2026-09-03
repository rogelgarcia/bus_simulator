// Enforces the clean source-only production lineage for AI 531 static-sun packages.
// @ts-check

import { cloneCanonicalJson } from '../../../src/app/illumination/bake_source/CanonicalJson.js';

export const PRODUCTION_NATIVE_FIELD_PROVENANCE_SCHEMA =
    'bus-sim-static-sun-depth-production-native-field-provenance-v1';

const CLEAN_NATIVE_FIELD_IDENTITIES = Object.freeze(new Map([
    [
        'ai531-production-alpha-cutout-native-field-receipt-v2',
        Object.freeze({
            method:
                'three-r183-production-lattice-mixed-foliage-depth24-native-readback-v2',
            sourceClass: 'authenticated-runtime-depth24-caster-material-source-v1'
        })
    ],
    [
        'ai531-production-alpha-cutout-native-field-receipt-v3',
        Object.freeze({
            method:
                'headless-blender-full-lattice-candidates-three-r183-native-texture-grad-v3',
            sourceClass: 'authenticated-texture-gradient-caster-material-source-v1'
        })
    ],
    [
        'ai531-production-alpha-cutout-native-field-receipt-v6',
        Object.freeze({
            method: 'authenticated-direct-depth24-texture-grad-hole-fill-v6',
            sourceClass: 'authenticated-source-field-composition-v1'
        })
    ]
]));

const FORBIDDEN_LINEAGE_KEYS = Object.freeze(new Set([
    'calibration',
    'correctedSamples',
    'correctedTexels',
    'diagnosticEvidence',
    'diagnosticReport',
    'localizationReports',
    'residualCalibration',
    'sourceProductionReport'
]));

/**
 * @param {unknown} value
 * @returns {Readonly<Record<string, any>>}
 */
export function assertCleanProductionNativeFieldReceipt(value) {
    const receipt = requirePlainObject(value, 'native field receipt');
    const identity = CLEAN_NATIVE_FIELD_IDENTITIES.get(receipt.schema);
    if (!identity
        || receipt.method !== identity.method
        || receipt.status !== 'complete'
        || receipt.productionEligible !== true) {
        throw new Error(
            'Production native field provenance rejects calibrated, residual, '
            + 'diagnostic, unpromoted, or unknown field lineage'
        );
    }
    assertNoForbiddenLineageKeys(receipt, 'native field receipt');
    return Object.freeze(cloneCanonicalJson({
        method: receipt.method,
        productionEligible: true,
        schema: PRODUCTION_NATIVE_FIELD_PROVENANCE_SCHEMA,
        sourceClass: identity.sourceClass,
        sourceReceiptSchema: receipt.schema,
        status: 'passed'
    }));
}

/**
 * @param {unknown} value
 * @returns {Readonly<Record<string, any>>}
 */
export function assertCleanProductionRenderReceipt(value) {
    const receipt = requirePlainObject(value, 'production render receipt');
    assertNoForbiddenLineageKeys(receipt, 'production render receipt');
    const summary = requirePlainObject(
        receipt.alphaCertification?.nativeCutoutField,
        'production render receipt.alphaCertification.nativeCutoutField'
    );
    const identity = CLEAN_NATIVE_FIELD_IDENTITIES.get(summary.schema);
    if (!identity
        || summary.method !== identity.method
        || summary.status !== 'authenticated_complete_native_field') {
        throw new Error(
            'Production render receipt descends from a non-promotable native field'
        );
    }
    return Object.freeze(cloneCanonicalJson({
        method: summary.method,
        receiptSha256: summary.receiptSha256,
        schema: PRODUCTION_NATIVE_FIELD_PROVENANCE_SCHEMA,
        sourceClass: identity.sourceClass,
        sourceReceiptSchema: summary.schema,
        status: 'passed'
    }));
}

function assertNoForbiddenLineageKeys(value, label) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
        value.forEach((entry, index) => (
            assertNoForbiddenLineageKeys(entry, `${label}[${index}]`)
        ));
        return;
    }
    for (const [key, entry] of Object.entries(value)) {
        if (FORBIDDEN_LINEAGE_KEYS.has(key)) {
            throw new Error(`${label}.${key} is validation-derived production lineage`);
        }
        assertNoForbiddenLineageKeys(entry, `${label}.${key}`);
    }
}

function requirePlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype
            && Object.getPrototypeOf(value) !== null)) {
        throw new TypeError(`${label} must be a plain object`);
    }
    return /** @type {Record<string, any>} */ (value);
}
