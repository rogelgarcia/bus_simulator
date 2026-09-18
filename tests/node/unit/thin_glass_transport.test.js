// Numerical transport, source identity and unsupported-path rejection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bakeThinGlassTransport, validateThinGlassBake, thinGlassProfileKey } from '../../../src/app/illumination/ThinGlassTransport.js';
const profile = JSON.parse(readFileSync(new URL('../../../tools/bake_lighting/glass_transmission/profile.json', import.meta.url)));

test('Thin glass: colored sun retains energy bounds and unoccluded white illumination', () => {
    const bake = bakeThinGlassTransport(profile);
    assert.ok(validateThinGlassBake(bake, profile));
    const sample = (x, z) => {
        const ix = Math.floor((x + 5) / 10 * 128), iy = Math.floor((z + 6) / 8 * 128);
        return bake.data.slice((iy * 128 + ix) * 3, (iy * 128 + ix) * 3 + 3);
    };
    assert.deepEqual(sample(4, 1), [1, 1, 1]);
    const amber = sample(-2, -2), blue = sample(2, -2), clear = sample(0, -2);
    assert.ok(amber[0] > amber[1] * 2 && amber[1] > amber[2] * 3);
    assert.ok(blue[2] > blue[0] * 5 && clear[2] > blue[2]);
    const fresnel = .043 + (1 - .043) * (1 - Math.SQRT1_2) ** 5;
    assert.ok(Math.abs(amber[0] - .82 * (1 - fresnel)) < 1e-8);
    assert.ok(bake.data.every(v => v >= 0 && v <= 1));
});

test('Thin glass: sun, geometry and material invalidate; exposure and albedo do not', () => {
    const bake = bakeThinGlassTransport(profile, { resolution: 16 });
    for (const mutate of [p => { p.panes[0].z += .1; }, p => { p.panes[0].transmittance[0] = .5; },
        p => { p.receiver.y += .1; }, p => { p.sunDirection = [0, .6, .8]; }]) {
        const changed = structuredClone(profile); mutate(changed);
        assert.equal(validateThinGlassBake(bake, changed), false);
    }
    assert.equal(thinGlassProfileKey({ ...profile, exposure: 8, receiverAlbedo: [1, 0, 0] }), bake.profileKey);
    assert.throws(() => bakeThinGlassTransport({ ...profile, model: 'curved-volume' }), /Unsupported/);
    const thick = structuredClone(profile); thick.panes[0].thicknessMeters = .01;
    assert.throws(() => bakeThinGlassTransport(thick), /Unsupported pane/);
    assert.throws(() => validateThinGlassBake({ ...bake, data: [NaN] }, profile), /samples/);
    assert.throws(() => validateThinGlassBake({ ...bake, profileKey: 'stale' }, profile), /Corrupt/);
});
