// src/graphics/gui/mesh_fabrication/primitives/helpers/validation.js

import {
    assertBoolean,
    assertFiniteNumber,
    assertObject,
    assertString
} from '../../validators/assertions.js';

export {
    assertBoolean,
    assertFiniteNumber,
    assertObject,
    assertString
};

export function assertIntegerInRange(value, label, min, max) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) {
        throw new Error(`[PrimitiveValidation] ${label} must be an integer in [${min}, ${max}].`);
    }
    return num;
}

export function assertPositiveNumber(value, label) {
    const num = assertFiniteNumber(value, label);
    if (num <= 0) {
        throw new Error(`[PrimitiveValidation] ${label} must be > 0.`);
    }
    return num;
}
