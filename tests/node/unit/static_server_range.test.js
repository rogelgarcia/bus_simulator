import assert from 'node:assert/strict';
import test from 'node:test';
import {parseSingleByteRange} from '../../headless/e2e/static_server_range.mjs';

test('static server byte ranges support full, open, bounded, and suffix requests', () => {
    assert.equal(parseSingleByteRange(undefined, 100), null);
    assert.deepEqual(parseSingleByteRange('bytes=10-19', 100), {
        satisfiable: true, start: 10, end: 19, length: 10
    });
    assert.deepEqual(parseSingleByteRange('bytes=90-', 100), {
        satisfiable: true, start: 90, end: 99, length: 10
    });
    assert.deepEqual(parseSingleByteRange('bytes=-12', 100), {
        satisfiable: true, start: 88, end: 99, length: 12
    });
    assert.deepEqual(parseSingleByteRange('bytes=95-500', 100), {
        satisfiable: true, start: 95, end: 99, length: 5
    });
});

test('static server byte ranges reject malformed or unsatisfiable requests', () => {
    for (const header of [
        'items=0-1',
        'bytes=',
        'bytes=5-4',
        'bytes=100-101',
        'bytes=0-1,4-5',
        'bytes=-0'
    ]) {
        assert.deepEqual(parseSingleByteRange(header, 100), {satisfiable: false});
    }
    assert.deepEqual(parseSingleByteRange('bytes=0-0', 0), {satisfiable: false});
});
