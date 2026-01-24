// Node unit tests: StateMachine transitions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { StateMachine } from '../../../src/app/core/StateMachine.js';

test('StateMachine: go() calls exit/enter and sets currentName', () => {
    const calls = [];
    const sm = new StateMachine();

    sm.register('a', {
        enter: (p) => calls.push(['a.enter', p]),
        exit: () => calls.push(['a.exit'])
    });
    sm.register('b', {
        enter: (p) => calls.push(['b.enter', p]),
        exit: () => calls.push(['b.exit'])
    });

    sm.go('a', { v: 1 });
    assert.equal(sm.currentName, 'a');
    sm.go('b', { v: 2 });
    assert.equal(sm.currentName, 'b');

    assert.deepEqual(calls, [
        ['a.enter', { v: 1 }],
        ['a.exit'],
        ['b.enter', { v: 2 }]
    ]);
});

test('StateMachine: update forwards dt', () => {
    const sm = new StateMachine();
    let lastDt = null;
    sm.register('a', { update: (dt) => { lastDt = dt; } });
    sm.go('a');
    sm.update(0.25);
    assert.equal(lastDt, 0.25);
});

test('StateMachine: overlays do not replace current state', () => {
    const calls = [];
    const sm = new StateMachine();

    sm.register('base', {
        enter: () => calls.push(['base.enter']),
        update: (dt) => calls.push(['base.update', dt]),
        pause: (p) => calls.push(['base.pause', p]),
        resume: (p) => calls.push(['base.resume', p])
    });

    sm.register('overlay', {
        enter: (p) => calls.push(['overlay.enter', p]),
        update: (dt) => calls.push(['overlay.update', dt]),
        exit: (p) => calls.push(['overlay.exit', p])
    });

    sm.go('base');
    sm.pushOverlay('overlay', { v: 1 });

    assert.equal(sm.currentName, 'base');
    assert.equal(sm.isOverlayOpen('overlay'), true);

    sm.update(0.25);
    sm.popOverlay();
    sm.update(0.5);

    assert.deepEqual(calls, [
        ['base.enter'],
        ['base.pause', { nextName: 'overlay', nextParams: { v: 1 } }],
        ['overlay.enter', { v: 1, overlay: true, returnTo: 'base' }],
        ['base.update', 0.25],
        ['overlay.update', 0.25],
        ['overlay.exit', { nextName: 'base', nextParams: {} }],
        ['base.resume', { fromName: 'overlay', fromParams: {} }],
        ['base.update', 0.5]
    ]);
});
