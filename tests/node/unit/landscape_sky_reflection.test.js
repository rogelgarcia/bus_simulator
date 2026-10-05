// Verifies the CPU GGX prefilter of the calibrated sky that the landscape water reflects, against exact integrals of the same environment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANDSCAPE_SKY_REFLECTION, landscapeSkyReflectionDistribution, prefilterLandscapeSkyReflection, sampleLandscapeSkyReflection } from '../../../src/graphics/engine3d/landscape/LandscapeSkyReflection.js';
import { landscapeWaterSurfaceRoughness } from '../../../src/graphics/engine3d/landscape/LandscapeLightingModel.js';
import { decodeRadianceHdr, toHalfFloatImage } from '../../shared/landscape_radiance_hdr.js';

const root = new URL('../../../', import.meta.url);
const hdr = decodeRadianceHdr(await readFile(new URL('assets/public/lighting/calibrated/clear-afternoon-55.hdr', root)));
const { roughness, alpha } = landscapeWaterSurfaceRoughness();
const direction = (azimuthDeg, elevationDeg) => {
    const azimuth = azimuthDeg * Math.PI / 180, elevation = elevationDeg * Math.PI / 180;
    return [Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation)];
};
// an equirectangular float image (three.js mapping, rows from +Y down) from a radiance function of direction
function environment(width, height, radiance) {
    const data = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const elevation = Math.PI / 2 - (y + .5) / height * Math.PI, phi = ((x + .5) / width - .5) * 2 * Math.PI;
        data.set([...radiance([Math.cos(phi) * Math.cos(elevation), Math.sin(elevation), Math.sin(phi) * Math.cos(elevation)], x, y), 1], (y * width + x) * 4);
    }
    return { width, height, data, channels: 4, encoding: 'float' };
}
// the split-sum estimator integrated over every texel of the full-resolution environment, without support truncation
function exact(image, n) {
    const { width, height, data } = image, sums = [0, 0, 0];
    let total = 0;
    for (let y = 0; y < height; y++) {
        const top = Math.PI / 2 - y / height * Math.PI, bottom = Math.PI / 2 - (y + 1) / height * Math.PI, elevation = Math.PI / 2 - (y + .5) / height * Math.PI;
        const omega = (Math.sin(top) - Math.sin(bottom)) * 2 * Math.PI / width;
        for (let x = 0; x < width; x++) {
            const phi = ((x + .5) / width - .5) * 2 * Math.PI, cosine = n[0] * Math.cos(phi) * Math.cos(elevation) + n[1] * Math.sin(elevation) + n[2] * Math.sin(phi) * Math.cos(elevation);
            if (cosine <= 0) continue;
            const weight = landscapeSkyReflectionDistribution(cosine, alpha) * cosine * omega;
            total += weight;
            for (let channel = 0; channel < 3; channel++) sums[channel] += data[(y * width + x) * 4 + channel] * weight;
        }
    }
    return sums.map(value => value / total);
}

test('Sky reflection: the GGX distribution of the half vector is normalized over the light directions (V = N = R)', () => {
    // ∫ D(h) (n·h) dω_h = 1 and dω_l = 4 (l·h) dω_h with l·h = n·h, so ∫ D / 4 over the sphere of light directions is one
    const steps = 400000;
    let integral = 0;
    for (let index = 0; index < steps; index++) {
        const theta = (index + .5) / steps * Math.PI;
        integral += landscapeSkyReflectionDistribution(Math.cos(theta), alpha) / 4 * 2 * Math.PI * Math.sin(theta) * Math.PI / steps;
    }
    assert.ok(Math.abs(integral - 1) < 1e-4, `${integral}`);
});

test('Sky reflection: a constant environment stays constant, intensity scales linearly and the support keeps 98.8% of the lobe', () => {
    const flat = environment(256, 128, () => [2, 3, 5]);
    const map = prefilterLandscapeSkyReflection(flat, { roughness });
    assert.equal(map.model, LANDSCAPE_SKY_REFLECTION.model);
    assert.equal(map.width, 128); assert.equal(map.height, 64); assert.equal(map.data.length, 128 * 64 * 4);
    for (let index = 0; index < map.data.length; index += 4) {
        [2, 3, 5].forEach((value, channel) => assert.ok(Math.abs(map.data[index + channel] / value - 1) < 1e-6, `texel ${index / 4} channel ${channel}: ${map.data[index + channel]}`));
        assert.equal(map.data[index + 3], 1);
    }
    assert.ok(map.retainedWeight > .985 && map.retainedWeight < .992, `${map.retainedWeight}`);
    const scaled = prefilterLandscapeSkyReflection(flat, { roughness, intensity: .5 });
    for (let index = 0; index < map.data.length; index += 37) assert.ok(Math.abs(scaled.data[index] - (index % 4 === 3 ? 1 : map.data[index] / 2)) < 1e-6);
});

test('Sky reflection: the prefiltered calibrated sky matches the exact estimator of the full-resolution HDR within 2%', () => {
    const half = toHalfFloatImage(hdr), map = prefilterLandscapeSkyReflection(half, { roughness });
    const errors = [];
    for (const [azimuth, elevation] of [[0, 1], [0, 5], [0, 15], [45, 30], [45, 55], [90, 60], [-135, 10], [180, 45], [-90, 80], [30, -10]]) {
        const n = direction(azimuth, elevation), mapped = sampleLandscapeSkyReflection(map, n), reference = exact(hdr, n);
        mapped.forEach((value, channel) => {
            errors.push(Math.abs(value / reference[channel] - 1));
            assert.ok(Math.abs(value / reference[channel] - 1) < .02, `az ${azimuth} el ${elevation} channel ${channel}: ${value} vs ${reference[channel]}`);
        });
    }
    // the reflection follows the sky: the bright horizon outshines the zenith
    const horizon = sampleLandscapeSkyReflection(map, direction(-135, 5)), zenith = sampleLandscapeSkyReflection(map, direction(0, 89));
    assert.ok(horizon[0] > 2 * zenith[0], `${horizon} vs ${zenith}`);
    assert.ok(Math.max(...errors) < .02);
});

test('Sky reflection: rows run from the nadir up, columns follow three.js azimuths, and the lookup wraps across the ±180° seam', () => {
    const spot = (center, n) => n[0] * center[0] + n[1] * center[1] + n[2] * center[2] > Math.cos(4 * Math.PI / 180) ? [100, 100, 100] : [0, 0, 0];
    for (const [azimuth, elevation] of [[30, 20], [179, -35], [-100, 70]]) {
        const center = direction(azimuth, elevation), map = prefilterLandscapeSkyReflection(environment(512, 256, n => spot(center, n)), { roughness });
        let best = 0;
        for (let texel = 1; texel < map.width * map.height; texel++) if (map.data[texel * 4] > map.data[best * 4]) best = texel;
        const row = Math.floor(best / map.width), column = best % map.width;
        const texelElevation = -90 + (row + .5) / map.height * 180, texelAzimuth = ((column + .5) / map.width - .5) * 360;
        assert.ok(Math.abs(texelElevation - elevation) <= 180 / map.height, `elevation ${texelElevation} vs ${elevation}`);
        assert.ok(Math.abs(((texelAzimuth - azimuth + 540) % 360) - 180) <= 360 / map.width * (elevation > 60 ? 4 : 1), `azimuth ${texelAzimuth} vs ${azimuth}`);
        const peak = sampleLandscapeSkyReflection(map, center)[0];
        assert.ok(peak > .9 * map.data[best * 4], `the lookup peaks at the source: ${peak} vs ${map.data[best * 4]}`);
        if (azimuth === 179) {
            const across = sampleLandscapeSkyReflection(map, direction(-179, elevation))[0];
            assert.ok(across > .8 * peak, `continuous across the seam: ${across} vs ${peak}`);
        }
    }
});

test('Sky reflection: invalid inputs fail explicitly', () => {
    const flat = environment(64, 32, () => [1, 1, 1]);
    assert.throws(() => prefilterLandscapeSkyReflection(flat, { roughness: 0 }), /roughness must lie in \(0, 1\]/);
    assert.throws(() => prefilterLandscapeSkyReflection(flat, { roughness: 1.2 }), /roughness must lie in \(0, 1\]/);
    assert.throws(() => prefilterLandscapeSkyReflection(flat, { roughness, width: 64, height: 64 }), /2:1 grid/);
    assert.throws(() => prefilterLandscapeSkyReflection(flat, { roughness, width: 128, height: 64 }), /smaller than the 128×64 reflection map/);
    assert.throws(() => prefilterLandscapeSkyReflection(flat, { roughness, width: 32, height: 16, supportDegrees: 120 }), /support must lie in/);
    assert.throws(() => prefilterLandscapeSkyReflection(flat, { roughness, width: 32, height: 16, intensity: -1 }), /intensity must be finite and non-negative/);
    assert.throws(() => prefilterLandscapeSkyReflection({ ...flat, channels: 2 }, { roughness, width: 32, height: 16 }), /RGB or RGBA texels/);
});
