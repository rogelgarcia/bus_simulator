// Node simulation tests: GameLoop fixed-step stepping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLoop } from '../../../src/app/core/GameLoop.js';
import { EventBus } from '../../../src/app/core/EventBus.js';
import { runFixedSteps } from '../../shared/fixed_step.js';
import { assertNear } from '../../shared/assert.js';

test('GameLoop: fixed-step increments frameCount and emits frame dt', () => {
    const events = new EventBus();
    const frameDts = [];
    events.on('gameloop:frame', (e) => frameDts.push(e.dt));

    const simulation = {
        events,
        physics: { update: () => {} }
    };

    const loop = new GameLoop(simulation);
    runFixedSteps({
        ticks: 10,
        dt: 1 / 60,
        update: (dt) => loop.update(dt)
    });

    assert.equal(loop.getFrameCount(), 10);
    assert.equal(frameDts.length, 10);
    for (const dt of frameDts) assertNear(dt, 1 / 60, 1e-12, 'dt mismatch.');
});

test('GameLoop: timeScale scales dt deterministically', () => {
    const events = new EventBus();
    let lastDt = null;
    events.on('gameloop:frame', (e) => { lastDt = e.dt; });

    let physicsDt = null;
    const simulation = {
        events,
        physics: { update: (dt) => { physicsDt = dt; } }
    };

    const loop = new GameLoop(simulation);
    loop.setTimeScale(0.5);
    loop.update(0.2);

    assertNear(lastDt, 0.1, 1e-12);
    assertNear(physicsDt, 0.1, 1e-12);
});

test('GameLoop: paused loop emits frame with dt=0 and does not advance frameCount', () => {
    const events = new EventBus();
    let last = null;
    events.on('gameloop:frame', (e) => { last = e; });

    let physicsCalls = 0;
    const simulation = {
        events,
        physics: { update: () => { physicsCalls++; } }
    };

    const loop = new GameLoop(simulation);
    loop.pause();
    loop.update(0.25);

    assert.equal(loop.getFrameCount(), 0);
    assert.equal(physicsCalls, 0);
    assert.ok(last && last.paused === true);
    assert.equal(last.dt, 0);
});

