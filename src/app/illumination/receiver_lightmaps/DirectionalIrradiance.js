// Defines the four-direction affine irradiance fit in each receiver chart's frame.
// @ts-check
export const DIRECTIONAL_IRRADIANCE_SCHEMA = 'chart-affine-irradiance-v1';
const z = 1 / Math.sqrt(3), x = Math.sqrt(2 / 3), y = 1 / Math.sqrt(2);
export const IRRADIANCE_SAMPLE_NORMALS = Object.freeze([
    Object.freeze([0, 0, 1]), Object.freeze([x, 0, z]),
    Object.freeze([-x / 2, y, z]), Object.freeze([-x / 2, -y, z])
]);

/** @param {number[]} samples */
export function fitDirectionalIrradiance(samples) {
    const mean = (samples[1] + samples[2] + samples[3]) / 3;
    const cz = (samples[0] - mean) / (1 - z);
    return [samples[0] - cz, (2 * samples[1] - samples[2] - samples[3]) / (3 * x),
        (samples[2] - samples[3]) / (2 * y), cz];
}

/** @param {number[]} coefficients @param {number[]} normal */
export function evaluateDirectionalIrradiance(coefficients, normal) {
    return Math.max(0, coefficients[0] + coefficients[1] * normal[0] + coefficients[2] * normal[1] + coefficients[3] * normal[2]);
}
