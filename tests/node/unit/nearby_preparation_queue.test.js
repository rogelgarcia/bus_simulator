// Tests scheduling contracts using a controlled clock, independent of GPU speed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PreparationQueue } from '../../../src/graphics/visuals/preparation/PreparationQueue.js';

test('Preparation queue deduplicates and gives nearer resources bounded capacity', () => {
    const q = new PreparationQueue({ maxJobs: 2 });
    const events = [];
    const job = (name, priority) => ({ priority, step: () => { events.push(name); return { done: true, bytes: 1 }; },
        cancel: () => events.push(`release:${name}`) });
    q.add('far', job('far', 50)); q.add('middle', job('middle', 20));
    assert.equal(q.add('far', job('duplicate', 40)), false);
    assert.equal(q.add('too-far', job('too-far', 80)), false);
    q.add('near', job('near', 1));
    assert.deepEqual(events, ['release:far']);
    q.run({ milliseconds: 100, bytes: 10 });
    assert.deepEqual(events, ['release:far', 'near', 'release:near', 'middle', 'release:middle']);
    assert.equal(q.jobs.size, 0);
});

test('Preparation queue stops after a nonpreemptible overrun and reports it', () => {
    let now = 0, ran = 0;
    const q = new PreparationQueue({ clock: () => now });
    for (let i = 0; i < 3; i++) q.add(i, { priority: i, step() { ran++; now += 3; return { done: true }; } });
    q.run({ milliseconds: 0, bytes: 1024 }); assert.equal(ran, 0);
    const frame = q.run({ milliseconds: 1, bytes: 1024 });
    assert.equal(ran, 1); assert.equal(frame.cpuMs, 3); assert.equal(q.stats.overruns, 1);
    assert.equal(frame.pending, 2);
});

test('Preparation queue enforces byte and step limits without pending work starving ready jobs', () => {
    const q = new PreparationQueue(); let released = 0;
    q.add('decoding', { priority: 0, step: () => ({ waiting: true }), cancel: () => released++ });
    for (let i = 0; i < 4; i++) q.add(i, { priority: i + 1, step: budget => budget >= 8
        ? { done: true, bytes: 8 } : { waiting: true }, cancel: () => released++ });
    assert.equal(q.run({ milliseconds: 100, bytes: 17 }).bytes, 16);
    assert.equal(q.run({ milliseconds: 100, bytes: 1024, steps: 1 }).steps, 1);
    assert.equal(q.jobs.size, 2);
    q.clear(); q.clear(); assert.equal(released, 5); assert.equal(q.jobs.size, 0);
});

test('Preparation queue yields after an exclusive driver operation', () => {
    const q = new PreparationQueue(); let later = 0;
    q.add('target', { priority: 0, step: () => ({ done: true, exclusive: true }) });
    q.add('shader', { priority: 1, step: () => { later++; return { done: true }; } });
    assert.equal(q.run({ milliseconds: 100, bytes: 1024, steps: 16 }).steps, 1);
    assert.equal(later, 0); assert.equal(q.jobs.size, 1);
    q.run({ milliseconds: 100, bytes: 1024 }); assert.equal(later, 1);
});
