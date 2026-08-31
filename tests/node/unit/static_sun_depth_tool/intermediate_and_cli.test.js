// Verifies exact proof descriptor validation and explicit fixture-mode CLI policy.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createStaticSunDepthUsageText,
    parseStaticSunDepthCliArgs
} from '../../../../tools/static_sun_depth/src/CliArguments.mjs';
import {
    selectStaticSunDepthIntermediate,
    validateStaticSunDepthDescriptor
} from '../../../../tools/static_sun_depth/src/IntermediateDepth.mjs';
import { StaticSunDepthToolError } from '../../../../tools/static_sun_depth/src/StaticSunDepthToolError.mjs';
import { depthDescriptor } from './fixture.js';

test('AI529 proof descriptor accepts only the canonical component and camera contract', () => {
    const validated = validateStaticSunDepthDescriptor(depthDescriptor());
    assert.equal(validated.camera.clipNearMeters, 1);
    assert.equal(validated.camera.clipFarMeters, 11);
    assert.deepEqual(validated.components, [
        'light_space_x_meters',
        'light_space_y_meters',
        'nearest_positive_depth_meters',
        'occupancy'
    ]);

    const wrongComponent = depthDescriptor();
    wrongComponent.components[2] = 'normalized_depth';
    assert.throws(
        () => validateStaticSunDepthDescriptor(wrongComponent),
        (error) => error instanceof StaticSunDepthToolError && error.code === 'static_sun_depth_descriptor_invalid'
    );
    const extra = depthDescriptor();
    extra.camera.autoFit = true;
    assert.throws(() => validateStaticSunDepthDescriptor(extra), StaticSunDepthToolError);
});

test('checked proof profile retains exact 32x32 output identity', () => {
    const manifest = {
        outputs: [{
            canonical: { height: 32, width: 32 },
            channel: 'static_sun_depth',
            descriptor: depthDescriptor(),
            id: 'proof_static_sun_depth_position'
        }],
        profile: { id: 'ai529.proof.cycles_cpu.threads_12.v1' }
    };
    assert.equal(selectStaticSunDepthIntermediate(manifest).output.id, 'proof_static_sun_depth_position');
    manifest.outputs[0].canonical.width = 64;
    assert.throws(
        () => selectStaticSunDepthIntermediate(manifest),
        (error) => error instanceof StaticSunDepthToolError && error.code === 'ai529_proof_shape_invalid'
    );
});

test('CLI requires explicit paths, parses fixture mode, and documents production rejection', () => {
    assert.deepEqual(parseStaticSunDepthCliArgs([
        '--input', 'input.json',
        '--output-root', 'artifacts',
        '--guard-pixels', '4',
        '--run-id', 'fixture-01',
        '--fixture'
    ]), {
        fixture: true,
        guardPixels: 4,
        help: false,
        manifestPath: 'input.json',
        outputRoot: 'artifacts',
        runId: 'fixture-01'
    });
    assert.equal(parseStaticSunDepthCliArgs(['--help']).help, true);
    assert.match(createStaticSunDepthUsageText(), /Without --fixture.*rejected/s);
    assert.throws(
        () => parseStaticSunDepthCliArgs(['--input', 'input.json']),
        (error) => error instanceof StaticSunDepthToolError && error.code === 'cli_argument_required'
    );
});
