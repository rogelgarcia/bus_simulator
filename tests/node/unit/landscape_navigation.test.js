// Verifies camera-relative navigation speed, elevation isolation and held-key release.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LandscapeNavigationState, LANDSCAPE_NAVIGATION } from '../../../src/graphics/gui/landscape_fabrication/LandscapeNavigationState.js';

test('Landscape navigation: arrows move horizontally relative to yaw without changing elevation', () => {
    const input = new LandscapeNavigationState();
    input.setKey('ArrowUp', true);
    const north = input.step(.1, Math.PI);
    assert.ok(Math.abs(north.x) < 1e-12);
    assert.equal(north.y, 0);
    assert.equal(north.z, 3.6);
    const east = input.step(.1, -Math.PI / 2);
    assert.equal(east.x, 3.6);
    assert.ok(Math.abs(east.z) < 1e-12);
    input.setKey('ArrowRight', true);
    const diagonal = input.step(.1, 0);
    assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 3.6) < 1e-12);
});

test('Landscape navigation: PageUp/Down affect only world elevation and normalize combined travel', () => {
    const input = new LandscapeNavigationState();
    input.setKey('PageUp', true);
    const rise = input.step(.1, .63);
    assert.equal(Math.abs(rise.x), 0); assert.equal(Math.abs(rise.z), 0); assert.equal(rise.y, 3.6);
    input.setKey('PageUp', false); input.setKey('PageDown', true);
    assert.equal(input.step(.1, .63).y, -3.6);
    input.setKey('ArrowUp', true); input.setKey('ShiftLeft', true);
    const combined = input.step(.1, .63);
    assert.ok(Math.abs(Math.hypot(combined.x, combined.y, combined.z) - 8.4) < 1e-12);
});

test('Landscape navigation: repeated/alias/opposing keys and focus clearing never add speed or leave motion held', () => {
    const input = new LandscapeNavigationState();
    input.setKey('ArrowUp', true); input.setKey('ArrowUp', true); input.setKey('KeyW', true);
    assert.equal(input.step(.1, 0).z, -3.6);
    input.setKey('ArrowDown', true);
    assert.equal(Math.hypot(...Object.values(input.step(.1, 0))), 0);
    input.clear();
    assert.equal(Math.hypot(...Object.values(input.step(.1, 0))), 0);
    assert.equal(input.setKey('Space', true), false);
    assert.equal(Math.hypot(...Object.values(input.step(.1, 0))), 0);
});

test('Landscape navigation: seconds-based motion is refresh independent, clamped after stalls and validates inputs', () => {
    const input = new LandscapeNavigationState(); input.setKey('ArrowRight', true);
    const travel = hz => Array.from({ length: hz }, () => input.step(1 / hz, 0).x).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(travel(60) - LANDSCAPE_NAVIGATION.speed) < 1e-10);
    assert.ok(Math.abs(travel(120) - travel(60)) < 1e-10);
    assert.equal(input.step(3, 0).x, 3.6);
    assert.equal(input.step(0, 0).x, 0);
    assert.throws(() => input.step(-1, 0), /finite nonnegative/);
    assert.throws(() => input.step(.1, NaN), /finite yaw/);
    assert.equal(LANDSCAPE_NAVIGATION.fov, 55);
});
