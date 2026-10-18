// Verifies the AI 597 options of the landscape review tools: the capture tool's ocean surface, sea state and fixed time, the clip tool's options and its frame-difference statistic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_CAPTURE_DEFAULTS, parseCaptureOptions } from '../../../tools/landscape_review/capture.mjs';
import { frameDifference, parseClipOptions } from '../../../tools/landscape_review/clip.mjs';
import { LANDSCAPE_OCEAN } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanModel.js';

const base = ['--landscape', 'assets/public/landscape/coastal-city-v3', '--output', 'tests/artifacts/screens/landscape/ai597/tmp'];

test('Capture tool: the ocean defaults fix the animated sea at 30 s, the options validate', () => {
    const defaults = parseCaptureOptions(base);
    assert.deepEqual({ ocean: defaults.ocean, seaState: defaults.seaState, oceanTime: defaults.oceanTime }, { ocean: LANDSCAPE_OCEAN.defaultSurface, seaState: LANDSCAPE_OCEAN.defaultSeaState, oceanTime: 30 });
    assert.equal(REVIEW_CAPTURE_DEFAULTS.oceanTime, 30);
    const chosen = parseCaptureOptions([...base, '--ocean', 'flat', '--sea-state', 'rough', '--ocean-time', '12.5']);
    assert.deepEqual({ ocean: chosen.ocean, seaState: chosen.seaState, oceanTime: chosen.oceanTime }, { ocean: 'flat', seaState: 'rough', oceanTime: 12.5 });
    assert.throws(() => parseCaptureOptions([...base, '--ocean', 'off']), /--ocean must be one of animated, flat/);
    assert.throws(() => parseCaptureOptions([...base, '--sea-state', 'storm']), /--sea-state must be one of calm, moderate, rough/);
    assert.throws(() => parseCaptureOptions([...base, '--ocean-time=-1']), /--ocean-time must be a nonnegative number/);
    assert.throws(() => parseCaptureOptions([...base, '--ocean-time', 'soon']), /--ocean-time must be a nonnegative number/);
});

test('Clip tool: options validate and the frame difference measures a region', () => {
    const options = parseClipOptions([...base, '--pose', 'NW-12', '--frames', '12', '--fps', '24', '--move', '0.5,0,0.25', '--region', '0,10,20,30']);
    assert.deepEqual({ poseId: options.poseId, frames: options.frames, fps: options.fps, move: options.move, region: options.region, ocean: options.ocean, seaState: options.seaState, oceanTime: options.oceanTime },
        { poseId: 'NW-12', frames: 12, fps: 24, move: [.5, 0, .25], region: [0, 10, 20, 30], ocean: 'animated', seaState: 'moderate', oceanTime: 30 });
    assert.equal(parseClipOptions([...base, '--pose', 'NW-10']).move, null);
    assert.throws(() => parseClipOptions(base), /--landscape, --output and --pose are required/);
    assert.throws(() => parseClipOptions([...base, '--pose', 'NW-10', '--frames', '1']), /--frames must be an integer from 2 to 3000/);
    assert.throws(() => parseClipOptions([...base, '--pose', 'NW-10', '--move', '1,2']), /--move needs 3 comma-separated numbers/);
    const width = 4, a = new Uint8Array(width * 2 * 4), b = new Uint8Array(width * 2 * 4);
    // the second row differs by 10 luminance units in one pixel and 20 in another; the first row is identical
    b.set([10, 10, 10, 255], (width + 1) * 4); b.set([20, 20, 20, 255], (width + 3) * 4);
    const whole = frameDifference(a, b, width, [0, 0, 4, 2]);
    assert.ok(Math.abs(whole.mean - 30 / 8) < 1e-9 && Math.abs(whole.max - 20) < 1e-9);
    assert.deepEqual(frameDifference(a, b, width, [0, 0, 4, 1]), { mean: 0, max: 0 });
});
