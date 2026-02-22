// Node unit tests: DisposerRegistry deterministic teardown.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DisposerRegistry } from '../../../src/graphics/gui/terrain_debugger/view/controllers/DisposerRegistry.js';

test('DisposerRegistry: disposes in LIFO order', () => {
    const order = [];
    const registry = new DisposerRegistry({ label: 'unit' });
    registry.add(() => order.push('first'));
    registry.add(() => order.push('second'));
    registry.add(() => order.push('third'));

    const errors = registry.disposeAll();
    assert.equal(errors.length, 0);
    assert.deepEqual(order, ['third', 'second', 'first']);
    assert.equal(registry.isDisposed, true);
});

test('DisposerRegistry: tracks and removes event listeners', () => {
    const calls = [];
    let attachedListener = null;
    const target = {
        addEventListener(eventName, listener, options) {
            calls.push(['add', eventName, options]);
            attachedListener = listener;
        },
        removeEventListener(eventName, listener, options) {
            calls.push(['remove', eventName, options]);
            assert.equal(listener, attachedListener);
        }
    };

    const registry = new DisposerRegistry({ label: 'unit' });
    const options = { capture: true, passive: false };
    const listener = () => {};
    registry.addEventListener(target, 'keydown', listener, options);

    const errors = registry.disposeAll();
    assert.equal(errors.length, 0);
    assert.deepEqual(calls, [
        ['add', 'keydown', options],
        ['remove', 'keydown', options]
    ]);
});
