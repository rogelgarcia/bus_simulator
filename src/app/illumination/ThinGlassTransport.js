// Bounded fixed-sun transport through parallel, zero-thickness rectangular glazing.
// @ts-check

/** Validate and canonicalize the complete light-only transport profile. */
export function normalizeThinGlassProfile(input) {
    if (input?.version !== 1 || input?.model !== 'parallel-thin-sheet') throw new Error('Unsupported glass transport model');
    const number = (value, name) => {
        if (!Number.isFinite(value)) throw new Error(`Invalid glass transport ${name}`);
        return Math.round(value * 1e8) / 1e8;
    };
    const vector = (value, size, name) => {
        if (!Array.isArray(value) || value.length !== size) throw new Error(`Invalid glass transport ${name}`);
        return value.map(v => number(v, name));
    };
    const sun = vector(input.sunDirection, 3, 'sun');
    if (Math.abs(Math.hypot(...sun) - 1) > 1e-6 || sun[1] <= 0 || sun[2] <= 0) throw new Error('Sun must be normalized, above the receiver and in front of the glazing');
    const bounds = vector(input.receiver?.bounds, 4, 'receiver bounds');
    if (typeof input.receiver?.id !== 'string' || !input.receiver.id) throw new Error('Receiver id is required');
    if (Object.keys(input.receiver).some(key => !['id', 'bounds', 'y'].includes(key))) throw new Error('Unsupported receiver geometry');
    if (bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) throw new Error('Invalid receiver bounds order');
    if (!Array.isArray(input.panes) || !input.panes.length) throw new Error('At least one static pane is required');
    const ids = new Set();
    const panes = input.panes.map(pane => {
        if (Object.keys(pane).some(key => !['id', 'bounds', 'z', 'transmittance', 'f0'].includes(key))) throw new Error('Unsupported pane geometry or material');
        if (typeof pane.id !== 'string' || !pane.id || ids.has(pane.id)) throw new Error('Pane ids must be unique');
        ids.add(pane.id);
        const rect = vector(pane.bounds, 4, 'pane bounds');
        if (rect[2] <= rect[0] || rect[3] <= rect[1]) throw new Error('Invalid pane bounds order');
        const tint = vector(pane.transmittance, 3, 'linear transmittance');
        if (tint.some(v => v < 0 || v > 1)) throw new Error('Transmittance must be in [0,1]');
        const f0 = number(pane.f0, 'F0');
        if (f0 < 0.02 || f0 > 0.35) throw new Error('Unsupported pane F0');
        return { id: pane.id, bounds: rect, z: number(pane.z, 'pane z'), transmittance: tint, f0 };
    });
    return { version: 1, model: 'parallel-thin-sheet', sunDirection: sun,
        receiver: { id: String(input.receiver.id), bounds, y: number(input.receiver.y, 'receiver y') }, panes };
}

/** Stable profile identity; exposure, receiver albedo and camera are deliberately absent. */
export function thinGlassProfileKey(profile) {
    return JSON.stringify(normalizeThinGlassProfile(profile));
}

function trace(profile, x, z) {
    const [dx, dy, dz] = profile.sunDirection;
    const result = [1, 1, 1];
    for (const pane of profile.panes) {
        const distance = (pane.z - z) / dz;
        if (distance <= 0) continue;
        const px = x + dx * distance, py = profile.receiver.y + dy * distance;
        const [x0, y0, x1, y1] = pane.bounds;
        if (px < x0 || px > x1 || py < y0 || py > y1) continue;
        const reflectance = pane.f0 + (1 - pane.f0) * (1 - dz) ** 5;
        for (let c = 0; c < 3; c++) result[c] *= (1 - reflectance) * pane.transmittance[c];
    }
    return result;
}

/** Analytic ray/pane intersection with deterministic 2x2 receiver footprint integration. */
export function bakeThinGlassTransport(input, { resolution = 128 } = {}) {
    const profile = normalizeThinGlassProfile(input);
    if (!Number.isInteger(resolution) || resolution < 16 || resolution > 512) throw new Error('Resolution must be an integer from 16 to 512');
    const [x0, z0, x1, z1] = profile.receiver.bounds;
    const data = [];
    for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
        const rgb = [0, 0, 0];
        for (const v of [0.25, 0.75]) for (const u of [0.25, 0.75]) {
            const sample = trace(profile, x0 + (x + u) / resolution * (x1 - x0), z0 + (y + v) / resolution * (z1 - z0));
            for (let c = 0; c < 3; c++) rgb[c] += sample[c] / 4;
        }
        data.push(...rgb);
    }
    return { version: 1, kind: 'sun-direct-transmittance', solver: 'analytic-parallel-thin-sheet-v1', profile,
        profileKey: thinGlassProfileKey(profile), width: resolution, height: resolution, channels: 3, data };
}

/** Fail closed before allocating textures or suppressing a pane's ordinary shadow. */
export function validateThinGlassBake(bake, currentProfile) {
    if (bake?.version !== 1 || bake.kind !== 'sun-direct-transmittance' || bake.solver !== 'analytic-parallel-thin-sheet-v1') throw new Error('Unsupported glass bake');
    if (bake.profileKey !== thinGlassProfileKey(bake.profile)) throw new Error('Corrupt glass bake profile');
    if (!Number.isInteger(bake.width) || bake.width < 16 || bake.width > 512 || bake.height !== bake.width || bake.channels !== 3
        || !Array.isArray(bake.data) || bake.data.length !== bake.width * bake.height * 3
        || bake.data.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error('Invalid glass bake samples');
    return bake.profileKey === thinGlassProfileKey(currentProfile);
}
