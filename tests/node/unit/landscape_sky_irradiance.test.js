// Verifies the calibrated sky irradiance harmonics against the published calibration receivers and an exact integral of the same HDR.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANDSCAPE_SKY_IRRADIANCE, decodeLandscapeHalfFloat, evaluateLandscapeSkyIrradiance, landscapeSkyBands, landscapeSkyBasis, landscapeSkyHorizonRadiance,
    landscapeSkyRadianceBands, packLandscapeSkyUniform, projectLandscapeSkyIrradiance } from '../../../src/graphics/engine3d/landscape/LandscapeSkyIrradiance.js';
import { decodeRadianceHdr, toHalfFloatImage } from '../../shared/landscape_radiance_hdr.js';

const root = new URL('../../../', import.meta.url);
const calibration = JSON.parse(await readFile(new URL('assets/public/lighting/calibrated/clear-afternoon-55.json', root), 'utf8'));

const hdr = decodeRadianceHdr(await readFile(new URL('assets/public/lighting/calibrated/clear-afternoon-55.hdr', root)));
const sky = projectLandscapeSkyIrradiance(hdr);
const relative = (value, reference) => value / reference - 1;

// exact cosine-weighted integral of the same equirectangular texels (pixel-center directions, exact row solid angles)
function exactIrradiance(image, normal) {
    const { width, height, data } = image, result = [0, 0, 0];
    for (let y = 0; y < height; y++) {
        const top = Math.PI / 2 - y / height * Math.PI, bottom = Math.PI / 2 - (y + 1) / height * Math.PI, elevation = Math.PI / 2 - (y + .5) / height * Math.PI;
        const weight = (Math.sin(top) - Math.sin(bottom)) * 2 * Math.PI / width, cosine = Math.cos(elevation), sine = Math.sin(elevation);
        for (let x = 0; x < width; x++) {
            const phi = ((x + .5) / width - .5) * 2 * Math.PI, facing = normal[0] * Math.cos(phi) * cosine + normal[1] * sine + normal[2] * Math.sin(phi) * cosine;
            if (facing <= 0) continue;
            for (let channel = 0; channel < 3; channel++) result[channel] += data[(y * width + x) * 4 + channel] * facing * weight;
        }
    }
    return result;
}

test('Sky irradiance: the projection reproduces the published calibrated receivers of the clear-afternoon sky', () => {
    assert.equal(LANDSCAPE_SKY_IRRADIANCE.coefficients, 11);
    assert.equal(LANDSCAPE_SKY_IRRADIANCE.uniformVectors, 9);
    assert.equal(calibration.mapping, 'Three equirectangular; top-down file; outward direction', 'the HDR uses three.js equirectangular directions');
    assert.equal(calibration.sunDiscIncluded, false, 'the environment is disc-free; the sun is the separate directional light');
    assert.ok(Math.abs(sky.solidAngle - 4 * Math.PI) < 1e-9, 'row solid angles cover the sphere exactly');
    // the calibration's east receiver faces Blender +X (three +X), its north receiver Blender +Y (three -Z)
    const receivers = { horizontal: [0, 1, 0], east: [1, 0, 0], north: [0, 0, -1] }, tolerance = { horizontal: .025, east: .01, north: .01 };
    for (const [name, normal] of Object.entries(receivers)) {
        const value = evaluateLandscapeSkyIrradiance(sky.coefficients, normal);
        value.forEach((channel, index) => assert.ok(Math.abs(relative(channel, calibration.profile.skyIrradiance[name][index])) <= tolerance[name],
            `${name} channel ${index}: ${channel.toFixed(4)} against ${calibration.profile.skyIrradiance[name][index].toFixed(4)}`));
    }
    // second-order harmonics alone would miss the zenith receiver by more than 7% (the reason for the zonal bands 4 and 6)
    const secondOrder = sky.coefficients.map((value, index) => index >= 27 ? 0 : value);
    const up = evaluateLandscapeSkyIrradiance(secondOrder, [0, 1, 0]);
    assert.ok(relative(up[0], calibration.profile.skyIrradiance.horizontal[0]) > .07, `second order alone: ${up[0]}`);
});

test('Sky irradiance: eleven coefficients follow the exact irradiance integral over the upper hemisphere', () => {
    let worst = 0, worstDirection = null;
    for (let index = 0; index < 96; index++) {
        const y = (index + .5) / 96, radius = Math.sqrt(1 - y * y), angle = index * 2.399963229728653, normal = [radius * Math.cos(angle), y, radius * Math.sin(angle)];
        const exact = exactIrradiance(hdr, normal), fitted = evaluateLandscapeSkyIrradiance(sky.coefficients, normal);
        for (let channel = 0; channel < 3; channel++) {
            const error = Math.abs(relative(fitted[channel], exact[channel]));
            if (error > worst) { worst = error; worstDirection = normal; }
        }
    }
    assert.ok(worst < .03, `largest upper-hemisphere error ${(worst * 100).toFixed(2)}% at ${worstDirection?.map(value => value.toFixed(3))}`);
    const bands = landscapeSkyBands(sky.coefficients, [0, 1, 0]);
    bands.forEach((channel, index) => assert.ok(Math.abs(channel.reduce((sum, value) => sum + value, 0) - evaluateLandscapeSkyIrradiance(sky.coefficients, [0, 1, 0])[index]) < 1e-12));
});

test('Sky irradiance: constant and linear environments are represented exactly; band radiance divides by the cosine lobe', () => {
    const width = 64, height = 32, constant = new Float32Array(width * height * 3).fill(2), gradient = new Float32Array(width * height * 3);
    for (let y = 0; y < height; y++) {
        const sine = Math.sin(Math.PI / 2 - (y + .5) / height * Math.PI);
        for (let x = 0; x < width; x++) gradient.set([1 + sine, 1 + sine, 1 + sine], (y * width + x) * 3);
    }
    const uniform = projectLandscapeSkyIrradiance({ width, height, data: constant, channels: 3, encoding: 'float' });
    for (const normal of [[0, 1, 0], [1, 0, 0], [0, -1, 0], [.6, .8, 0]]) evaluateLandscapeSkyIrradiance(uniform.coefficients, normal).forEach(value => assert.ok(Math.abs(value - 2 * Math.PI) < 1e-9));
    assert.ok(Math.abs(landscapeSkyRadianceBands(uniform.coefficients, [0, 0, 1], [1, .76, .76 * .76])[0] - 2) < 1e-9, 'band 0 radiance is the mean radiance');
    const linear = projectLandscapeSkyIrradiance({ width, height, data: gradient, channels: 3, encoding: 'float' });
    // E(n) of L = 1 + y is π + (2π/3)·n.y exactly, up to the midpoint rule of the 32 rows
    for (const normal of [[0, 1, 0], [0, -1, 0], [1, 0, 0]]) assert.ok(Math.abs(evaluateLandscapeSkyIrradiance(linear.coefficients, normal)[1] - (Math.PI + 2 * Math.PI / 3 * normal[1])) < 2e-3);
    assert.ok(Math.abs(landscapeSkyRadianceBands(linear.coefficients, [0, 1, 0], [0, 1, 0])[2] - 1) < 2e-3, 'band 1 radiance of L = 1 + y along +Y is 1');
    assert.deepEqual(landscapeSkyBasis([0, 1, 0]), [1, 0, 1, 0, 0, 0, 2, 0, 0, 8, 16]);
});

test('Sky irradiance: a city binding yaw rotates the game-frame environment into landscape space', () => {
    const turned = projectLandscapeSkyIrradiance(hdr, { yawDegrees: 30 }), yaw = 30 * Math.PI / 180;
    for (const landscape of [[1, 0, 0], [0, 0, 1], [.48, .6, -.64]]) {
        // landscape → city: x' = c·x + s·z, z' = -s·x + c·z (landscapePointToCity without translation)
        const city = [Math.cos(yaw) * landscape[0] + Math.sin(yaw) * landscape[2], landscape[1], -Math.sin(yaw) * landscape[0] + Math.cos(yaw) * landscape[2]];
        const a = evaluateLandscapeSkyIrradiance(turned.coefficients, landscape), b = evaluateLandscapeSkyIrradiance(sky.coefficients, city);
        a.forEach((value, channel) => assert.ok(Math.abs(value - b[channel]) < 1e-6 * Math.max(1, b[channel]), `${landscape} channel ${channel}`));
    }
});

test('Sky irradiance: three.js half-float texels project like their float values; the horizon band and the uniform layout are exact', () => {
    assert.equal(decodeLandscapeHalfFloat(0x3c00), 1);
    assert.equal(decodeLandscapeHalfFloat(0xc000), -2);
    assert.equal(decodeLandscapeHalfFloat(0x0001), 2 ** -24);
    assert.equal(decodeLandscapeHalfFloat(0x7bff), 65504);
    assert.equal(decodeLandscapeHalfFloat(0x7c00), Infinity);
    assert.throws(() => decodeLandscapeHalfFloat(0x10000), /16-bit/);
    const projected = projectLandscapeSkyIrradiance(toHalfFloatImage(hdr));
    projected.coefficients.forEach((value, index) => assert.ok(Math.abs(value - sky.coefficients[index]) <= 2e-3 * Math.max(.1, Math.abs(sky.coefficients[index])), `coefficient ${index}`));
    const horizon = landscapeSkyHorizonRadiance(hdr);
    horizon.forEach(value => assert.ok(value > 15 && value < 20, 'the clear sky is brightest just above the horizon'));
    assert.throws(() => landscapeSkyHorizonRadiance(hdr, { maxElevationDeg: 0 }), /horizon band/);
    const packed = packLandscapeSkyUniform(sky.coefficients, [1.1, 1.2, 1.3]);
    for (let channel = 0; channel < 3; channel++) {
        for (let index = 0; index < 11; index++) assert.equal(packed[channel * 12 + index], Math.fround(sky.coefficients[index * 3 + channel]));
        assert.equal(packed[channel * 12 + 11], Math.fround([1.1, 1.2, 1.3][channel]));
    }
    assert.throws(() => packLandscapeSkyUniform(sky.coefficients, [1, 1]), /calibration/);
    assert.throws(() => projectLandscapeSkyIrradiance({ ...hdr, encoding: 'half' }), /encoding/);
});
