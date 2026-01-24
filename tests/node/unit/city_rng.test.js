// Node unit tests: CityRNG determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CityRNG } from '../../../src/app/city/CityRNG.js';

test('CityRNG: same seed produces same sequence', () => {
    const a = new CityRNG('seed-a');
    const b = new CityRNG('seed-a');

    const seqA = Array.from({ length: 10 }, () => a.float());
    const seqB = Array.from({ length: 10 }, () => b.float());
    assert.deepEqual(seqA, seqB);
});

test('CityRNG: different seeds produce different sequence (high probability)', () => {
    const a = new CityRNG('seed-a');
    const b = new CityRNG('seed-b');

    const seqA = Array.from({ length: 8 }, () => a.float());
    const seqB = Array.from({ length: 8 }, () => b.float());
    assert.notDeepEqual(seqA, seqB);
});

test('CityRNG: int(maxExclusive) stays in range', () => {
    const rng = new CityRNG('range');
    for (let i = 0; i < 50; i++) {
        const v = rng.int(7);
        assert.ok(Number.isInteger(v));
        assert.ok(v >= 0 && v < 7);
    }
});

test('CityRNG: shuffle is deterministic and preserves items', () => {
    const a = new CityRNG('shuffle');
    const b = new CityRNG('shuffle');
    const input = [1, 2, 3, 4, 5, 6, 7];

    const sa = a.shuffle(input.slice());
    const sb = b.shuffle(input.slice());
    assert.deepEqual(sa, sb);

    const sorted = sa.slice().sort((x, y) => x - y);
    assert.deepEqual(sorted, input);
});

