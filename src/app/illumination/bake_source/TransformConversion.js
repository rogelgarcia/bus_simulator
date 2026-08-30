// Validates affine world transforms and converts Three.js Y-up matrices to Blender Z-up.
// @ts-check

export const THREE_TO_BLENDER_BASIS_COLUMN_MAJOR = Object.freeze([
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, -1, 0, 0,
    0, 0, 0, 1
]);

export const BLENDER_TO_THREE_BASIS_COLUMN_MAJOR = Object.freeze([
    1, 0, 0, 0,
    0, 0, -1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1
]);

const AFFINE_EPSILON = 1e-12;
const DETERMINANT_EPSILON = 1e-12;

/**
 * @typedef {{
 *   determinant: number
 * }} AffineTransformValidation
 */

/**
 * @param {ArrayLike<number>} matrix
 * @param {string} [label]
 * @returns {Readonly<AffineTransformValidation>}
 */
export function validateAffineTransform(matrix, label = 'transform') {
    if (!matrix || typeof matrix.length !== 'number' || matrix.length !== 16) {
        throw new TypeError(label + ' must contain exactly 16 column-major elements');
    }
    const values = Array.from(matrix);
    for (let index = 0; index < values.length; index += 1) {
        if (typeof values[index] !== 'number' || !Number.isFinite(values[index])) {
            throw new TypeError(label + '[' + index + '] must be a finite number');
        }
    }
    const expectedBottomRow = [0, 0, 0, 1];
    const bottomRowIndices = [3, 7, 11, 15];
    for (let index = 0; index < bottomRowIndices.length; index += 1) {
        if (Math.abs(values[bottomRowIndices[index]] - expectedBottomRow[index]) > AFFINE_EPSILON) {
            throw new Error(label + ' must be affine with bottom row [0, 0, 0, 1]');
        }
    }
    const determinant = determinant3x3(values);
    if (!Number.isFinite(determinant) || Math.abs(determinant) <= DETERMINANT_EPSILON) {
        throw new Error(label + ' has a singular or near-singular linear transform');
    }
    if (determinant < 0) {
        throw new Error(label + ' has a negative determinant and requires geometry winding normalization');
    }
    return Object.freeze({ determinant });
}

/**
 * @param {ArrayLike<number>} matrix
 * @returns {readonly number[]}
 */
export function convertThreeMatrixToBlender(matrix) {
    validateAffineTransform(matrix, 'Three.js world transform');
    const source = Array.from(matrix);
    const converted = multiply4x4(
        multiply4x4(THREE_TO_BLENDER_BASIS_COLUMN_MAJOR, source),
        BLENDER_TO_THREE_BASIS_COLUMN_MAJOR
    ).map((value) => Object.is(value, -0) ? 0 : value);
    validateAffineTransform(converted, 'Blender world transform');
    return Object.freeze(converted);
}

/**
 * Applies the exact inverse of {@link convertThreeMatrixToBlender} without
 * decomposing the affine transform.
 *
 * @param {ArrayLike<number>} matrix
 * @returns {readonly number[]}
 */
export function convertBlenderMatrixToThree(matrix) {
    validateAffineTransform(matrix, 'Blender world transform');
    const source = Array.from(matrix);
    const converted = multiply4x4(
        multiply4x4(BLENDER_TO_THREE_BASIS_COLUMN_MAJOR, source),
        THREE_TO_BLENDER_BASIS_COLUMN_MAJOR
    ).map((value) => Object.is(value, -0) ? 0 : value);
    validateAffineTransform(converted, 'Three.js world transform');
    return Object.freeze(converted);
}

/**
 * @param {ArrayLike<number>} matrix
 * @returns {number}
 */
function determinant3x3(matrix) {
    const m00 = matrix[0];
    const m01 = matrix[4];
    const m02 = matrix[8];
    const m10 = matrix[1];
    const m11 = matrix[5];
    const m12 = matrix[9];
    const m20 = matrix[2];
    const m21 = matrix[6];
    const m22 = matrix[10];
    return m00 * (m11 * m22 - m12 * m21)
        - m01 * (m10 * m22 - m12 * m20)
        + m02 * (m10 * m21 - m11 * m20);
}

/**
 * @param {ArrayLike<number>} left
 * @param {ArrayLike<number>} right
 * @returns {number[]}
 */
function multiply4x4(left, right) {
    const result = new Array(16).fill(0);
    for (let column = 0; column < 4; column += 1) {
        for (let row = 0; row < 4; row += 1) {
            let value = 0;
            for (let inner = 0; inner < 4; inner += 1) {
                value += left[inner * 4 + row] * right[column * 4 + inner];
            }
            result[column * 4 + row] = value;
        }
    }
    return result;
}
