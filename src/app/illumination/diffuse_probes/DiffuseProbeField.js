// Validates the ambient-cube field and its bounded spatial sampling contract.
// @ts-check
export const DIFFUSE_PROBE_SCHEMA = 'bus-sim-diffuse-probes-v1';
export const DIFFUSE_PROBE_WIDTH = 70;

/** @param {any} field @param {Float32Array|null} [data] @returns {any} Validated field metadata. */
export function validateDiffuseProbeField(field, data = null) {
    if (field?.schema !== DIFFUSE_PROBE_SCHEMA || field.representation !== 'ambient-cube-irradiance-oct-depth-v1') throw new Error('unsupported_diffuse_probe_schema');
    if (!Array.isArray(field.regions) || field.regions.length < 1 || field.regions.length > 4) throw new Error('invalid_diffuse_probe_regions');
    let count = 0;
    for (const region of field.regions) {
        if (region.offset !== count || !Array.isArray(region.origin) || region.origin.length !== 3 || !region.origin.every(Number.isFinite)
            || !Array.isArray(region.spacing) || region.spacing.length !== 3 || !region.spacing.every(v => Number.isFinite(v) && v > 0)
            || !Array.isArray(region.size) || region.size.length !== 3 || !region.size.every(v => Number.isInteger(v) && v >= 2 && v <= 128)) throw new Error('invalid_diffuse_probe_grid');
        count += region.size.reduce((a, b) => a * b, 1);
    }
    if (field.count !== count || count > 16384 || field.width !== DIFFUSE_PROBE_WIDTH || field.depthSize !== 8
        || field.bytes !== count * DIFFUSE_PROBE_WIDTH * 16 || !Number.isFinite(field.maxDistance) || field.maxDistance <= 0) throw new Error('invalid_diffuse_probe_allocation');
    if (!/^[a-f0-9]{64}$/.test(field.sourceHash) || !/^[a-f0-9]{64}$/.test(field.sha256)
        || !Array.isArray(field.sourceProfiles) || !field.cityId) throw new Error('missing_diffuse_probe_identity');
    if (data) {
        if (!(data instanceof Float32Array) || data.byteLength !== field.bytes) throw new Error('diffuse_probe_byte_length_mismatch');
        for (let i = 0; i < data.length; i++) if (!Number.isFinite(data[i]) || data[i] < 0) throw new Error('invalid_diffuse_probe_sample');
        for (let p = 0; p < count; p++) for (let f = 0; f < 6; f++) {
            if (![0, 1].includes(data[(p * DIFFUSE_PROBE_WIDTH + f) * 4 + 3])) throw new Error('invalid_diffuse_probe_validity');
        }
    }
    return field;
}

/** @param {number} x @param {number} y @returns {number[]} Unit world direction. */
export function decodeProbeOctDirection(x, y) {
    const v = [x * 2 - 1, y * 2 - 1, 1 - Math.abs(x * 2 - 1) - Math.abs(y * 2 - 1)];
    if (v[2] < 0) {
        const oldX = v[0];
        v[0] = (1 - Math.abs(v[1])) * (oldX >= 0 ? 1 : -1);
        v[1] = (1 - Math.abs(oldX)) * (v[1] >= 0 ? 1 : -1);
    }
    const length = Math.hypot(...v);
    return v.map(a => a / length);
}

/** @param {number[][]} faces @param {number[]} normal @returns {number[]} Scene-linear RGB irradiance. */
export function ambientCubeIrradiance(faces, normal) {
    const length = Math.hypot(...normal);
    if (!length) throw new Error('invalid_probe_normal');
    const n = normal.map(v => v / length);
    return [0, 1, 2].map(c => n.reduce((sum, v, axis) => sum + v * v * faces[axis * 2 + (v < 0 ? 1 : 0)][c], 0));
}
