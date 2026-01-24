// Shared assertion helpers for Node/browser tests.
import assert from 'node:assert/strict';

export function assertNear(actual, expected, eps = 1e-6, message = '') {
    const a = Number(actual);
    const e = Number(expected);
    const tol = Number(eps);
    assert.ok(Number.isFinite(a), `${message} Expected finite actual, got ${actual}`);
    assert.ok(Number.isFinite(e), `${message} Expected finite expected, got ${expected}`);
    assert.ok(Number.isFinite(tol) && tol >= 0, `${message} Expected finite eps, got ${eps}`);
    assert.ok(Math.abs(a - e) <= tol, `${message} Expected ${expected}±${eps}, got ${actual}`);
}

