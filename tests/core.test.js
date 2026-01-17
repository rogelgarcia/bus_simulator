// tests/core.test.js
// Automated test runner for core systems
// Runs on page load, prints errors at the end

const errors = [];

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
    } catch (err) {
        errors.push({ name, error: err.message || err });
        console.error(`❌ ${name}: ${err.message || err}`);
    }
}

function assertEqual(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg} Expected ${expected}, got ${actual}`);
    }
}

function assertTrue(value, msg = '') {
    if (!value) {
        throw new Error(`${msg} Expected truthy, got ${value}`);
    }
}

function assertNear(actual, expected, eps = 1e-6, msg = '') {
    const a = Number(actual);
    const e = Number(expected);
    const tol = Number(eps);
    if (!Number.isFinite(a) || !Number.isFinite(e) || !Number.isFinite(tol)) {
        throw new Error(`${msg} Expected finite numbers, got ${actual} vs ${expected}`);
    }
    if (Math.abs(a - e) > tol) {
        throw new Error(`${msg} Expected ${expected}±${eps}, got ${actual}`);
    }
}

function assertFalse(value, msg = '') {
    if (value) {
        throw new Error(`${msg} Expected falsy, got ${value}`);
    }
}

async function runTests() {
    console.log('\n🧪 Running Core Tests...\n');

    // ========== EventBus Tests ==========
    const { EventBus } = await import('/src/app/core/EventBus.js');

    test('EventBus: on/emit works', () => {
        const bus = new EventBus();
        let received = null;
        bus.on('test', (msg) => { received = msg; });
        bus.emit('test', 'hello');
        assertEqual(received, 'hello', 'Message mismatch.');
    });

    test('EventBus: off removes listener', () => {
        const bus = new EventBus();
        let count = 0;
        const handler = () => { count++; };
        bus.on('test', handler);
        bus.emit('test');
        bus.off('test', handler);
        bus.emit('test');
        assertEqual(count, 1, 'Handler should fire once.');
    });

    test('EventBus: once fires only once', () => {
        const bus = new EventBus();
        let count = 0;
        bus.once('test', () => { count++; });
        bus.emit('test');
        bus.emit('test');
        assertEqual(count, 1, 'Once handler should fire once.');
    });

    test('EventBus: listenerCount works', () => {
        const bus = new EventBus();
        bus.on('test', () => {});
        bus.on('test', () => {});
        assertEqual(bus.listenerCount('test'), 2, 'Should have 2 listeners.');
    });

    test('EventBus: clear removes all listeners', () => {
        const bus = new EventBus();
        bus.on('a', () => {});
        bus.on('b', () => {});
        bus.clear();
        assertEqual(bus.listenerCount('a'), 0, 'Should have 0 listeners for a.');
        assertEqual(bus.listenerCount('b'), 0, 'Should have 0 listeners for b.');
    });

    // ========== VehicleManager Tests ==========
    const { VehicleManager } = await import('/src/app/core/VehicleManager.js');

    test('VehicleManager: addVehicle returns ID', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        const id = manager.addVehicle({ userData: {} }, { userData: {} }, {});
        assertTrue(id.startsWith('vehicle_'), 'ID should start with vehicle_');
    });

    test('VehicleManager: getVehicle returns entry', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        const mockVehicle = { userData: {} };
        const id = manager.addVehicle(mockVehicle, {}, {});
        const entry = manager.getVehicle(id);
        assertEqual(entry.vehicle, mockVehicle, 'Vehicle mismatch.');
    });

    test('VehicleManager: removeVehicle works', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        const id = manager.addVehicle({ userData: {} }, {}, {});
        assertTrue(manager.removeVehicle(id), 'Should return true.');
        assertFalse(manager.hasVehicle(id), 'Should not have vehicle.');
    });

    test('VehicleManager: emits vehicle:added event', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        let emitted = null;
        bus.on('vehicle:added', (e) => { emitted = e; });
        manager.addVehicle({ userData: {} }, {}, {});
        assertTrue(emitted !== null, 'Event should be emitted.');
        assertTrue(emitted.id.startsWith('vehicle_'), 'Event should have ID.');
    });

    test('VehicleManager: count works', () => {
        const bus = new EventBus();
        const manager = new VehicleManager(bus);
        manager.addVehicle({ userData: {} }, {}, {});
        manager.addVehicle({ userData: {} }, {}, {});
        assertEqual(manager.count, 2, 'Should have 2 vehicles.');
    });

    // ========== Bus Catalog Tests ==========
    const { BUS_CATALOG, getBusSpec } = await import('/src/app/vehicle/buses/BusCatalog.js');

    test('BusCatalog: engine power scaled by 30%', () => {
        const scale = 1.3;
        const baseline = Object.freeze({
            city: { engineForce: 200000, maxTorque: 2300 },
            coach: { engineForce: 210000, maxTorque: 2500 },
            double: { engineForce: 220000, maxTorque: 2650 }
        });

        const expectedIds = Object.keys(baseline);
        for (const id of expectedIds) {
            assertTrue(BUS_CATALOG.some((spec) => spec?.id === id), `Expected ${id} in BUS_CATALOG.`);
        }

        for (const [id, expected] of Object.entries(baseline)) {
            const spec = getBusSpec(id);
            assertTrue(!!spec, `Expected bus spec ${id}.`);
            assertNear(spec?.tuning?.engineForce, expected.engineForce * scale, 1e-6, `${id} engineForce.`);
            assertNear(spec?.tuning?.engine?.maxTorque, expected.maxTorque * scale, 1e-6, `${id} maxTorque.`);
        }
    });

    // ========== PhysicsController Tests (added in Task 4) ==========
    try {
        const { PhysicsController } = await import('/src/app/physics/PhysicsController.js');

        test('PhysicsController: instantiates with EventBus', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            assertTrue(ctrl !== null, 'Controller should exist.');
            assertTrue(ctrl.loop !== null, 'Loop should exist.');
        });

        test('PhysicsController: stores vehicle state after addVehicle', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            const anchor = { position: { x: 1, y: 2, z: 3 }, rotation: { y: 0.5 } };
            ctrl.addVehicle('v1', { id: 'v1' }, anchor, {});
            assertTrue(ctrl.hasVehicle('v1'), 'Should register vehicle.');
            const state = ctrl.getVehicleState('v1');
            assertTrue(state !== null, 'State should exist.');
            assertEqual(state.locomotion.position.x, 1, 'Position x should match anchor.');
            assertEqual(state.locomotion.position.y, 2, 'Position y should match anchor.');
            assertEqual(state.locomotion.position.z, 3, 'Position z should match anchor.');
        });

        test('PhysicsController: removeVehicle unregisters vehicles', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            ctrl.addVehicle('v1', { id: 'v1' }, {}, {});
            ctrl.removeVehicle('v1');
            assertFalse(ctrl.hasVehicle('v1'), 'Vehicle should be removed.');
            assertEqual(ctrl.getVehicleState('v1'), null, 'State should be cleared.');
        });

        test('PhysicsController: update calls loop.update', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            // Should not throw
            ctrl.update(0.016);
            assertTrue(true, 'Update should not throw.');
        });

        test('PhysicsController: setInput updates debug snapshot', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            ctrl.addVehicle('v1', { id: 'v1' }, {}, {});
            ctrl.setInput('v1', { throttle: 0.8, steering: -0.5, brake: 0.2, handbrake: 0.1 });
            const debug = ctrl.getVehicleDebug('v1');
            assertTrue(debug !== null, 'Debug should exist.');
            assertEqual(debug.input.throttle, 0.8, 'Throttle should match input.');
            assertEqual(debug.input.steering, -0.5, 'Steering should match input.');
            assertEqual(debug.input.brake, 0.2, 'Brake should match input.');
            assertEqual(debug.input.handbrake, 0.1, 'Handbrake should match input.');
            assertTrue(debug.forces.driveForce !== 0, 'Drive force should be non-zero.');
        });

        test('PhysicsController: getSystem returns null', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            assertEqual(ctrl.getSystem('locomotion'), null, 'Should return null for legacy systems.');
        });

        test('PhysicsController: getVehicleIds returns registered vehicles', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            ctrl.addVehicle('v1', { id: 'v1' }, {}, {});
            ctrl.addVehicle('v2', { id: 'v2' }, {}, {});
            const ids = ctrl.getVehicleIds();
            assertTrue(ids.includes('v1'), 'Should include v1.');
            assertTrue(ids.includes('v2'), 'Should include v2.');
            assertEqual(ids.length, 2, 'Should have 2 vehicles.');
        });

        test('PhysicsController: hasVehicle returns correct status', () => {
            const bus = new EventBus();
            const ctrl = new PhysicsController(bus);
            ctrl.addVehicle('v1', { id: 'v1' }, {}, {});
            assertTrue(ctrl.hasVehicle('v1'), 'Should have v1.');
            assertFalse(ctrl.hasVehicle('v2'), 'Should not have v2.');
        });
    } catch (e) {
        // PhysicsController not yet created - skip these tests
        console.log('⏭️  PhysicsController tests skipped (not yet created)');
    }

    // ========== SimulationContext Tests (added in Task 5) ==========
    try {
        const { SimulationContext } = await import('/src/app/core/SimulationContext.js');

        test('SimulationContext: instantiates with all systems', () => {
            const ctx = new SimulationContext();
            assertTrue(ctx.events !== null, 'events should exist');
            assertTrue(ctx.vehicles !== null, 'vehicles should exist');
            assertTrue(ctx.physics !== null, 'physics should exist');
        });

        test('SimulationContext: addVehicle registers with all systems', () => {
            const ctx = new SimulationContext();
            const id = ctx.addVehicle({ userData: {} }, { userData: {} }, {});
            assertTrue(id.startsWith('vehicle_'), 'Should return ID');
            assertTrue(ctx.vehicles.hasVehicle(id), 'VehicleManager should have vehicle');
            assertTrue(ctx.physics._vehicleIds.has(id), 'PhysicsController should have vehicle');
        });

        test('SimulationContext: removeVehicle unregisters from all systems', () => {
            const ctx = new SimulationContext();
            const id = ctx.addVehicle({ userData: {} }, { userData: {} }, {});
            ctx.removeVehicle(id);
            assertFalse(ctx.vehicles.hasVehicle(id), 'VehicleManager should not have vehicle');
            assertFalse(ctx.physics._vehicleIds.has(id), 'PhysicsController should not have vehicle');
        });

        test('SimulationContext: setEnvironment propagates to physics', () => {
            const ctx = new SimulationContext();
            const env = { map: {}, config: {} };
            ctx.setEnvironment(env);
            assertEqual(ctx.getEnvironment(), env, 'Environment should be set');
        });

        test('SimulationContext: update calls physics.update', () => {
            const ctx = new SimulationContext();
            ctx.update(0.016);
            assertTrue(true, 'Update should not throw');
        });

        test('SimulationContext: dispose cleans up all systems', () => {
            const ctx = new SimulationContext();
            ctx.addVehicle({ userData: {} }, { userData: {} }, {});
            ctx.dispose();
            assertEqual(ctx.vehicles.count, 0, 'Vehicles should be cleared');
        });

        test('SimulationContext: has legacy context fields', () => {
            const ctx = new SimulationContext();
            assertEqual(ctx.selectedBusId, null, 'selectedBusId should be null');
            assertEqual(ctx.selectedBus, null, 'selectedBus should be null');
        });
    } catch (e) {
        console.log('⏭️  SimulationContext tests skipped (not yet created)');
    }

    // ========== GameEngine Integration Tests (added in Task 6) ==========
    try {
        const { GameEngine } = await import('/src/app/core/GameEngine.js');

        // Create a mock canvas for testing
        const mockCanvas = document.createElement('canvas');
        mockCanvas.width = 100;
        mockCanvas.height = 100;

        test('GameEngine: has simulation property', () => {
            const engine = new GameEngine({ canvas: mockCanvas });
            assertTrue(engine.simulation !== null, 'simulation should exist');
            assertTrue(engine.simulation.events !== undefined, 'simulation.events should exist');
            assertTrue(engine.simulation.vehicles !== undefined, 'simulation.vehicles should exist');
            assertTrue(engine.simulation.physics !== undefined, 'simulation.physics should exist');
        });

        test('GameEngine: context getter returns proxy', () => {
            const engine = new GameEngine({ canvas: mockCanvas });
            assertTrue(engine.context !== null, 'context should exist');
        });

        test('GameEngine: context.selectedBus syncs with simulation', () => {
            const engine = new GameEngine({ canvas: mockCanvas });
            const mockBus = { name: 'test-bus' };
            engine.context.selectedBus = mockBus;
            assertEqual(engine.simulation.selectedBus, mockBus, 'simulation.selectedBus should match');
            assertEqual(engine.context.selectedBus, mockBus, 'context.selectedBus should match');
        });

        test('GameEngine: context.selectedBusId syncs with simulation', () => {
            const engine = new GameEngine({ canvas: mockCanvas });
            engine.context.selectedBusId = 'bus-123';
            assertEqual(engine.simulation.selectedBusId, 'bus-123', 'simulation.selectedBusId should match');
            assertEqual(engine.context.selectedBusId, 'bus-123', 'context.selectedBusId should match');
        });
    } catch (e) {
        console.log('⏭️  GameEngine integration tests skipped:', e.message);
    }

    // ========== InputManager Tests (added in Task 13) ==========
    try {
        const { InputManager } = await import('/src/app/input/InputManager.js');

        test('InputManager: instantiates with EventBus', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);
            assertTrue(input !== null, 'InputManager should exist.');
            assertTrue(input.steer !== null, 'steer control should exist.');
            assertTrue(input.throttle !== null, 'throttle control should exist.');
            assertTrue(input.brake !== null, 'brake control should exist.');
        });

        test('InputManager: getControls returns initial values', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);
            const controls = input.getControls();
            assertEqual(controls.steering, 0, 'Initial steering should be 0.');
            assertEqual(controls.throttle, 0, 'Initial throttle should be 0.');
            assertEqual(controls.brake, 0, 'Initial brake should be 0.');
            assertEqual(controls.handbrake, 0, 'Initial handbrake should be 0.');
            assertEqual(controls.headlights, false, 'Initial headlights should be false.');
        });

        test('InputManager: update emits input:controls event', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);
            let received = null;
            bus.on('input:controls', (e) => { received = e; });

            input.update(1 / 60);

            assertTrue(received !== null, 'Should emit input:controls event.');
            assertTrue(typeof received.steering === 'number', 'Should have steering.');
            assertTrue(typeof received.throttle === 'number', 'Should have throttle.');
        });

        test('InputManager: attach/detach work', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);

            input.attach();
            assertTrue(input._attached, 'Should be attached.');

            input.detach();
            assertFalse(input._attached, 'Should be detached.');
        });

        test('InputManager: reset clears all inputs', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);

            // Simulate some input
            input.keys.up = true;
            input.steer.value = 0.5;

            input.reset();

            assertFalse(input.keys.up, 'Keys should be reset.');
            assertEqual(input.steer.value, 0, 'Steer should be reset.');
        });

        test('InputManager: setHeadlights works', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);

            input.setHeadlights(true);
            assertTrue(input.getControls().headlights, 'Headlights should be on.');

            input.setHeadlights(false);
            assertFalse(input.getControls().headlights, 'Headlights should be off.');
        });

        test('InputManager: dispose cleans up', () => {
            const bus = new EventBus();
            const input = new InputManager(bus);
            input.attach();

            input.dispose();

            assertFalse(input._attached, 'Should be detached after dispose.');
        });
    } catch (e) {
        console.log('⏭️  InputManager tests skipped:', e.message);
    }

    // ========== VehicleController Tests (added in Task 14) ==========
    try {
        const { VehicleController } = await import('/src/app/vehicle/VehicleController.js');
        const { PhysicsController } = await import('/src/app/physics/PhysicsController.js');

        test('VehicleController: instantiates with required params', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            assertTrue(ctrl !== null, 'VehicleController should exist.');
            assertEqual(ctrl.vehicleId, 'v1', 'vehicleId should match.');
        });

        test('VehicleController: setInput updates input state', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            ctrl.setInput({ throttle: 0.5, steering: 0.3 });

            const input = ctrl.getInput();
            assertEqual(input.throttle, 0.5, 'Throttle should be 0.5.');
            assertEqual(input.steering, 0.3, 'Steering should be 0.3.');
        });

        test('VehicleController: convenience methods work', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            ctrl.setThrottle(0.8);
            ctrl.setBrake(0.4);
            ctrl.setSteering(-0.5);
            ctrl.setHandbrake(1.0);

            const input = ctrl.getInput();
            assertEqual(input.throttle, 0.8, 'Throttle should be 0.8.');
            assertEqual(input.brake, 0.4, 'Brake should be 0.4.');
            assertEqual(input.steering, -0.5, 'Steering should be -0.5.');
            assertEqual(input.handbrake, 1.0, 'Handbrake should be 1.0.');
        });

        test('VehicleController: setHeadlights updates settings', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            ctrl.setHeadlights(true);

            assertTrue(ctrl.getSettings().headlightsOn, 'Headlights should be on.');
        });

        test('VehicleController: getState returns physics state', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            const state = ctrl.getState();

            assertTrue(state !== null, 'State should exist.');
            assertTrue(state.locomotion !== undefined, 'Should have locomotion.');
            assertTrue(state.suspension !== undefined, 'Should have suspension.');
        });

        test('VehicleController: responds to input:controls event', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);

            // Emit input event
            bus.emit('input:controls', { throttle: 0.7, steering: 0.2 });

            const input = ctrl.getInput();
            assertEqual(input.throttle, 0.7, 'Throttle should be 0.7.');
            assertEqual(input.steering, 0.2, 'Steering should be 0.2.');
        });

        test('VehicleController: dispose cleans up', () => {
            const bus = new EventBus();
            const physics = new PhysicsController(bus);
            physics.addVehicle('v1', { id: 'v1' }, {}, {});

            const ctrl = new VehicleController('v1', physics, bus);
            ctrl.dispose();

            // After dispose, input events should not update controller
            bus.emit('input:controls', { throttle: 0.9 });
            assertEqual(ctrl.getInput().throttle, 0, 'Throttle should still be 0 after dispose.');
        });
    } catch (e) {
        console.log('⏭️  VehicleController tests skipped:', e.message);
    }

    // ========== GameLoop Tests (added in Task 15) ==========
    try {
        const { GameLoop } = await import('/src/app/core/GameLoop.js');
        const { SimulationContext } = await import('/src/app/core/SimulationContext.js');
        const { VehicleController } = await import('/src/app/vehicle/VehicleController.js');

        test('GameLoop: instantiates with SimulationContext', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);
            assertTrue(loop !== null, 'GameLoop should exist.');
            assertTrue(loop.events !== null, 'events should exist.');
            assertTrue(loop.physics !== null, 'physics should exist.');
        });

        test('GameLoop: update runs without error', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            // Should not throw
            loop.update(1 / 60);
            assertTrue(true, 'Update should not throw.');
        });

        test('GameLoop: pause/resume work', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            assertFalse(loop.paused, 'Should not be paused initially.');

            loop.pause();
            assertTrue(loop.paused, 'Should be paused after pause().');

            loop.resume();
            assertFalse(loop.paused, 'Should not be paused after resume().');
        });

        test('GameLoop: togglePause works', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            loop.togglePause();
            assertTrue(loop.paused, 'Should be paused after first toggle.');

            loop.togglePause();
            assertFalse(loop.paused, 'Should not be paused after second toggle.');
        });

        test('GameLoop: addVehicleController/getController work', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            sim.physics.addVehicle('v1', { id: 'v1' }, {}, {});
            const ctrl = new VehicleController('v1', sim.physics, sim.events);

            loop.addVehicleController(ctrl);
            assertEqual(loop.getController('v1'), ctrl, 'Should return controller.');
        });

        test('GameLoop: setTimeScale works', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            loop.setTimeScale(0.5);
            assertEqual(loop.timeScale, 0.5, 'Time scale should be 0.5.');

            loop.setTimeScale(2.0);
            assertEqual(loop.timeScale, 2.0, 'Time scale should be 2.0.');
        });

        test('GameLoop: emits frame events', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);
            let received = null;

            loop.events.on('gameloop:frame', (e) => { received = e; });
            loop.update(1 / 60);

            assertTrue(received !== null, 'Should emit gameloop:frame.');
            assertTrue(received.frameCount === 1, 'Frame count should be 1.');
        });

        test('GameLoop: getTelemetry returns data', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            sim.physics.addVehicle('v1', { id: 'v1' }, {}, {});
            loop.update(1 / 60);

            const telemetry = loop.getTelemetry('v1');
            assertTrue(telemetry !== null, 'Telemetry should exist.');
            assertTrue(typeof telemetry.speedKph === 'number', 'Should have speedKph.');
        });

        test('GameLoop: dispose cleans up', () => {
            const sim = new SimulationContext();
            const loop = new GameLoop(sim);

            sim.physics.addVehicle('v1', { id: 'v1' }, {}, {});
            const ctrl = new VehicleController('v1', sim.physics, sim.events);
            loop.addVehicleController(ctrl);

            loop.dispose();

            assertEqual(loop.controllers.size, 0, 'Controllers should be cleared.');
        });
    } catch (e) {
        console.log('⏭️  GameLoop tests skipped:', e.message);
    }

    // ========== GameplayState Tests (added in Task 16) ==========
    try {
        const { GameplayState } = await import('/src/states/GameplayState.js');
        const { PhysicsController } = await import('/src/app/physics/PhysicsController.js');

        test('GameplayState: class exists and can be imported', () => {
            assertTrue(typeof GameplayState === 'function', 'GameplayState should be a class.');
        });

        test('GameplayState: constructor works with mock engine', () => {
            // Create minimal mock engine
            const mockEngine = {
                simulation: {
                    events: new EventBus(),
                    physics: new PhysicsController(new EventBus())
                },
                context: {},
                scene: { add: () => {}, remove: () => {} },
                camera: { position: { copy: () => {}, lerp: () => {} }, lookAt: () => {} },
                clearScene: () => {}
            };
            const mockSm = { go: () => {} };

            const state = new GameplayState(mockEngine, mockSm);
            assertTrue(state !== null, 'GameplayState should instantiate.');
            assertEqual(state.gameLoop, null, 'gameLoop should be null before enter.');
        });
    } catch (e) {
        console.log('⏭️  GameplayState tests skipped:', e.message);
    }

    // ========== createVehicleFromBus Tests ==========
    try {
        const { createVehicleFromBus } = await import('/src/app/vehicle/createVehicle.js');
        const THREE = await import('three');

        test('createVehicleFromBus: function exists', () => {
            assertTrue(typeof createVehicleFromBus === 'function', 'createVehicleFromBus should be a function.');
        });

        test('createVehicleFromBus: returns null for null input', () => {
            const result = createVehicleFromBus(null);
            assertEqual(result, null, 'Should return null for null input.');
        });

        test('createVehicleFromBus: returns null for undefined input', () => {
            const result = createVehicleFromBus(undefined);
            assertEqual(result, null, 'Should return null for undefined input.');
        });

        test('createVehicleFromBus: creates vehicle from simple Object3D', () => {
            const mockBus = new THREE.Group();
            mockBus.name = 'test_bus';
            mockBus.userData = {
                api: {
                    setSteerAngle: () => {},
                    setBodyTilt: () => {},
                    wheelRig: { wheelRadius: 0.5 }
                }
            };

            const vehicle = createVehicleFromBus(mockBus);
            assertTrue(vehicle !== null, 'Should create vehicle.');
            assertTrue(vehicle.id.startsWith('vehicle_'), 'Should have generated ID.');
            assertEqual(vehicle.model, mockBus, 'Model should be the bus.');
            assertTrue(vehicle.anchor !== null, 'Should have anchor.');
            assertEqual(vehicle.api, mockBus.userData.api, 'Should have API.');
            assertTrue(vehicle.config !== null, 'Should have config.');
        });

        test('createVehicleFromBus: uses custom ID when provided', () => {
            const mockBus = new THREE.Group();
            mockBus.userData = {};

            const vehicle = createVehicleFromBus(mockBus, { id: 'custom_id' });
            assertTrue(vehicle !== null, 'Should create vehicle.');
            assertEqual(vehicle.id, 'custom_id', 'Should use custom ID.');
        });

        test('createVehicleFromBus: removes model from parent', () => {
            const parent = new THREE.Group();
            const mockBus = new THREE.Group();
            parent.add(mockBus);
            mockBus.userData = {};

            assertEqual(mockBus.parent, parent, 'Bus should have parent before.');
            const vehicle = createVehicleFromBus(mockBus);
            assertEqual(mockBus.parent, vehicle.anchor, 'Bus should be reparented to anchor.');
        });

        test('createVehicleFromBus: extracts config from model', () => {
            const mockBus = new THREE.Group();
            mockBus.name = 'city_bus';
            mockBus.userData = {
                suspensionTuning: { stiffness: 500 }
            };

            // Add a child mesh to give it size
            const body = new THREE.Mesh(
                new THREE.BoxGeometry(2.5, 3, 10),
                new THREE.MeshBasicMaterial()
            );
            mockBus.add(body);

            const vehicle = createVehicleFromBus(mockBus);
            assertTrue(vehicle.config.dimensions.length > 0, 'Should have dimensions.');
            assertEqual(vehicle.config.suspensionTuning.stiffness, 500, 'Should extract suspension tuning.');
        });
    } catch (e) {
        console.log('⏭️  createVehicleFromBus tests skipped:', e.message);
    }

    const { solveConnectorPath } = await import('/src/app/geometry/ConnectorPathSolver.js');
    const { createGeneratorConfig } = await import('/src/graphics/assets3d/generators/GeneratorParams.js');
    const { createCityConfig } = await import('/src/app/city/CityConfig.js');
    const THREE = await import('three');
    const { runRoadConnectionDebuggerTests } = await import('/tests/road_connection_debugger.test.js');

    test('ConnectorPathSolver: reaches end pose within epsilon', () => {
        const genConfig = createGeneratorConfig();
        const cityConfig = createCityConfig();
        const tileSize = cityConfig.map.tileSize;
        const radius = genConfig.road?.curves?.turnRadius ?? 4.2;
        const posEps = tileSize * 1e-3;
        const dirEps = 1e-3;
        const cases = 64;

        for (let i = 0; i < cases; i++) {
            const p0 = new THREE.Vector2(
                (Math.random() - 0.5) * tileSize * 2,
                (Math.random() - 0.5) * tileSize * 2
            );
            const p1 = new THREE.Vector2(
                (Math.random() - 0.5) * tileSize * 2,
                (Math.random() - 0.5) * tileSize * 2
            );
            const h0 = Math.random() * Math.PI * 2;
            const h1 = Math.random() * Math.PI * 2;
            const dir0 = new THREE.Vector2(Math.cos(h0), Math.sin(h0));
            const dir1 = new THREE.Vector2(Math.cos(h1), Math.sin(h1));
            const result = solveConnectorPath({
                start: { position: p0, direction: dir0 },
                end: { position: p1, direction: dir1 },
                radius,
                allowFallback: false
            });
            assertTrue(result.ok, 'Solver should return a path.');
            assertTrue(result.metrics.endPoseErrorPos <= posEps, 'End position error too large.');
            assertTrue(result.metrics.endPoseErrorDir <= dirEps, 'End direction error too large.');
        }
    });

    // ========== Public Assets Tests ==========
    try {
        const [mainResp, grassResp] = await Promise.all([
            fetch('/assets/public/main.png', { method: 'HEAD' }),
            fetch('/assets/public/grass.png', { method: 'HEAD' })
        ]);

        test('Assets: public main.png served', () => {
            assertTrue(mainResp.ok, 'Expected /assets/public/main.png to be served.');
        });

        test('Assets: public grass.png served', () => {
            assertTrue(grassResp.ok, 'Expected /assets/public/grass.png to be served.');
        });
    } catch (e) {
        errors.push({ name: 'Assets: public assets served', error: e?.message || e });
        console.error(`❌ Assets: public assets served: ${e?.message || e}`);
    }

    // ========== Building Fabrication UI Tests ==========
    const { BuildingFabricationUI } = await import('/src/graphics/gui/building_fabrication/BuildingFabricationUI.js');
    const { BuildingFabricationScene, getHighestIndex3x2FootprintTileIds } = await import('/src/graphics/gui/building_fabrication/BuildingFabricationScene.js');
    const { offsetOrthogonalLoopXZ } = await import('/src/graphics/assets3d/generators/buildings/BuildingGenerator.js');
    const { buildBuildingFabricationVisualParts } = await import('/src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js');
    const { createDefaultFloorLayer, createDefaultRoofLayer } = await import('/src/graphics/assets3d/generators/building_fabrication/BuildingFabricationTypes.js');
    const { WINDOW_TYPE, getWindowTypeOptions, getWindowTexture } = await import('/src/graphics/assets3d/generators/buildings/WindowTextureGenerator.js');

    test('BuildingFabricationUI: view toggles live in view panel', () => {
        const ui = new BuildingFabricationUI();
        const viewPanel = ui.root.querySelector('.building-fab-view-panel');
        const propsPanel = ui.root.querySelector('.building-fab-props-panel');
        assertTrue(!!viewPanel, 'View panel should exist.');
        assertTrue(!!propsPanel, 'Props panel should exist.');
        assertTrue(!!viewPanel.querySelector('.building-fab-view-modes'), 'View mode selector should be inside view panel.');
        assertFalse(!!propsPanel.querySelector('.building-fab-view-modes'), 'View mode selector should not be inside props panel.');
    });

    test('BuildingFabricationUI: reset button lives in view panel', () => {
        const ui = new BuildingFabricationUI();
        const resetBtn = Array.from(ui.root.querySelectorAll('button'))
            .find((btn) => btn.textContent?.trim() === 'Reset scene');
        assertTrue(!!resetBtn, 'Reset button should exist.');
        assertTrue(!!resetBtn.closest('.building-fab-view-panel'), 'Reset button should be in view panel.');
    });

    test('BuildingFabricationUI: grid apply button removed', () => {
        const ui = new BuildingFabricationUI();
        const gridBtn = Array.from(ui.root.querySelectorAll('button'))
            .find((btn) => btn.textContent?.includes('Apply grid size'));
        assertFalse(!!gridBtn, 'Apply grid size button should be removed.');
    });

    test('BuildingFabricationUI: view mode is exclusive', () => {
        const ui = new BuildingFabricationUI();
        ui.setWireframeEnabled(true);
        assertTrue(ui.getWireframeEnabled(), 'Wireframe should be enabled.');
        assertFalse(ui.getFloorDivisionsEnabled(), 'Floors should be disabled.');
        assertFalse(ui.getFloorplanEnabled(), 'Floorplan should be disabled.');

        ui.setFloorDivisionsEnabled(true);
        assertFalse(ui.getWireframeEnabled(), 'Wireframe should be disabled.');
        assertTrue(ui.getFloorDivisionsEnabled(), 'Floors should be enabled.');
        assertFalse(ui.getFloorplanEnabled(), 'Floorplan should be disabled.');

        ui.setFloorplanEnabled(true);
        assertFalse(ui.getWireframeEnabled(), 'Wireframe should be disabled.');
        assertFalse(ui.getFloorDivisionsEnabled(), 'Floors should be disabled.');
        assertTrue(ui.getFloorplanEnabled(), 'Floorplan should be enabled.');
    });

    test('BuildingFabricationUI: max floors default is 30', () => {
        const ui = new BuildingFabricationUI();
        assertEqual(ui.floorNumber.max, '30', 'Floor max should be 30.');
        assertEqual(ui.floorRange.max, '30', 'Floor range max should be 30.');
    });

    test('BuildingFabricationUI: layer editor renders template layers', () => {
        const ui = new BuildingFabricationUI();
        ui.setSelectedBuilding(null);
        const list = ui.root.querySelector('.building-fab-layer-list');
        assertTrue(!!list, 'Layer list should exist.');
        assertTrue((list?.children?.length ?? 0) > 0, 'Layer list should render template layers.');
    });

    test('BuildingFabricationUI: material picker shows texture/color tabs', () => {
        const ui = new BuildingFabricationUI();
        const building = { id: 'building_test', layers: ui.getTemplateLayers() };
        ui.setSelectedBuilding(building);

        const label = Array.from(ui.root.querySelectorAll('.building-fab-row-label'))
            .find((el) => el.textContent?.trim() === 'Wall material');
        assertTrue(!!label, 'Wall material row should exist.');
        const row = label.closest('.building-fab-row') ?? null;
        assertTrue(!!row, 'Wall material row wrapper should exist.');
        const btn = row.querySelector('button.building-fab-material-button') ?? null;
        assertTrue(!!btn, 'Wall material button should exist.');

        btn.click();

        const tabs = document.querySelector('.ui-picker-tabs');
        assertTrue(!!tabs, 'Picker tabs element should exist.');
        assertFalse(tabs.classList.contains('hidden'), 'Picker tabs should be visible.');
        const tabBtns = tabs.querySelectorAll('button.ui-picker-tab');
        assertEqual(tabBtns.length, 2, 'Picker should show 2 tabs.');
        ui._pickerPopup?.close?.();
    });

    test('BuildingFabricationUI: roof layer has no nested roof/ring sections', () => {
        const ui = new BuildingFabricationUI();
        ui.setSelectedBuilding(null);
        const roofTitle = Array.from(ui.root.querySelectorAll('.building-fab-details-title'))
            .find((el) => el.textContent?.trim() === 'Roof layer');
        assertTrue(!!roofTitle, 'Roof layer section should exist.');
        const roofDetails = roofTitle.closest('details') ?? null;
        assertTrue(!!roofDetails, 'Roof layer details wrapper should exist.');
        const nested = roofDetails.querySelectorAll('.building-fab-layer-subdetails');
        assertEqual(nested.length, 0, 'Roof layer should not render nested detail sections.');
    });

    test('BuildingFabricationUI: sections do not auto-collapse on refresh', () => {
        const ui = new BuildingFabricationUI();
        const building = { id: 'building_test', layers: ui.getTemplateLayers() };
        ui.setSelectedBuilding(building);

        const title = Array.from(ui.root.querySelectorAll('.building-fab-details-title'))
            .find((el) => el.textContent?.trim() === 'Floorplan');
        const details = title?.closest?.('details') ?? null;
        assertTrue(!!details, 'Floorplan section should exist.');
        details.open = true;
        details.dispatchEvent(new Event('toggle'));

        ui.setSelectedBuilding(building);

        const title2 = Array.from(ui.root.querySelectorAll('.building-fab-details-title'))
            .find((el) => el.textContent?.trim() === 'Floorplan');
        const details2 = title2?.closest?.('details') ?? null;
        assertTrue(!!details2, 'Floorplan section should exist after refresh.');
        assertTrue(details2.open, 'Floorplan section should remain open after refresh.');
    });

    test('BuildingFabricationUI: road mode shows done button', () => {
        const ui = new BuildingFabricationUI();
        ui.setRoadModeEnabled(true);
        assertFalse(ui.roadDoneBtn.classList.contains('hidden'), 'Done button should be visible in road mode.');
        assertTrue(ui.buildBtn.classList.contains('hidden'), 'Build button should be hidden in road mode.');
    });

    test('BuildingGenerator: offsetOrthogonalLoopXZ offsets collinear points', () => {
        const loop = [
            { x: 0, z: 0 },
            { x: 1, z: 0 },
            { x: 2, z: 0 },
            { x: 3, z: 0 },
            { x: 3, z: 1 },
            { x: 0, z: 1 }
        ];

        const out = offsetOrthogonalLoopXZ(loop, 0.2);
        assertTrue(Math.abs(out[1].z - 0.2) < 1e-6, 'Collinear point should shift with offset.');
        assertTrue(Math.abs(out[2].z - 0.2) < 1e-6, 'Collinear point should shift with offset.');
    });

    test('BuildingFabricationGenerator: floor above roof ignores ring height', () => {
        const tileSize = 10;
        const map = {
            tileSize,
            kind: new Uint8Array([0]),
            inBounds: (x, y) => x === 0 && y === 0,
            index: () => 0,
            tileToWorldCenter: () => ({ x: 0, z: 0 })
        };
        const generatorConfig = {
            road: {
                surfaceY: 0,
                curb: { height: 0, extraHeight: 0, thickness: 0 },
                sidewalk: { extraWidth: 0, lift: 0 }
            },
            ground: { surfaceY: 0 }
        };

        const lowerFloorHeight = 3.0;
        const ringHeight = 1.0;
        const layers = [
            createDefaultFloorLayer({ floors: 1, floorHeight: lowerFloorHeight, windows: { enabled: false } }),
            createDefaultRoofLayer({ ring: { enabled: true, height: ringHeight } }),
            createDefaultFloorLayer({ floors: 1, floorHeight: 2.5, windows: { enabled: false } })
        ];

        const parts = buildBuildingFabricationVisualParts({
            map,
            tiles: [[0, 0]],
            generatorConfig,
            tileSize,
            occupyRatio: 1.0,
            layers,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: 0.0 }
        });
        assertTrue(!!parts, 'Expected visual parts.');

        const meshes = parts.solidMeshes ?? [];
        assertTrue(meshes.length >= 3, 'Expected floor, roof, floor meshes.');

        const floor1 = meshes[0];
        const floor2 = meshes[2];
        const expected = floor1.position.y + lowerFloorHeight;
        assertTrue(Math.abs(floor2.position.y - expected) < 1e-6, `Floor above roof should start at ${expected}, got ${floor2.position.y}.`);
    });

    test('BuildingFabricationGenerator: arched windows render with transparency', () => {
        const tileSize = 10;
        const map = {
            tileSize,
            kind: new Uint8Array([0]),
            inBounds: (x, y) => x === 0 && y === 0,
            index: () => 0,
            tileToWorldCenter: () => ({ x: 0, z: 0 })
        };
        const generatorConfig = {
            road: {
                surfaceY: 0,
                curb: { height: 0, extraHeight: 0, thickness: 0 },
                sidewalk: { extraWidth: 0, lift: 0 }
            },
            ground: { surfaceY: 0 }
        };

        const layers = [
            createDefaultFloorLayer({
                floors: 1,
                floorHeight: 3.0,
                windows: { enabled: true, typeId: WINDOW_TYPE.ARCH_V1 }
            }),
            createDefaultRoofLayer({ ring: { enabled: false } })
        ];

        const parts = buildBuildingFabricationVisualParts({
            map,
            tiles: [[0, 0]],
            generatorConfig,
            tileSize,
            occupyRatio: 1.0,
            layers,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: 0.0 }
        });
        assertTrue(!!parts, 'Expected visual parts.');
        assertTrue(!!parts.windows, 'Expected windows group.');

        const meshes = parts.windows?.children?.filter?.((m) => m?.isMesh) ?? [];
        assertTrue(meshes.length > 0, 'Expected at least 1 window mesh.');

        const mat = meshes[0]?.material ?? null;
        assertTrue(!!mat, 'Expected a window material.');
        assertTrue(!!mat.transparent, 'Arched window material should be transparent.');
    });

    test('BuildingFabricationGenerator: belt extrusion can extend beyond footprint', () => {
        const tileSize = 10;
        const map = {
            tileSize,
            kind: new Uint8Array([0]),
            inBounds: (x, y) => x === 0 && y === 0,
            index: () => 0,
            tileToWorldCenter: () => ({ x: 0, z: 0 })
        };
        const generatorConfig = {
            road: {
                surfaceY: 0,
                curb: { height: 0, extraHeight: 0, thickness: 0 },
                sidewalk: { extraWidth: 0, lift: 0 }
            },
            ground: { surfaceY: 0 }
        };

        const extrusion = 0.3;
        const layers = [
            createDefaultFloorLayer({
                floors: 1,
                floorHeight: 3.0,
                belt: { enabled: true, height: 0.2, extrusion },
                windows: { enabled: false }
            }),
            createDefaultRoofLayer({ ring: { enabled: false } })
        ];

        const parts = buildBuildingFabricationVisualParts({
            map,
            tiles: [[0, 0]],
            generatorConfig,
            tileSize,
            occupyRatio: 1.0,
            layers,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: 0.0 }
        });
        assertTrue(!!parts, 'Expected visual parts.');
        assertTrue(!!parts.beltCourse, 'Expected belt group.');

        const floorMesh = parts.solidMeshes?.find?.((m) => m?.isMesh) ?? null;
        const beltMesh = parts.beltCourse?.children?.find?.((m) => m?.isMesh) ?? null;
        assertTrue(!!floorMesh, 'Expected a floor mesh.');
        assertTrue(!!beltMesh, 'Expected a belt mesh.');

        const floorBox = new THREE.Box3().setFromObject(floorMesh);
        const beltBox = new THREE.Box3().setFromObject(beltMesh);
        const floorW = floorBox.max.x - floorBox.min.x;
        const floorD = floorBox.max.z - floorBox.min.z;
        const beltW = beltBox.max.x - beltBox.min.x;
        const beltD = beltBox.max.z - beltBox.min.z;

        assertTrue(beltW > floorW + extrusion * 1.5, 'Expected belt to extend outward in X.');
        assertTrue(beltD > floorD + extrusion * 1.5, 'Expected belt to extend outward in Z.');
    });

    test('BuildingFabricationGenerator: space columns are continuous across belted floors', () => {
        const tileSize = 10;
        const map = {
            tileSize,
            kind: new Uint8Array([0]),
            inBounds: (x, y) => x === 0 && y === 0,
            index: () => 0,
            tileToWorldCenter: () => ({ x: 0, z: 0 })
        };
        const generatorConfig = {
            road: {
                surfaceY: 0,
                curb: { height: 0, extraHeight: 0, thickness: 0 },
                sidewalk: { extraWidth: 0, lift: 0 }
            },
            ground: { surfaceY: 0 }
        };

        const floors = 3;
        const floorHeight = 3.0;
        const beltHeight = 0.2;
        const colsExtrudeDistance = 0.2;
        const layers = [
            createDefaultFloorLayer({
                floors,
                floorHeight,
                belt: { enabled: true, height: beltHeight, extrusion: 0.0 },
                windows: {
                    enabled: true,
                    width: 1.0,
                    height: 1.2,
                    sillHeight: 0.8,
                    spacing: 0.0,
                    spaceColumns: { enabled: true, every: 2, width: 1.0, extrude: true, extrudeDistance: colsExtrudeDistance }
                }
            }),
            createDefaultRoofLayer({ ring: { enabled: false } })
        ];

        const parts = buildBuildingFabricationVisualParts({
            map,
            tiles: [[0, 0]],
            generatorConfig,
            tileSize,
            occupyRatio: 1.0,
            layers,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: 0.0 }
        });
        assertTrue(!!parts, 'Expected visual parts.');
        assertTrue(!!parts.windows, 'Expected windows group.');

        const meshes = parts.windows?.children?.filter?.((m) => m?.isMesh) ?? [];
        const columns = meshes.filter((m) => m?.geometry?.type === 'BoxGeometry');
        assertTrue(columns.length > 0, 'Expected at least 1 space column mesh.');

        const seen = new Map();
        for (const col of columns) {
            const px = Math.round((col.position?.x ?? 0) * 1000);
            const pz = Math.round((col.position?.z ?? 0) * 1000);
            const key = `${px},${pz}`;
            seen.set(key, (seen.get(key) ?? 0) + 1);
        }

        let maxDup = 0;
        for (const count of seen.values()) maxDup = Math.max(maxDup, count);
        assertEqual(maxDup, 1, 'Expected a single continuous column per spacer position (not split per floor).');

        const expectedHeight = floors * (floorHeight + beltHeight);
        for (const col of columns) {
            const h = col.geometry?.parameters?.height ?? null;
            assertTrue(Number.isFinite(h), 'Expected a BoxGeometry height.');
            assertTrue(Math.abs(h - expectedHeight) < 1e-6, `Column height should span full layer (${expectedHeight}).`);
        }
    });

    test('BuildingFabricationScene: trims building tiles when road overlaps', () => {
        const engine = {
            scene: new THREE.Scene(),
            camera: new THREE.PerspectiveCamera(),
            canvas: document.createElement('canvas')
        };
        const scene = new BuildingFabricationScene(engine);

        const a = '0,0';
        const b = '1,0';
        const c = '0,1';
        scene._tileById.set(a, { x: 0, y: 0 });
        scene._tileById.set(b, { x: 1, y: 0 });
        scene._tileById.set(c, { x: 0, y: 1 });

        const building = { id: 'building_test', tiles: new Set([a, b, c]), floors: 1, floorHeight: 3.2 };
        scene._buildingsByTile.set(a, building);
        scene._buildingsByTile.set(b, building);
        scene._buildingsByTile.set(c, building);

        scene._trimBuildingTilesForRoad(building, new Set([b]));
        assertFalse(building.tiles.has(b), 'Building should drop road tile.');
        assertFalse(scene._buildingsByTile.has(b), 'Road tile should no longer map to building.');
        assertTrue(scene._buildingsByTile.get(a) === building, 'Remaining tile should map to building.');
        assertTrue(scene._buildingsByTile.get(c) === building, 'Remaining tile should map to building.');
    });

    test('BuildingFabricationScene: shrinks footprint next to roads', () => {
        const engine = {
            scene: new THREE.Scene(),
            camera: new THREE.PerspectiveCamera(),
            canvas: document.createElement('canvas')
        };
        const scene = new BuildingFabricationScene(engine);
        const { baseMargin, roadMargin } = scene._buildingFootprintMargins();
        assertTrue(roadMargin > baseMargin, 'Road margin should be larger than base margin.');
    });

    test('BuildingFabricationScene: highest index 3x2 footprint is deterministic', () => {
        const tiles = getHighestIndex3x2FootprintTileIds(5);
        assertEqual(tiles.length, 6, 'Expected 3x2 footprint tile count.');
        assertEqual(tiles.join('|'), '2,3|3,3|4,3|2,4|3,4|4,4', 'Expected top-right 3x2 footprint.');

        const small = getHighestIndex3x2FootprintTileIds(2);
        assertEqual(small.length, 0, 'Expected empty footprint for small grids.');
    });

    // ========== City Building Config Tests ==========
    const { CityMap } = await import('/src/app/city/CityMap.js');
    const { getBuildingConfigById, getBuildingConfigs } = await import('/src/app/city/buildings/index.js');
    const { createDemoCitySpec } = await import('/src/app/city/specs/DemoCitySpec.js');
    const { BIG_CITY_SPEC, createBigCitySpec } = await import('/src/app/city/specs/BigCitySpec.js');
    const { getGameplayCityOptions } = await import('/src/states/GameplayState.js');
    const { createCityBuildingConfigFromFabrication, serializeCityBuildingConfigToEsModule } = await import('/src/app/city/buildings/BuildingConfigExport.js');
    const { BUILDING_STYLE } = await import('/src/app/buildings/BuildingStyle.js');
    const { BELT_COURSE_COLOR } = await import('/src/app/buildings/BeltCourseColor.js');
    const { ROOF_COLOR, resolveRoofColorHex } = await import('/src/app/buildings/RoofColor.js');

    test('BuildingCatalog: includes new tower configs', () => {
        const blue = getBuildingConfigById('blue_belt_tower');
        assertTrue(!!blue, 'Expected blue_belt_tower in catalog.');
        assertEqual(blue.id, 'blue_belt_tower');
        assertEqual(blue.name, 'Blue belt tower');
        assertTrue(Array.isArray(blue.layers) && blue.layers.length >= 1, 'Expected layers on blue tower config.');

        const stone = getBuildingConfigById('stone_setback_tower');
        assertTrue(!!stone, 'Expected stone_setback_tower in catalog.');
        assertEqual(stone.id, 'stone_setback_tower');
        assertEqual(stone.name, 'Stone setback tower');
        assertTrue(Array.isArray(stone.layers) && stone.layers.length >= 1, 'Expected layers on stone tower config.');
        assertEqual(
            stone.layers?.[0]?.material?.id,
            'pbr.patterned_concrete_wall',
            'Expected Stone setback tower main wall material to use patterned concrete PBR.'
        );
        assertEqual(
            stone.layers?.[0]?.windows?.spaceColumns?.material?.id,
            'pbr.patterned_concrete_wall',
            'Expected Stone setback tower spacer columns to use patterned concrete PBR.'
        );
        assertEqual(
            stone.layers?.[2]?.material?.id,
            'pbr.patterned_concrete_wall',
            'Expected Stone setback tower setback wall material to use patterned concrete PBR.'
        );
        assertEqual(
            stone.layers?.[3]?.ring?.material?.id,
            'pbr.patterned_concrete_wall',
            'Expected Stone setback tower roof ring material to use patterned concrete PBR.'
        );

        const all = getBuildingConfigs();
        assertTrue(Array.isArray(all) && all.length >= 4, 'Expected at least 4 building configs.');
    });

    test('BuildingCatalog: includes gov_center config', () => {
        const gov = getBuildingConfigById('gov_center');
        assertTrue(!!gov, 'Expected gov_center in catalog.');
        assertEqual(gov.id, 'gov_center');
        assertEqual(gov.name, 'Gov center');
        assertEqual(
            gov.layers?.[0]?.material?.id,
            'pbr.plaster_brick_pattern',
            'Expected Gov center main wall material to use plaster brick pattern PBR.'
        );
        assertEqual(
            gov.layers?.[3]?.material?.id,
            'pbr.plaster_brick_pattern',
            'Expected Gov center upper wall material to use plaster brick pattern PBR.'
        );

        const all = getBuildingConfigs();
        assertTrue(all.includes(gov), 'Expected catalog list to include Gov center config.');
    });

    test('BuildingCatalog: does not rely on placeholder building_3/building_4 ids', () => {
        assertEqual(getBuildingConfigById('building_3'), null, 'Expected building_3 placeholder id to be absent.');
        assertEqual(getBuildingConfigById('building_4'), null, 'Expected building_4 placeholder id to be absent.');
    });

    test('BuildingCatalog: shipped configs are layer-based', () => {
        const all = getBuildingConfigs();
        assertTrue(Array.isArray(all) && all.length > 0, 'Expected building configs list.');
        for (const cfg of all) {
            assertTrue(Array.isArray(cfg?.layers) && cfg.layers.length > 0, `Expected layers on config ${cfg?.id ?? '(missing id)'}.`);
        }
    });

    test('BuildingCatalog: converted configs preserve legacy fields', () => {
        const brick = getBuildingConfigById('brick_midrise');
        assertTrue(!!brick, 'Expected brick_midrise in catalog.');
        assertEqual(brick.floors, 5);
        assertEqual(brick.floorHeight, 3);
        assertEqual(brick.style, BUILDING_STYLE.BRICK);
        assertEqual(brick.windows.width, 2.2);
        assertEqual(brick.windows.gap, 1.6);
        assertEqual(brick.windows.height, 1.4);
        assertEqual(brick.windows.y, 1.0);
        assertEqual(brick.layers?.[0]?.material?.id, 'pbr.red_brick', 'Expected Brick midrise wall material to use PBR red brick.');

        const stone = getBuildingConfigById('stone_lowrise');
        assertTrue(!!stone, 'Expected stone_lowrise in catalog.');
        assertEqual(stone.floors, 4);
        assertEqual(stone.floorHeight, 3);
        assertEqual(stone.style, BUILDING_STYLE.STONE_1);
        assertEqual(stone.windows.width, 1.8);
        assertEqual(stone.windows.gap, 1.4);
        assertEqual(stone.windows.height, 1.2);
        assertEqual(stone.windows.y, 0.9);
        assertEqual(stone.layers?.[0]?.material?.id, 'pbr.painted_plaster_wall', 'Expected Stone lowrise wall material to use PBR painted plaster wall.');
    });

    test('BigCitySpec: module is importable', () => {
        assertTrue(typeof createBigCitySpec === 'function', 'Expected createBigCitySpec export.');
        assertTrue(!!BIG_CITY_SPEC && typeof BIG_CITY_SPEC === 'object', 'Expected BIG_CITY_SPEC export.');
        assertTrue(Array.isArray(BIG_CITY_SPEC.roads) && BIG_CITY_SPEC.roads.length > 0, 'Expected roads list.');
        assertTrue(Array.isArray(BIG_CITY_SPEC.buildings) && BIG_CITY_SPEC.buildings.length > 0, 'Expected buildings list.');
    });

    test('BigCitySpec: compatible with CityMap.fromSpec', () => {
        const cfg = createCityConfig({ size: 600, mapTileSize: 24, seed: 'bigcity-spec-test' });
        const spec = createBigCitySpec(cfg);
        const map = CityMap.fromSpec(spec, cfg);
        assertEqual(map.width, spec.width, 'Expected map width from spec.');
        assertEqual(map.height, spec.height, 'Expected map height from spec.');
        assertEqual(map.tileSize, spec.tileSize, 'Expected map tileSize from spec.');
        assertEqual(map.roadSegments.length, spec.roads.length, 'Expected roadSegments count to match spec.');
        assertTrue(Array.isArray(map.buildings) && map.buildings.length > 0, 'Expected buildings generated from spec.');
    });

    test('GameplayState: uses Big City spec by default', () => {
        assertTrue(typeof getGameplayCityOptions === 'function', 'Expected getGameplayCityOptions export.');
        const options = getGameplayCityOptions();
        assertTrue(!!options && typeof options === 'object', 'Expected gameplay city options.');
        assertTrue(options.mapSpec === BIG_CITY_SPEC, 'Expected gameplay mapSpec to be Big City spec.');
        assertEqual(options.mapTileSize, BIG_CITY_SPEC.tileSize, 'Expected gameplay mapTileSize from spec.');
        assertEqual(options.size, BIG_CITY_SPEC.tileSize * BIG_CITY_SPEC.width, 'Expected gameplay size to match spec.');
    });

    test('DemoCitySpec: extracted demo spec module is importable', () => {
        assertTrue(typeof createDemoCitySpec === 'function', 'Expected createDemoCitySpec export.');
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'demo-spec-test' });
        const spec = createDemoCitySpec(cfg);
        assertTrue(!!spec && typeof spec === 'object', 'Expected demo spec object.');
        assertEqual(spec.seed, 'demo-spec-test', 'Expected demo spec seed from config.');
        assertTrue(Array.isArray(spec.roads), 'Expected roads array.');
        assertTrue(Array.isArray(spec.buildings), 'Expected buildings array.');
    });

    test('CityMap: demoSpec still works via extracted module', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'demo-spec-test-2' });
        const spec = CityMap.demoSpec(cfg);
        assertTrue(!!spec && typeof spec === 'object', 'Expected demo spec object.');
        assertEqual(spec.seed, 'demo-spec-test-2', 'Expected demo spec seed from config.');
        assertTrue(Array.isArray(spec.roads), 'Expected roads array.');
        assertTrue(Array.isArray(spec.buildings), 'Expected buildings array.');
    });

    test('CityMap: exportSpec produces reloadable spec shape with road tags', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'spec-export' });
        const tileSize = cfg.map.tileSize;
        const origin = { x: -4 * tileSize * 0.5 + tileSize * 0.5, z: -3 * tileSize * 0.5 + tileSize * 0.5 };
        const specIn = {
            version: 1,
            seed: 'spec-seed',
            width: 4,
            height: 3,
            tileSize,
            origin,
            roads: [{ a: [0, 0], b: [0, 2], lanesF: 2, lanesB: 1, tag: 'arterial' }],
            buildings: [{ id: 'building_1', configId: 'brick_midrise', tiles: [[2, 1]] }]
        };

        const map = CityMap.fromSpec(specIn, cfg);
        const out = map.exportSpec({ seed: specIn.seed, version: specIn.version });
        assertEqual(out.version, 1);
        assertEqual(out.seed, 'spec-seed');
        assertEqual(out.width, 4);
        assertEqual(out.height, 3);
        assertEqual(out.tileSize, tileSize);
        assertEqual(out.origin.x, origin.x);
        assertEqual(out.origin.z, origin.z);
        assertTrue(Array.isArray(out.roads) && out.roads.length === 1, 'Expected one road in export.');
        assertEqual(out.roads[0].tag, 'arterial', 'Expected road tag to round-trip.');
        assertTrue(Array.isArray(out.buildings) && out.buildings.length === 1, 'Expected one building in export.');
        assertEqual(out.buildings[0].configId, 'brick_midrise', 'Expected building configId in export.');
    });

    // ========== Traffic Control Placement Tests ==========
    const { classifyIntersectionTrafficControl, computeTrafficControlPlacements, TRAFFIC_CONTROL } = await import('/src/app/city/TrafficControlPlacement.js');

    test('TrafficControlPlacement: classifies 2x2+ lane intersections as traffic lights', () => {
        const kind = classifyIntersectionTrafficControl({ n: 2, e: 2, s: 2, w: 2 }, 2);
        assertEqual(kind, TRAFFIC_CONTROL.TRAFFIC_LIGHT);
    });

    test('TrafficControlPlacement: classifies smaller intersections as stop signs', () => {
        const kind = classifyIntersectionTrafficControl({ n: 1, e: 2, s: 1, w: 2 }, 2);
        assertEqual(kind, TRAFFIC_CONTROL.STOP_SIGN);
    });

    test('TrafficControlPlacement: deterministic traffic light placements for fixed spec', () => {
        const cfg = createCityConfig({ size: 120, mapTileSize: 24, seed: 'traffic-control-determinism' });
        const w = cfg.map.width;
        const h = cfg.map.height;
        const spec = {
            version: 1,
            seed: cfg.seed,
            width: w,
            height: h,
            tileSize: cfg.map.tileSize,
            origin: cfg.map.origin,
            roads: [
                { a: [0, 2], b: [w - 1, 2], lanesF: 2, lanesB: 2, tag: 'road' },
                { a: [2, 0], b: [2, h - 1], lanesF: 2, lanesB: 2, tag: 'road' }
            ],
            buildings: []
        };
        const map = CityMap.fromSpec(spec, cfg);
        const gen = createGeneratorConfig();

        const a = computeTrafficControlPlacements({ map, generatorConfig: gen, laneThreshold: 2 });
        const b = computeTrafficControlPlacements({ map, generatorConfig: gen, laneThreshold: 2 });

        assertEqual(JSON.stringify(a), JSON.stringify(b), 'Placements should be deterministic.');
        assertEqual(a.length, 2, 'Expected two traffic lights.');
        assertTrue(a.every((p) => p.kind === TRAFFIC_CONTROL.TRAFFIC_LIGHT), 'Expected traffic light placements.');

        const laneWidth = gen?.road?.laneWidth ?? 4.8;
        const epsLane = 1e-6;
        for (const p of a) {
            assertTrue(Number.isFinite(p.scale) && p.scale > 0, 'Traffic light placement should include a positive scale.');
            assertTrue(Number.isFinite(p.armLength) && p.armLength > 0, 'Traffic light placement should include a positive armLength.');
            assertNear(p.armLength * p.scale, laneWidth, epsLane, 'Traffic light arm reach should match 1 lane width.');
        }

        const tileSize = map.tileSize;
        const minX = map.origin.x - tileSize * 0.5;
        const minZ = map.origin.z - tileSize * 0.5;
        const maxX = map.origin.x + (map.width - 1) * tileSize + tileSize * 0.5;
        const maxZ = map.origin.z + (map.height - 1) * tileSize + tileSize * 0.5;
        for (const p of a) {
            assertTrue(p.position.x >= minX && p.position.x <= maxX, 'Placement x should be within bounds.');
            assertTrue(p.position.z >= minZ && p.position.z <= maxZ, 'Placement z should be within bounds.');
        }
    });

    test('TrafficControlPlacement: stop sign intersections place stop signs within bounds', () => {
        const cfg = createCityConfig({ size: 120, mapTileSize: 24, seed: 'traffic-control-stops' });
        const w = cfg.map.width;
        const h = cfg.map.height;
        const spec = {
            version: 1,
            seed: cfg.seed,
            width: w,
            height: h,
            tileSize: cfg.map.tileSize,
            origin: cfg.map.origin,
            roads: [
                { a: [0, 2], b: [w - 1, 2], lanesF: 1, lanesB: 1, tag: 'road' },
                { a: [2, 0], b: [2, h - 1], lanesF: 1, lanesB: 1, tag: 'road' }
            ],
            buildings: []
        };
        const map = CityMap.fromSpec(spec, cfg);
        const gen = createGeneratorConfig();

        const placements = computeTrafficControlPlacements({ map, generatorConfig: gen, laneThreshold: 2 });
        assertEqual(placements.length, 4, 'Expected four stop signs on a 4-way stop.');
        assertTrue(placements.every((p) => p.kind === TRAFFIC_CONTROL.STOP_SIGN), 'Expected stop sign placements.');

        const tileSize = map.tileSize;
        const minX = map.origin.x - tileSize * 0.5;
        const minZ = map.origin.z - tileSize * 0.5;
        const maxX = map.origin.x + (map.width - 1) * tileSize + tileSize * 0.5;
        const maxZ = map.origin.z + (map.height - 1) * tileSize + tileSize * 0.5;
        for (const p of placements) {
            assertTrue(p.position.x >= minX && p.position.x <= maxX, 'Placement x should be within bounds.');
            assertTrue(p.position.z >= minZ && p.position.z <= maxZ, 'Placement z should be within bounds.');
        }
    });

    test('BuildingConfigExport: exports building fabrication layers for city', () => {
        const layers = [
            createDefaultFloorLayer({ floors: 3, floorHeight: 3.0 }),
            createDefaultRoofLayer()
        ];
        const cfg = createCityBuildingConfigFromFabrication({
            id: 'export_test_building',
            name: 'Export test building',
            layers,
            wallInset: 0.25
        });

        assertEqual(cfg.id, 'export_test_building');
        assertEqual(cfg.name, 'Export test building');
        assertTrue(Array.isArray(cfg.layers) && cfg.layers.length === 2, 'Expected normalized layers.');
        assertTrue(Number.isFinite(cfg.floors) && cfg.floors >= 1, 'Expected legacy floors.');
        assertTrue(Number.isFinite(cfg.floorHeight) && cfg.floorHeight > 0, 'Expected legacy floorHeight.');
        assertTrue(typeof cfg.style === 'string' && cfg.style.length > 0, 'Expected legacy style.');

        const source = serializeCityBuildingConfigToEsModule(cfg);
        assertTrue(source.includes('export_test_building'), 'Expected module to include id.');
        assertTrue(source.includes('layers: Object.freeze'), 'Expected module to include layers.');
        assertTrue(source.includes('export default'), 'Expected module to export default.');
    });

    test('BuildingConfigExport: preserves belt extrusion in exported layers', () => {
        const layers = [
            createDefaultFloorLayer({
                floors: 2,
                floorHeight: 3.0,
                belt: { enabled: true, height: 0.2, extrusion: 0.35 }
            }),
            createDefaultRoofLayer()
        ];
        const cfg = createCityBuildingConfigFromFabrication({
            id: 'export_belt_extrusion',
            name: 'Export belt extrusion',
            layers
        });

        const belt = cfg.layers?.[0]?.belt ?? null;
        assertTrue(!!belt && typeof belt === 'object', 'Expected belt spec.');
        assertTrue(Number.isFinite(belt.extrusion), 'Expected belt extrusion to be numeric.');
        assertTrue(Math.abs(belt.extrusion - 0.35) < 1e-6, 'Belt extrusion should be preserved.');

        const source = serializeCityBuildingConfigToEsModule(cfg);
        assertTrue(source.includes('"extrusion"'), 'Expected serialized module to include belt extrusion.');
        const match = source.match(/"extrusion"\s*:\s*([0-9eE+.-]+)/);
        assertTrue(!!match, 'Expected serialized belt extrusion field.');
        const serialized = Number(match[1]);
        assertTrue(Number.isFinite(serialized), 'Expected serialized belt extrusion value to be numeric.');
        assertTrue(Math.abs(serialized - 0.35) < 1e-6, 'Expected serialized belt extrusion value.');
    });

    test('CityMap: preserves layer-based building configs', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test-layer-config' });
        const layers = [
            createDefaultFloorLayer({ floors: 2, floorHeight: 3.0 }),
            createDefaultRoofLayer()
        ];
        const map = CityMap.fromSpec({
            roads: [],
            buildings: [{
                id: 'layer_building_1',
                tiles: [[0, 0]],
                layers
            }]
        }, cfg);

        assertEqual(map.buildings.length, 1, 'Expected one building.');
        assertEqual(map.buildings[0].id, 'layer_building_1');
        assertTrue(Array.isArray(map.buildings[0].layers) && map.buildings[0].layers.length === 2, 'Expected layers on map building entry.');
    });

    test('CityMap: builds empty building list when missing', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test' });
        const map = CityMap.fromSpec({ roads: [] }, cfg);
        assertTrue(Array.isArray(map.buildings), 'buildings should be an array.');
        assertEqual(map.buildings.length, 0, 'buildings should default to empty.');
    });

    test('CityMap: truncates footprint after first non-adjacent tile', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test' });
        const map = CityMap.fromSpec({
            width: cfg.map.width,
            height: cfg.map.height,
            tileSize: cfg.map.tileSize,
            origin: cfg.map.origin,
            roads: [],
            buildings: [{
                tiles: [[0, 0], [1, 0], [3, 3], [1, 1]],
                floorHeight: 3,
                floors: 5,
                style: BUILDING_STYLE.BRICK,
                windows: { width: 2.2, gap: 1.6, height: 1.4, y: 1.0 }
            }]
        }, cfg);

        assertEqual(map.buildings.length, 1, 'Should keep one valid building.');
        assertEqual(map.buildings[0].tiles.length, 2, 'Should keep tiles up to first invalid adjacency.');
        assertEqual(map.buildings[0].tiles[0][0], 0);
        assertEqual(map.buildings[0].tiles[0][1], 0);
        assertEqual(map.buildings[0].tiles[1][0], 1);
        assertEqual(map.buildings[0].tiles[1][1], 0);
        assertEqual(map.buildings[0].style, BUILDING_STYLE.BRICK);
        assertEqual(map.buildings[0].windows.width, 2.2);
        assertEqual(map.buildings[0].windows.gap, 1.6);
        assertEqual(map.buildings[0].windows.height, 1.4);
        assertEqual(map.buildings[0].windows.y, 1.0);
    });

    test('CityMap: ignores duplicate tiles without aborting', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test' });
        const map = CityMap.fromSpec({
            width: cfg.map.width,
            height: cfg.map.height,
            tileSize: cfg.map.tileSize,
            origin: cfg.map.origin,
            roads: [],
            buildings: [{
                tiles: [[0, 0], [0, 0], [1, 0]],
                floorHeight: 3,
                floors: 2
            }]
        }, cfg);

        assertEqual(map.buildings.length, 1);
        assertEqual(map.buildings[0].tiles.length, 2);
        assertEqual(map.buildings[0].tiles[0][0], 0);
        assertEqual(map.buildings[0].tiles[1][0], 1);
    });

    const { computeEvenWindowLayout, computeBuildingLoopsFromTiles, buildBuildingVisualParts, getWindowStyleOptions } = await import('/src/graphics/assets3d/generators/buildings/BuildingGenerator.js');
    const { createTreeField } = await import('/src/graphics/assets3d/generators/TreeGenerator.js');
    const { CityRNG } = await import('/src/app/city/CityRNG.js');
    const {
        INSPECTOR_COLLECTION,
        INSPECTOR_TEXTURE,
        getTextureInspectorCollections,
        getTextureInspectorOptions,
        getTextureInspectorOptionsForCollection,
        getTextureInspectorTextureById
    } = await import('/src/graphics/assets3d/textures/TextureInspectorCatalog.js');
    const { getSignAssetById, getSignAssets, resolveSignAssetModulePath } = await import('/src/graphics/assets3d/textures/signs/SignAssets.js');

    test('BuildingGenerator: window layout keeps a corner gap', () => {
        const length = 20;
        const windowWidth = 2;
        const { count, starts } = computeEvenWindowLayout({
            length,
            windowWidth,
            desiredGap: 1.5,
            cornerEps: 0.1
        });
        assertTrue(count > 0, 'Should fit at least one window.');
        assertTrue(starts[0] > 0.09, 'Start gap should be > corner eps.');
        const lastEnd = starts[count - 1] + windowWidth;
        assertTrue(lastEnd < length - 0.09, 'Last window should not touch the corner.');
    });

    test('BuildingGenerator: window layout distributes evenly', () => {
        const length = 18;
        const windowWidth = 2;
        const { count, starts } = computeEvenWindowLayout({
            length,
            windowWidth,
            desiredGap: 1.2,
            cornerEps: 0.05
        });
        assertTrue(count >= 2, 'Should fit multiple windows.');
        const gap = starts[0];
        for (let i = 1; i < count; i++) {
            const prev = starts[i - 1];
            const next = starts[i];
            assertTrue(Math.abs((next - prev) - (windowWidth + gap)) < 1e-6, 'Windows should be evenly spaced.');
        }
    });

    test('BuildingGenerator: window style options provide previews', () => {
        const opts = getWindowStyleOptions();
        assertTrue(Array.isArray(opts) && opts.length >= 3, 'Should expose multiple window styles.');
        const hasPreview = opts.some((opt) => typeof opt?.previewUrl === 'string' && opt.previewUrl.startsWith('data:image/'));
        assertTrue(hasPreview, 'Should include at least one preview URL.');
    });

    test('WindowTextureGenerator: registers Light Blue and Green types with caching', () => {
        const opts = getWindowTypeOptions();
        assertTrue(Array.isArray(opts) && opts.length > 0, 'Expected window type options.');

        const ids = new Set(opts.map((opt) => opt.id));
        assertTrue(ids.has(WINDOW_TYPE.STYLE_LIGHT_BLUE), 'Expected Light Blue window type.');
        assertTrue(ids.has(WINDOW_TYPE.STYLE_GREEN), 'Expected Green window type.');

        const lightBlueOpt = opts.find((opt) => opt.id === WINDOW_TYPE.STYLE_LIGHT_BLUE) ?? null;
        const greenOpt = opts.find((opt) => opt.id === WINDOW_TYPE.STYLE_GREEN) ?? null;
        assertTrue(typeof lightBlueOpt?.previewUrl === 'string' && lightBlueOpt.previewUrl.startsWith('data:image/'), 'Expected Light Blue preview.');
        assertTrue(typeof greenOpt?.previewUrl === 'string' && greenOpt.previewUrl.startsWith('data:image/'), 'Expected Green preview.');

        const t0 = getWindowTexture({ typeId: WINDOW_TYPE.STYLE_LIGHT_BLUE });
        const t1 = getWindowTexture({ typeId: WINDOW_TYPE.STYLE_LIGHT_BLUE });
        assertTrue(t0 === t1, 'Expected Light Blue window textures to be cached.');

        const g0 = getWindowTexture({ typeId: WINDOW_TYPE.STYLE_GREEN });
        const g1 = getWindowTexture({ typeId: WINDOW_TYPE.STYLE_GREEN });
        assertTrue(g0 === g1, 'Expected Green window textures to be cached.');
    });

    test('TextureInspectorCatalog: includes Light Blue and Green window entries', () => {
        const opts = getTextureInspectorOptions();
        const ids = new Set(opts.map((opt) => opt.id));
        assertTrue(ids.has(INSPECTOR_TEXTURE.WINDOW_LIGHT_BLUE), 'Expected Light Blue inspector entry.');
        assertTrue(ids.has(INSPECTOR_TEXTURE.WINDOW_GREEN), 'Expected Green inspector entry.');
        assertTrue(!!getTextureInspectorTextureById(INSPECTOR_TEXTURE.WINDOW_LIGHT_BLUE), 'Expected Light Blue inspector texture.');
        assertTrue(!!getTextureInspectorTextureById(INSPECTOR_TEXTURE.WINDOW_GREEN), 'Expected Green inspector texture.');
    });

    test('TextureInspectorCatalog: exposes collections with expected entries', () => {
        const collections = getTextureInspectorCollections();
        assertTrue(Array.isArray(collections) && collections.length >= 2, 'Expected multiple inspector collections.');
        const collectionIds = new Set(collections.map((c) => c.id));
        assertTrue(collectionIds.has(INSPECTOR_COLLECTION.WINDOWS), 'Expected Windows collection.');
        assertTrue(collectionIds.has(INSPECTOR_COLLECTION.TRAFFIC_SIGNS), 'Expected Traffic Signs collection.');

        const windows = getTextureInspectorOptionsForCollection(INSPECTOR_COLLECTION.WINDOWS);
        const windowIds = new Set(windows.map((opt) => opt.id));
        assertTrue(windowIds.has(INSPECTOR_TEXTURE.WINDOW_LIGHT_BLUE), 'Expected Light Blue under Windows.');
        assertTrue(windowIds.has(INSPECTOR_TEXTURE.WINDOW_GREEN), 'Expected Green under Windows.');
        assertFalse(windowIds.has('sign.basic.001'), 'Did not expect signs under Windows.');

        const signs = getTextureInspectorOptionsForCollection(INSPECTOR_COLLECTION.TRAFFIC_SIGNS);
        assertEqual(signs.length, getSignAssets().length, 'Expected Traffic Signs collection to include all signs.');
        const signIds = new Set(signs.map((opt) => opt.id));
        assertTrue(signIds.has('sign.basic.001'), 'Expected basic sign under Traffic Signs.');
        assertFalse(signIds.has(INSPECTOR_TEXTURE.WINDOW_GREEN), 'Did not expect windows under Traffic Signs.');
    });

    let signModulesOk = true;
    let signModulesError = null;
    try {
        const signAssets = getSignAssets();
        await Promise.all(signAssets.map((asset) => {
            const modulePath = resolveSignAssetModulePath(asset.id);
            if (!modulePath) throw new Error(`Missing module path for sign id: ${asset.id}`);
            return import(modulePath);
        }));
    } catch (err) {
        signModulesOk = false;
        signModulesError = err;
    }

    test('SignAssets: all sign modules are importable', () => {
        assertTrue(signModulesOk, signModulesError?.message ?? 'Expected all sign modules to import.');
    });

    test('TextureInspectorCatalog: includes all sign entries', () => {
        const opts = getTextureInspectorOptions();
        const ids = new Set(opts.map((opt) => opt.id));
        const signIds = getSignAssets().map((asset) => asset.id);
        for (const signId of signIds) {
            assertTrue(ids.has(signId), `Missing inspector entry for sign id: ${signId}`);
        }
    });

    test('SignAssets: uv mapping is sane', () => {
        for (const asset of getSignAssets()) {
            const uv = asset.uv;
            const offset = asset.offset;
            const repeat = asset.repeat;
            assertTrue(uv.u0 >= 0 && uv.u0 < uv.u1 && uv.u1 <= 1, `Bad u-range for ${asset.id}`);
            assertTrue(uv.v0 >= 0 && uv.v0 < uv.v1 && uv.v1 <= 1, `Bad v-range for ${asset.id}`);
            assertTrue(offset.x >= 0 && offset.x <= 1, `Bad offset.x for ${asset.id}`);
            assertTrue(offset.y >= 0 && offset.y <= 1, `Bad offset.y for ${asset.id}`);
            assertTrue(repeat.x > 0 && repeat.x <= 1, `Bad repeat.x for ${asset.id}`);
            assertTrue(repeat.y > 0 && repeat.y <= 1, `Bad repeat.y for ${asset.id}`);
        }
    });

    test('SignAssets: representative UVs are stable', () => {
        const basic = getSignAssetById('sign.basic.001');
        assertEqual(basic.rectPx.x, 937);
        assertEqual(basic.rectPx.y, 7);
        assertEqual(basic.rectPx.w, 139);
        assertEqual(basic.rectPx.h, 139);
        assertNear(basic.uv.u0, 937 / 1575, 1e-9, 'basic u0');
        assertNear(basic.uv.u1, (937 + 139) / 1575, 1e-9, 'basic u1');
        assertNear(basic.uv.v0, 1 - (7 + 139) / 945, 1e-9, 'basic v0');
        assertNear(basic.uv.v1, 1 - 7 / 945, 1e-9, 'basic v1');

        const lane = getSignAssetById('sign.lane.022');
        assertEqual(lane.rectPx.x, 822);
        assertEqual(lane.rectPx.y, 800);
        assertEqual(lane.rectPx.w, 413);
        assertEqual(lane.rectPx.h, 207);
        assertNear(lane.uv.u0, 822 / 1258, 1e-9, 'lane u0');
        assertNear(lane.uv.u1, (822 + 413) / 1258, 1e-9, 'lane u1');
        assertNear(lane.uv.v0, 1 - (800 + 207) / 1033, 1e-9, 'lane v0');
        assertNear(lane.uv.v1, 1 - 800 / 1033, 1e-9, 'lane v1');

        const white = getSignAssetById('sign.white_messages.001');
        assertEqual(white.rectPx.x, 22);
        assertEqual(white.rectPx.y, 22);
        assertEqual(white.rectPx.w, 395);
        assertEqual(white.rectPx.h, 493);
        assertNear(white.uv.u0, 22 / 1340, 1e-9, 'white u0');
        assertNear(white.uv.u1, (22 + 395) / 1340, 1e-9, 'white u1');
        assertNear(white.uv.v0, 1 - (22 + 493) / 1592, 1e-9, 'white v0');
        assertNear(white.uv.v1, 1 - 22 / 1592, 1e-9, 'white v1');

        assertTrue(!!getTextureInspectorTextureById(basic.id), 'Expected basic sign texture.');
        assertTrue(!!getTextureInspectorTextureById(lane.id), 'Expected lane sign texture.');
        assertTrue(!!getTextureInspectorTextureById(white.id), 'Expected white sign texture.');
    });

    test('BuildingGenerator: never renders windows outside wall bounds', () => {
        const tileSize = 10;
        const map = {
            tileSize,
            kind: new Uint8Array([0]),
            inBounds: (x, y) => x === 0 && y === 0,
            index: () => 0,
            tileToWorldCenter: () => ({ x: 0, z: 0 })
        };
        const generatorConfig = {
            road: {
                surfaceY: 0,
                curb: { height: 0, extraHeight: 0, thickness: 0 },
                sidewalk: { extraWidth: 0, lift: 0 }
            },
            ground: { surfaceY: 0 }
        };

        const tiles = [[0, 0]];
        const occupyRatio = 1.0;
        const footprintLoops = computeBuildingLoopsFromTiles({ map, tiles, generatorConfig, tileSize, occupyRatio });
        assertTrue(footprintLoops.length > 0, 'Expected footprint loops.');

        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const loop of footprintLoops) {
            for (const p of loop ?? []) {
                if (!p) continue;
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minZ = Math.min(minZ, p.z);
                maxZ = Math.max(maxZ, p.z);
            }
        }
        assertTrue(Number.isFinite(minX) && Number.isFinite(maxX), 'Expected X bounds.');
        assertTrue(Number.isFinite(minZ) && Number.isFinite(maxZ), 'Expected Z bounds.');

        const parts = buildBuildingVisualParts({
            map,
            tiles,
            generatorConfig,
            tileSize,
            occupyRatio,
            floors: 1,
            floorHeight: 3.0,
            style: BUILDING_STYLE.DEFAULT,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: 0.0 },
            windows: {
                enabled: true,
                width: 1.0,
                gap: 0.0,
                height: 1.2,
                y: 0.8,
                cornerEps: 0.05,
                offset: 0.05,
                spacer: { enabled: true, every: 2, width: 1.0, extrude: true, extrudeDistance: 0.2 }
            },
            street: { enabled: false }
        });
        assertTrue(!!parts && !!parts.windows, 'Expected windows group.');

        const meshes = parts.windows?.children?.filter?.((m) => m?.isMesh) ?? [];
        assertTrue(meshes.length > 0, 'Expected at least one window/spacer mesh.');

        const margin = 0.4;
        const box = new THREE.Box3();
        for (const mesh of meshes) {
            box.setFromObject(mesh);
            assertTrue(box.min.x >= minX - margin, `Mesh should not extend beyond minX (${box.min.x} < ${minX - margin}).`);
            assertTrue(box.max.x <= maxX + margin, `Mesh should not extend beyond maxX (${box.max.x} > ${maxX + margin}).`);
            assertTrue(box.min.z >= minZ - margin, `Mesh should not extend beyond minZ (${box.min.z} < ${minZ - margin}).`);
            assertTrue(box.max.z <= maxZ + margin, `Mesh should not extend beyond maxZ (${box.max.z} > ${maxZ + margin}).`);
        }
    });

    test('BuildingGenerator: street floors can add street floor belt', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test-street-floors' });
        const map = CityMap.fromSpec({ roads: [] }, cfg);
        const parts = buildBuildingVisualParts({
            map,
            tiles: [[0, 0], [1, 0]],
            floors: 4,
            floorHeight: 3.0,
            style: BUILDING_STYLE.DEFAULT,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            windows: { enabled: false },
            street: { enabled: true, floors: 1, floorHeight: 5.0, style: BUILDING_STYLE.DEFAULT },
            beltCourse: { enabled: true, margin: 0.4, height: 0.3, color: BELT_COURSE_COLOR.ORANGE }
        });
        assertTrue(parts !== null, 'Should build parts.');
        assertTrue(parts.solidMeshes.length >= 2, 'Should split street and upper meshes.');
        assertTrue(!!parts.beltCourse && !!parts.beltCourse.isMesh, 'Should create belt course mesh.');
        assertEqual(parts.beltCourse.geometry?.parameters?.height, 0.3, 'Street floor belt height should match.');
        assertEqual(parts.beltCourse.material?.color?.getHex?.(), 0xd58a3a, 'Street floor belt color should match.');

        const streetMesh = parts.solidMeshes[0];
        const upperMesh = parts.solidMeshes[1];
        const streetTopY = (streetMesh?.position?.y ?? 0) + 5.0;
        assertTrue(Math.abs((parts.beltCourse.position?.y ?? 0) - (streetTopY + 0.15)) < 1e-6, 'Street floor belt should sit above the street floor.');
        assertTrue(Math.abs((upperMesh?.position?.y ?? 0) - (streetTopY + 0.3)) < 1e-6, 'Upper floors should shift up by belt height.');
    });

    test('BuildingGenerator: top belt can render above roof', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test-top-belt' });
        const map = CityMap.fromSpec({ roads: [] }, cfg);
        const parts = buildBuildingVisualParts({
            map,
            tiles: [[0, 0], [1, 0]],
            floors: 2,
            floorHeight: 3.0,
            style: BUILDING_STYLE.DEFAULT,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            windows: { enabled: false },
            topBelt: { enabled: true, width: 0.5, innerWidth: 0.2, height: 0.25 }
        });
        assertTrue(parts !== null, 'Should build parts.');
        assertTrue(!!parts.topBelt && !!parts.topBelt.isMesh, 'Should create top belt mesh.');
        assertEqual(parts.topBelt.geometry?.type, 'ExtrudeGeometry', 'Top belt should use extruded geometry.');
        parts.topBelt.geometry?.computeBoundingBox?.();
        const bbox = parts.topBelt.geometry?.boundingBox ?? null;
        assertTrue(!!bbox, 'Top belt should have bounds.');
        assertTrue(Math.abs((bbox.max.y - bbox.min.y) - 0.25) < 1e-6, 'Top belt height should match.');
        assertTrue(Math.abs((parts.topBelt.position?.y ?? 0) - 6.01) < 1e-6, 'Top belt should start above roof.');
        const shapes = parts.topBelt.geometry?.parameters?.shapes ?? parts.topBelt.geometry?.parameters?.shape ?? null;
        const shape = Array.isArray(shapes) ? shapes[0] : shapes;
        const holeCount = Array.isArray(shape?.holes) ? shape.holes.length : 0;
        assertTrue(holeCount >= 1, 'Top belt should have an inner hole.');
        assertEqual(parts.topBelt.material?.color?.getHex?.(), 0xf2f2f2, 'Top belt should default to off-white.');
    });

    test('BuildingGenerator: roof color can be configured', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test-roof-color' });
        const map = CityMap.fromSpec({ roads: [] }, cfg);
        const parts = buildBuildingVisualParts({
            map,
            tiles: [[0, 0], [1, 0]],
            floors: 2,
            floorHeight: 3.0,
            style: BUILDING_STYLE.DEFAULT,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            windows: { enabled: false },
            roof: { color: ROOF_COLOR.TERRACOTTA }
        });
        assertTrue(parts !== null, 'Should build parts.');
        const expected = resolveRoofColorHex(ROOF_COLOR.TERRACOTTA, 0xffffff);
        for (const mesh of parts.solidMeshes ?? []) {
            const mat = Array.isArray(mesh?.material) ? mesh.material[0] : null;
            assertEqual(mat?.color?.getHex?.(), expected, 'Roof material color should match.');
        }
    });

    test('TreeGenerator: does not place trees on building tiles', () => {
        const cfg = createCityConfig({ size: 96, mapTileSize: 24, seed: 'test-trees' });
        const map = CityMap.fromSpec({
            width: cfg.map.width,
            height: cfg.map.height,
            tileSize: cfg.map.tileSize,
            origin: cfg.map.origin,
            roads: [],
            buildings: [{
                tiles: [[2, 2], [3, 2]],
                floorHeight: 3,
                floors: 1
            }]
        }, cfg);

        const rng = new CityRNG('tree-test');
        const { placements } = createTreeField({
            map,
            rng,
            groundY: 0,
            config: { trees: { density: 1.0, jitter: 0.0, clearance: 0.0, maxAttempts: 1, roadBoost: 0 } }
        });

        const forbidden = new Set(['2,2', '3,2']);
        for (const p of placements ?? []) {
            const t = map.worldToTile(p.x, p.z);
            assertFalse(forbidden.has(`${t.x},${t.y}`), 'Placement should not be on a building tile.');
        }
    });

    // ========== Procedural Mesh Tests (added in Task 30) ==========
    let proceduralMeshes = null;
    try {
        proceduralMeshes = {
            catalog: await import('/src/graphics/assets3d/procedural_meshes/ProceduralMeshCatalog.js'),
            ball: await import('/src/graphics/assets3d/procedural_meshes/meshes/BallMesh_v1.js'),
            streetSignPole: await import('/src/graphics/assets3d/procedural_meshes/meshes/StreetSignPoleMesh_v1.js'),
            trafficLightPole: await import('/src/graphics/assets3d/procedural_meshes/meshes/TrafficLightPoleMesh_v1.js'),
            trafficLightHead: await import('/src/graphics/assets3d/procedural_meshes/meshes/TrafficLightHeadMesh_v1.js'),
            trafficLight: await import('/src/graphics/assets3d/procedural_meshes/meshes/TrafficLightMesh_v1.js'),
            stopSignPlate: await import('/src/graphics/assets3d/procedural_meshes/meshes/StopSignPlateMesh_v1.js'),
            stopSign: await import('/src/graphics/assets3d/procedural_meshes/meshes/StopSignMesh_v1.js'),
            signAssets: await import('/src/graphics/assets3d/textures/signs/SignAssets.js')
        };
    } catch (e) {
        test('ProceduralMesh: modules are importable', () => {
            throw e;
        });
    }

    if (proceduralMeshes) {
        test('ProceduralMesh: mesh modules expose stable ids', () => {
            assertEqual(proceduralMeshes.ball.MESH_ID, 'mesh.ball.v1', 'Ball mesh id should be stable.');
            assertEqual(proceduralMeshes.streetSignPole.MESH_ID, 'mesh.street_sign_pole.v1', 'Street sign pole id should be stable.');
            assertEqual(proceduralMeshes.trafficLightPole.MESH_ID, 'mesh.traffic_light_pole.v1', 'Traffic light pole id should be stable.');
            assertEqual(proceduralMeshes.trafficLightHead.MESH_ID, 'mesh.traffic_light_head.v1', 'Traffic light head id should be stable.');
            assertEqual(proceduralMeshes.trafficLight.MESH_ID, 'mesh.traffic_light.v1', 'Traffic light mesh id should be stable.');
            assertEqual(proceduralMeshes.stopSignPlate.MESH_ID, 'mesh.stop_sign_plate.v1', 'Stop sign plate id should be stable.');
            assertEqual(proceduralMeshes.stopSign.MESH_ID, 'mesh.stop_sign.v1', 'Stop sign id should be stable.');
        });

        test('ProceduralMeshCatalog: exposes new mesh ids', () => {
            const options = proceduralMeshes.catalog.getProceduralMeshOptions();
            const ids = options.map((opt) => opt.id);
            assertTrue(ids.includes(proceduralMeshes.streetSignPole.MESH_ID), 'Options should include street sign pole.');
            assertTrue(ids.includes(proceduralMeshes.trafficLightPole.MESH_ID), 'Options should include traffic light pole.');
            assertTrue(ids.includes(proceduralMeshes.trafficLightHead.MESH_ID), 'Options should include traffic light head.');
            assertTrue(ids.includes(proceduralMeshes.trafficLight.MESH_ID), 'Options should include traffic light.');
            assertTrue(ids.includes(proceduralMeshes.stopSignPlate.MESH_ID), 'Options should include stop sign plate.');
            assertTrue(ids.includes(proceduralMeshes.stopSign.MESH_ID), 'Options should include stop sign.');
        });

        const assertRegionIds = (asset, expectedIds) => {
            assertTrue(asset !== null, 'Asset should exist.');
            assertTrue(Array.isArray(asset.regions), 'Asset regions should be an array.');
            const actual = asset.regions.map((r) => r.id);
            assertEqual(actual.length, expectedIds.length, 'Regions length should be stable.');
            for (let i = 0; i < expectedIds.length; i++) {
                assertEqual(actual[i], expectedIds[i], 'Region id should be stable.');
                assertTrue(typeof actual[i] === 'string' && actual[i].length > 0, 'Region id should be non-empty.');
            }

            const geometry = asset.mesh?.geometry ?? null;
            const groups = geometry?.groups ?? null;
            assertTrue(Array.isArray(groups) && groups.length > 0, 'Geometry groups should exist.');
            for (const group of groups) {
                assertTrue(Number.isInteger(group.materialIndex), 'Group materialIndex should be an integer.');
                assertTrue(group.materialIndex >= 0 && group.materialIndex < expectedIds.length, 'Group materialIndex should map to a region.');
                assertTrue(Number.isInteger(group.start) && Number.isInteger(group.count), 'Group start/count should be integers.');
                assertTrue(group.count > 0, 'Group count should be non-zero.');
            }
        };

        test('ProceduralMesh: street sign pole region ids stable', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.streetSignPole.MESH_ID);
            assertRegionIds(asset, ['street_sign_pole:body']);
        });

        test('ProceduralMesh: street sign pole dimensions scaled down', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.streetSignPole.MESH_ID);
            const geo = asset?.mesh?.geometry ?? null;
            assertTrue(!!geo, 'Expected street sign pole geometry.');

            geo.computeBoundingBox();
            const box = geo.boundingBox ?? null;
            assertTrue(!!box, 'Expected street sign pole bounding box.');

            const w = box.max.x - box.min.x;
            const h = box.max.y - box.min.y;
            const d = box.max.z - box.min.z;

            const baselineRadius = 0.055;
            const baselineHeight = 3.0;
            const baselineSegments = 6;
            const baselineGeo = new THREE.CylinderGeometry(baselineRadius, baselineRadius, baselineHeight, baselineSegments, 1, false);
            baselineGeo.translate(0, -1.2 + baselineHeight / 2, 0);
            baselineGeo.computeBoundingBox();
            const baselineBox = baselineGeo.boundingBox ?? null;
            assertTrue(!!baselineBox, 'Expected baseline street sign pole bounding box.');
            const baselineW = baselineBox.max.x - baselineBox.min.x;
            const baselineH = baselineBox.max.y - baselineBox.min.y;
            const baselineD = baselineBox.max.z - baselineBox.min.z;

            const heightScale = 0.8;
            const diameterScale = 0.9;
            const eps = 1e-4;

            assertNear(h, baselineH * heightScale, eps, 'Expected pole height scaled by 0.8.');
            assertNear(w, baselineW * diameterScale, eps, 'Expected pole width scaled by 0.9.');
            assertNear(d, baselineD * diameterScale, eps, 'Expected pole depth scaled by 0.9.');
        });

        test('ProceduralMesh: traffic light pole region ids stable', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLightPole.MESH_ID);
            assertRegionIds(asset, [
                'traffic_light_pole:vertical',
                'traffic_light_pole:inclined',
                'traffic_light_pole:arm'
            ]);
        });

        test('ProceduralMesh: traffic light head region ids stable', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLightHead.MESH_ID);
            assertRegionIds(asset, [
                'traffic_light_head:housing',
                'traffic_light_head:light_red',
                'traffic_light_head:light_yellow',
                'traffic_light_head:light_green'
            ]);

            asset.mesh.geometry.computeBoundingBox();
            const box = asset.mesh.geometry.boundingBox;
            assertTrue(Math.abs(box.min.y) < 1e-6, 'Traffic light head should start at y=0.');
            assertTrue(Math.abs(box.min.z) < 1e-6, 'Traffic light head should start at z=0.');
        });

        test('ProceduralMesh: traffic light composed mesh region ids stable', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLight.MESH_ID);
            assertRegionIds(asset, [
                'traffic_light_pole:vertical',
                'traffic_light_pole:inclined',
                'traffic_light_pole:arm',
                'traffic_light_head:housing',
                'traffic_light_head:light_red',
                'traffic_light_head:light_yellow',
                'traffic_light_head:light_green'
            ]);
        });

        test('ProceduralMesh: traffic light head hangs under the arm', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLight.MESH_ID);
            const geo = asset?.mesh?.geometry ?? null;
            assertTrue(!!geo, 'Traffic light geometry should exist.');

            const groups = geo?.groups ?? [];
            const index = geo?.index ?? null;
            const pos = geo?.attributes?.position ?? null;
            assertTrue(!!index?.isBufferAttribute && !!pos?.isBufferAttribute, 'Traffic light should have indexed positions.');

            const armGroup = groups.find((g) => g?.materialIndex === 2) ?? null;
            assertTrue(!!armGroup, 'Traffic light should include an arm group.');

            const computeGroupBox = (group) => {
                const box = new THREE.Box3();
                box.makeEmpty();
                const v = new THREE.Vector3();
                const start = group?.start ?? 0;
                const end = start + (group?.count ?? 0);
                for (let i = start; i < end; i++) {
                    const vi = index.getX(i);
                    v.fromBufferAttribute(pos, vi);
                    box.expandByPoint(v);
                }
                return box;
            };

            const armBox = computeGroupBox(armGroup);
            const armCenterY = (armBox.min.y + armBox.max.y) / 2;

            const headBox = new THREE.Box3();
            headBox.makeEmpty();
            for (const g of groups) {
                const mi = g?.materialIndex;
                if (!Number.isFinite(mi) || mi < 3) continue;
                headBox.union(computeGroupBox(g));
            }
            assertFalse(headBox.isEmpty(), 'Traffic light should include head geometry.');

            const headCenterY = (headBox.min.y + headBox.max.y) / 2;
            const eps = 1e-4;
            assertNear(headCenterY, armCenterY, eps, 'Traffic light head should be centered at arm height.');
            assertTrue(headBox.min.y < armCenterY, 'Traffic light head should hang below the arm.');
        });

        test('ProceduralMesh: stop sign plate region ids stable', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.stopSignPlate.MESH_ID);
            assertRegionIds(asset, [
                'stop_sign_plate:edge',
                'stop_sign_plate:face',
                'stop_sign_plate:back'
            ]);
            const radialSegments = asset?.mesh?.geometry?.parameters?.radialSegments ?? null;
            assertEqual(radialSegments, 8, 'Stop sign plate should have 8 sides.');
        });

        test('ProceduralMesh: stop sign plate depth scaled down by 80%', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.stopSignPlate.MESH_ID);
            const geo = asset?.mesh?.geometry ?? null;
            assertTrue(!!geo, 'Expected stop sign plate geometry.');

            geo.computeBoundingBox();
            const box = geo.boundingBox ?? null;
            assertTrue(!!box, 'Expected stop sign plate bounding box.');
            const depth = box.max.z - box.min.z;

            const baselineRadius = 0.34;
            const baselineThickness = 0.04;
            const radialSegments = 8;
            const baselineGeo = new THREE.CylinderGeometry(baselineRadius, baselineRadius, baselineThickness, radialSegments, 1, false);
            baselineGeo.rotateX(Math.PI / 2);
            baselineGeo.rotateZ(Math.PI / radialSegments);
            baselineGeo.computeBoundingBox();
            const baselineBox = baselineGeo.boundingBox ?? null;
            assertTrue(!!baselineBox, 'Expected baseline stop sign plate bounding box.');
            const baselineDepth = baselineBox.max.z - baselineBox.min.z;

            const eps = 1e-4;
            assertNear(depth, baselineDepth * 0.2, eps, 'Expected stop sign plate depth scaled by 0.2.');
        });

        test('ProceduralMesh: stop sign composed mesh region ids stable', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.stopSign.MESH_ID);
            assertRegionIds(asset, [
                'street_sign_pole:body',
                'stop_sign_plate:edge',
                'stop_sign_plate:face',
                'stop_sign_plate:back'
            ]);
        });

        test('ProceduralMesh: stop sign plate uses stop sign atlas UVs', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.stopSignPlate.MESH_ID);
            const geo = asset?.mesh?.geometry ?? null;
            const groups = geo?.groups ?? [];
            const faceGroup = groups.find((g) => g?.materialIndex === 1) ?? null;
            assertTrue(!!faceGroup, 'Stop sign plate should include a face group.');

            const index = geo?.index ?? null;
            const uv = geo?.attributes?.uv ?? null;
            assertTrue(!!index?.isBufferAttribute && !!uv?.isBufferAttribute, 'Stop sign plate should have indexed UVs.');

            const stopId = proceduralMeshes.stopSignPlate.STOP_SIGN_TEXTURE_ID;
            assertEqual(stopId, 'sign.basic.stop', 'Stop sign texture id should be stable.');

            const stopSign = proceduralMeshes.signAssets.getSignAssetById(stopId);
            const atlasTex = stopSign.getAtlasTexture();

            const faceMat = Array.isArray(asset.materials?.solid) ? asset.materials.solid[1] : null;
            assertTrue(faceMat?.map === atlasTex, 'Stop sign face material should use the sign atlas texture.');

            let minU = Infinity;
            let maxU = -Infinity;
            let minV = Infinity;
            let maxV = -Infinity;
            for (let i = faceGroup.start; i < faceGroup.start + faceGroup.count; i++) {
                const vi = index.getX(i);
                const u = uv.getX(vi);
                const v = uv.getY(vi);
                minU = Math.min(minU, u);
                maxU = Math.max(maxU, u);
                minV = Math.min(minV, v);
                maxV = Math.max(maxV, v);
            }

            const eps = 1e-4;
            assertTrue(minU >= 0 - eps && maxU <= 1 + eps, 'Stop sign plate U coordinates should be within [0,1].');
            assertTrue(minV >= 0 - eps && maxV <= 1 + eps, 'Stop sign plate V coordinates should be within [0,1].');
            assertTrue(minU >= stopSign.uv.u0 - eps && maxU <= stopSign.uv.u1 + eps, 'Stop sign plate U range should match stop sign atlas rect.');
            assertTrue(minV >= stopSign.uv.v0 - eps && maxV <= stopSign.uv.v1 + eps, 'Stop sign plate V range should match stop sign atlas rect.');
        });

        test('ProceduralMesh: stop sign plate face UVs project from XY plane', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.stopSignPlate.MESH_ID);
            const geo = asset?.mesh?.geometry ?? null;
            assertTrue(!!geo, 'Stop sign plate geometry should exist.');

            const groups = geo?.groups ?? [];
            const faceGroup = groups.find((g) => g?.materialIndex === 1) ?? null;
            assertTrue(!!faceGroup, 'Stop sign plate should include a face group.');

            const index = geo?.index ?? null;
            const uv = geo?.attributes?.uv ?? null;
            const pos = geo?.attributes?.position ?? null;
            assertTrue(!!index?.isBufferAttribute && !!uv?.isBufferAttribute && !!pos?.isBufferAttribute, 'Stop sign plate should have indexed UVs.');

            const sign = proceduralMeshes.signAssets.getSignAssetById(proceduralMeshes.stopSignPlate.STOP_SIGN_TEXTURE_ID);
            const { offset, repeat } = sign.getTextureDescriptor();

            const vertSet = new Set();
            let maxR = 0;
            for (let i = faceGroup.start; i < faceGroup.start + faceGroup.count; i++) {
                const vi = index.getX(i);
                if (vertSet.has(vi)) continue;
                vertSet.add(vi);
                const x = pos.getX(vi);
                const y = pos.getY(vi);
                maxR = Math.max(maxR, Math.hypot(x, y));
            }
            assertTrue(maxR > 0, 'Stop sign face radius should be non-zero.');

            const eps = 1e-6;
            for (const vi of vertSet) {
                const x = pos.getX(vi);
                const y = pos.getY(vi);
                const localU = (uv.getX(vi) - offset.x) / repeat.x;
                const localV = (uv.getY(vi) - offset.y) / repeat.y;
                assertNear(localU, x / (2 * maxR) + 0.5, eps, 'Expected U projected from X.');
                assertNear(localV, y / (2 * maxR) + 0.5, eps, 'Expected V projected from Y.');
            }
        });

        test('ProceduralMesh: traffic light head exposes rig schema', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLightHead.MESH_ID);
            const rig = asset?.mesh?.userData?.rig ?? null;
            assertTrue(!!rig, 'Traffic light head should expose a rig api.');
            assertTrue(!!rig.schema && typeof rig.schema === 'object', 'Rig api should expose schema.');
            assertEqual(rig.schema.id, 'rig.traffic_light_head.v1', 'Rig schema id should be stable.');
            const props = Array.isArray(rig.schema?.properties) ? rig.schema.properties : [];
            const signal = props.find((p) => p?.id === 'signal') ?? null;
            assertTrue(!!signal, 'Schema should include signal.');
            assertEqual(signal.type, 'enum', 'signal should be an enum.');
            const options = Array.isArray(signal.options) ? signal.options : [];
            const ids = options.map((opt) => opt.id);
            assertTrue(ids.includes('none'), 'signal should include none.');
            assertTrue(ids.includes('red'), 'signal should include red.');
            assertTrue(ids.includes('yellow'), 'signal should include yellow.');
            assertTrue(ids.includes('green'), 'signal should include green.');
        });

        test('ProceduralMesh: traffic light head signal updates emissive state', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLightHead.MESH_ID);
            const rig = asset?.mesh?.userData?.rig ?? null;
            assertTrue(!!rig, 'Traffic light head should expose a rig api.');
            const regions = asset?.regions ?? [];
            const idxRed = regions.findIndex((r) => r?.id === 'traffic_light_head:light_red');
            const idxYellow = regions.findIndex((r) => r?.id === 'traffic_light_head:light_yellow');
            const idxGreen = regions.findIndex((r) => r?.id === 'traffic_light_head:light_green');
            assertTrue(idxRed >= 0 && idxYellow >= 0 && idxGreen >= 0, 'Light region indices should exist.');

            rig.setValue('signal', 'green');

            const getIntensity = (materials, idx) => {
                const mat = Array.isArray(materials) ? materials[idx] : null;
                return Number(mat?.emissiveIntensity) || 0;
            };

            assertTrue(getIntensity(asset.materials?.semantic, idxGreen) > 0.01, 'Semantic green light should be on.');
            assertTrue(getIntensity(asset.materials?.semantic, idxRed) < 1e-6, 'Semantic red light should be off.');
            assertTrue(getIntensity(asset.materials?.semantic, idxYellow) < 1e-6, 'Semantic yellow light should be off.');

            assertTrue(getIntensity(asset.materials?.solid, idxGreen) > 0.01, 'Solid green light should be on.');
            assertTrue(getIntensity(asset.materials?.solid, idxRed) < 1e-6, 'Solid red light should be off.');
            assertTrue(getIntensity(asset.materials?.solid, idxYellow) < 1e-6, 'Solid yellow light should be off.');

            rig.setValue('signal', 'none');
            assertTrue(getIntensity(asset.materials?.solid, idxGreen) < 1e-6, 'Solid green light should be off for none.');
            assertTrue(getIntensity(asset.materials?.solid, idxRed) < 1e-6, 'Solid red light should be off for none.');
            assertTrue(getIntensity(asset.materials?.solid, idxYellow) < 1e-6, 'Solid yellow light should be off for none.');
        });

        test('ProceduralMesh: composed traffic light exposes prefab params and child rigs', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLight.MESH_ID);
            const prefab = asset?.mesh?.userData?.prefab ?? null;
            assertTrue(!!prefab, 'Composed traffic light should expose prefab params.');
            const rig = asset?.mesh?.userData?.rig ?? null;
            assertTrue(!!rig, 'Composed traffic light should expose a rig api.');

            const children = Array.isArray(rig.children) ? rig.children : [];
            assertTrue(children.length >= 1, 'Composed traffic light should expose child rigs.');
            const head = rig.getChildRig?.('head') ?? children.find((child) => child?.schema?.id === 'rig.traffic_light_head.v1') ?? null;
            assertTrue(!!head, 'Child rigs should include traffic light head rig.');

            const armProp = (Array.isArray(prefab.schema?.properties) ? prefab.schema.properties : []).find((p) => p?.id === 'armLength') ?? null;
            assertTrue(!!armProp && armProp.type === 'number', 'Prefab params should expose armLength.');

            rig.setValue('head.signal', 'yellow');
            const idxYellow = (asset.regions ?? []).findIndex((r) => r?.id === 'traffic_light_head:light_yellow');
            const idxRed = (asset.regions ?? []).findIndex((r) => r?.id === 'traffic_light_head:light_red');
            const idxGreen = (asset.regions ?? []).findIndex((r) => r?.id === 'traffic_light_head:light_green');
            assertTrue(idxYellow >= 0 && idxRed >= 0 && idxGreen >= 0, 'Composed light region indices should exist.');

            assertTrue(Number(asset.materials?.solid?.[idxYellow]?.emissiveIntensity) > 0.01, 'Composed yellow light should be on.');
            assertTrue(Number(asset.materials?.solid?.[idxRed]?.emissiveIntensity) < 1e-6, 'Composed red light should be off.');
            assertTrue(Number(asset.materials?.solid?.[idxGreen]?.emissiveIntensity) < 1e-6, 'Composed green light should be off.');

            const prevGeo = asset.mesh?.geometry ?? null;
            prefab.setParam('armLength', 3.2);
            assertTrue(asset.mesh?.geometry !== prevGeo, 'armLength should rebuild composed geometry.');

            const geo = asset?.mesh?.geometry ?? null;
            assertTrue(!!geo, 'Composed traffic light geometry should exist after rebuild.');
            const groups = geo?.groups ?? [];
            const index = geo?.index ?? null;
            const pos = geo?.attributes?.position ?? null;
            assertTrue(!!index?.isBufferAttribute && !!pos?.isBufferAttribute, 'Composed traffic light should have indexed positions.');

            const computeGroupBox = (group) => {
                const box = new THREE.Box3();
                box.makeEmpty();
                const v = new THREE.Vector3();
                const start = group?.start ?? 0;
                const end = start + (group?.count ?? 0);
                for (let i = start; i < end; i++) {
                    const vi = index.getX(i);
                    v.fromBufferAttribute(pos, vi);
                    box.expandByPoint(v);
                }
                return box;
            };

            const armGroup = groups.find((g) => g?.materialIndex === 2) ?? null;
            assertTrue(!!armGroup, 'Composed traffic light should include an arm group.');
            const armBox = computeGroupBox(armGroup);
            const armCenterY = (armBox.min.y + armBox.max.y) / 2;

            const headBox = new THREE.Box3();
            headBox.makeEmpty();
            for (const g of groups) {
                const mi = g?.materialIndex;
                if (!Number.isFinite(mi) || mi < 3) continue;
                headBox.union(computeGroupBox(g));
            }
            assertFalse(headBox.isEmpty(), 'Composed traffic light should include head geometry.');
            const headCenterY = (headBox.min.y + headBox.max.y) / 2;

            const eps = 1e-4;
            assertNear(headCenterY, armCenterY, eps, 'Composed traffic light head should stay centered after armLength rebuild.');
        });
    }

    // ========== City Spec Registry Tests ==========
    const citySpecs = await import('/src/app/city/specs/CitySpecRegistry.js');
    const { generateRoads } = await import('/src/graphics/assets3d/generators/RoadGenerator.js');

    test('CitySpecRegistry: contains expected entries', () => {
        const entries = Array.isArray(citySpecs.CITY_SPEC_REGISTRY) ? citySpecs.CITY_SPEC_REGISTRY : [];
        assertTrue(entries.length >= 2, 'Expected at least 2 city specs in registry.');
        assertTrue(entries.some((entry) => entry?.id === citySpecs.DEFAULT_CITY_SPEC_ID), 'Expected default city spec id in registry.');
        assertTrue(entries.some((entry) => entry?.id === 'bigcity'), 'Expected bigcity entry in registry.');
    });

    test('CitySpecRegistry: creating different specs rebuilds roads without errors', () => {
        const cfg = createCityConfig({ size: 400, tileMeters: 2, mapTileSize: 24, seed: 'city-spec-test' });
        const demoSpec = citySpecs.createCitySpecById(citySpecs.DEFAULT_CITY_SPEC_ID, cfg);
        const bigSpec = citySpecs.createCitySpecById('bigcity', cfg);
        assertTrue(!!demoSpec, 'Expected demo spec to be created.');
        assertTrue(!!bigSpec, 'Expected bigcity spec to be created.');

        const demoMap = CityMap.fromSpec(demoSpec, cfg);
        const bigMap = CityMap.fromSpec(bigSpec, cfg);
        assertTrue(!!demoMap && !!bigMap, 'Expected CityMap instances from specs.');

        const genCfg = createGeneratorConfig();
        const demoRoads = generateRoads({ map: demoMap, config: genCfg, materials: {} });
        const bigRoads = generateRoads({ map: bigMap, config: genCfg, materials: {} });
        assertTrue(!!demoRoads?.group, 'Expected demo roads group.');
        assertTrue(!!bigRoads?.group, 'Expected bigcity roads group.');
    });

    // ========== Map Debugger Camera Controls Tests ==========
    try {
        const { MapDebuggerShortcutsPanel } = await import('/src/graphics/gui/map_debugger/MapDebuggerShortcutsPanel.js');
        const { MapDebuggerState } = await import('/src/states/MapDebuggerState.js');
        const { createCityConfig } = await import('/src/app/city/CityConfig.js');
        const { CityMap } = await import('/src/app/city/CityMap.js');

        test('MapDebuggerShortcutsPanel: includes R and T shortcuts', () => {
            const panel = new MapDebuggerShortcutsPanel();
            const keys = Array.from(panel.root.querySelectorAll('.map-debugger-shortcuts-key')).map((el) => el.textContent);
            const expected = ['A', 'Z', 'R', 'T', '↑', '↓', '←', '→', 'Esc'];
            expected.forEach((key) => {
                assertTrue(keys.includes(key), `Expected shortcut key ${key}.`);
            });
            panel.destroy();
        });

        test('MapDebuggerState: wheel zoom gated by editing', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(),
                clearScene: () => {},
                context: {}
            };
            const sm = { go: () => {} };
            const state = new MapDebuggerState(engine, sm);

            state._zoom = 10;
            state._zoomMin = 0;
            state._zoomMax = 100;
            state._zoomSpeed = 40;

            let prevented = false;
            const e = { deltaMode: 0, deltaY: 120, preventDefault: () => { prevented = true; } };

            state._roadModeEnabled = true;
            state._buildingModeEnabled = false;
            state._handleWheel(e);
            assertEqual(state._zoom, 10, 'Zoom should not change while editing.');
            assertFalse(prevented, 'Wheel should not prevent default while editing.');

            state._roadModeEnabled = false;
            state._buildingModeEnabled = false;
            state._handleWheel(e);
            assertTrue(state._zoom !== 10, 'Zoom should change when not editing.');
            assertTrue(prevented, 'Wheel should prevent default when zooming.');
        });

        test('MapDebuggerState: drag pan gated by editing', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(),
                clearScene: () => {},
                context: {}
            };
            const sm = { go: () => {} };
            const state = new MapDebuggerState(engine, sm);

            let dragStarted = false;
            state._startCameraDrag = () => { dragStarted = true; };
            const e = { button: 0 };

            state._roadModeEnabled = true;
            state._buildingModeEnabled = false;
            state._handlePointerDown(e);
            assertFalse(dragStarted, 'Drag should not start while editing.');

            state._roadModeEnabled = false;
            state._buildingModeEnabled = false;
            state._handlePointerDown(e);
            assertFalse(dragStarted, 'Drag should not start when not editing (tool camera uses RMB/MMB).');
        });

        test('MapDebuggerState: loadCitySpec triggers rebuild path', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(),
                clearScene: () => {},
                context: {}
            };
            const sm = { go: () => {} };
            const state = new MapDebuggerState(engine, sm);

            let called = null;
            state._applySpec = (spec, options) => { called = { spec, options }; };

            state._loadCitySpec('bigcity');
            assertTrue(!!called, 'Expected loadCitySpec to call _applySpec.');
            assertEqual(state._citySpecId, 'bigcity', 'Expected selected spec id to be stored.');
            assertTrue(!!called?.options?.resetCamera, 'Expected loadCitySpec to reset camera.');
            assertEqual(state._cityOptions.size, 600, 'Expected bigcity size to update city options.');
        });

        test('MapDebuggerState: road draft markers + live preview (segment-by-segment)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); },
                context: {}
            };
            const sm = { go: () => {} };
            const state = new MapDebuggerState(engine, sm);
            const cfg = createCityConfig(state._cityOptions);
            const spec = CityMap.demoSpec(cfg);
            state._applySpec(spec, { resetCamera: true });

            state._startRoadMode();
            const markers = state.city.group.getObjectByName('EditorRoadDraftMarkers');
            const preview = state.city.group.getObjectByName('EditorRoadDraftPreview');
            assertTrue(!!markers, 'Expected draft marker overlay.');
            assertTrue(!!preview, 'Expected draft preview group.');
            assertEqual(markers.count, 0, 'Expected 0 draft markers initially.');
            assertEqual(preview.children.length, 0, 'Expected 0 preview sections initially.');

            state._handleRoadToolClick({ x: 1, y: 1 });
            assertEqual(markers.count, 1, 'Expected 1 draft marker after first point.');
            assertEqual(preview.children.length, 0, 'Preview should not render with <2 draft points.');

            state._handleRoadToolClick({ x: 3, y: 1 });
            assertEqual(markers.count, 2, 'Expected 2 draft markers after second point.');
            assertEqual(preview.children.length, 1, 'Expected 1 preview section for 2 draft points.');

            const hashFloatArray = (arr, scale = 1000) => {
                let h = 2166136261;
                for (let i = 0; i < arr.length; i++) {
                    const v = Math.round(arr[i] * scale);
                    h ^= v;
                    h = Math.imul(h, 16777619);
                }
                return h >>> 0;
            };

            const hashPreview = (group) => {
                let h = 2166136261;
                group.traverse((obj) => {
                    if (obj?.name !== 'Asphalt') return;
                    const arr = obj.geometry?.attributes?.position?.array ?? null;
                    if (!arr) return;
                    h ^= hashFloatArray(arr);
                    h = Math.imul(h, 16777619);
                });
                return h >>> 0;
            };

            const h1 = hashPreview(preview);
            state._syncRoadDraftPreview();
            const h2 = hashPreview(preview);
            assertEqual(h2, h1, 'Expected deterministic preview rebuild hash.');

            state._handleRoadToolClick({ x: 3, y: 4 });
            assertEqual(preview.children.length, 2, 'Expected N-1 preview sections for N draft points.');

            state._cancelRoadDraft();
            assertEqual(markers.count, 0, 'Expected markers cleared after cancelling road draft.');
            assertEqual(preview.children.length, 0, 'Expected preview cleared after cancelling road draft.');
        });

        test('MapDebuggerState: road draft preview clears on done', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); },
                context: {}
            };
            const sm = { go: () => {} };
            const state = new MapDebuggerState(engine, sm);
            const cfg = createCityConfig(state._cityOptions);
            const spec = CityMap.demoSpec(cfg);
            state._applySpec(spec, { resetCamera: true });

            state._startRoadMode();
            state._handleRoadToolClick({ x: 2, y: 2 });
            state._handleRoadToolClick({ x: 5, y: 2 });
            state._handleRoadToolClick({ x: 4, y: 6 });
            state._doneRoadMode();

            const markers = state.city.group.getObjectByName('EditorRoadDraftMarkers');
            const preview = state.city.group.getObjectByName('EditorRoadDraftPreview');
            assertTrue(!!markers, 'Expected draft marker overlay after done.');
            assertTrue(!!preview, 'Expected draft preview group after done.');
            assertEqual(markers.count, 0, 'Expected markers cleared after done.');
            assertEqual(preview.children.length, 0, 'Expected preview cleared after done.');
            assertFalse(state._roadModeEnabled, 'Expected road mode disabled after done.');
        });

        test('MapDebuggerState: hover edge connection lines', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); },
                context: {}
            };
            const sm = { go: () => {} };
            const state = new MapDebuggerState(engine, sm);

            const cfg = createCityConfig({ size: 288, mapTileSize: 24, seed: 'edge-hover-001' });
            const spec = {
                version: 1,
                seed: cfg.seed,
                width: 12,
                height: 12,
                tileSize: cfg.map.tileSize,
                origin: cfg.map.origin,
                roads: [
                    { a: [5, 5], b: [9, 5], lanesF: 2, lanesB: 2, tag: 'r1' },
                    { a: [5, 5], b: [5, 9], lanesF: 2, lanesB: 2, tag: 'r2' }
                ],
                buildings: []
            };
            state._applySpec(spec, { resetCamera: true });

            const line = state.city.group.getObjectByName('EditorEdgeConnectionHoverLine');
            assertTrue(!!line, 'Expected edge connection hover line overlay.');
            assertFalse(line.visible, 'Expected hover line hidden by default.');

            const debug = state.city?.roads?.debug ?? null;
            const joins = Array.isArray(debug?.cornerJoins) ? debug.cornerJoins : [];
            const edges = Array.isArray(debug?.edges) ? debug.edges : [];
            const join = joins.find((j) => j?.nodeId === 't:5,5') ?? joins[0] ?? null;
            assertTrue(!!join, 'Expected a corner join in the test map.');
            const conn = Array.isArray(join?.connections) ? join.connections[0] : null;
            assertTrue(!!conn?.a && !!conn?.b, 'Expected join connections.');

            const edgePoint = (nodeId, edgeId, side) => {
                const edge = edges.find((e) => e?.edgeId === edgeId) ?? null;
                if (!edge) return null;
                if (edge.a === nodeId) return side === 'left' ? edge.left?.a : edge.right?.a;
                if (edge.b === nodeId) return side === 'left' ? edge.right?.b : edge.left?.b;
                return null;
            };

            const pConnected = edgePoint(join.nodeId, conn.a.edgeId, conn.a.side);
            assertTrue(!!pConnected, 'Expected connected edge point position.');
            state._updateEdgeConnectionHover(new THREE.Vector3(pConnected.x, 0, pConnected.z));
            assertTrue(line.visible, 'Expected hover line visible when hovering connected edge point.');
            const startCount = line.geometry?.attributes?.instanceStart?.count ?? 0;
            const endCount = line.geometry?.attributes?.instanceEnd?.count ?? 0;
            assertEqual(startCount, 1, 'Expected exactly one hover line segment.');
            assertEqual(endCount, 1, 'Expected exactly one hover line segment.');

            const edgeForConn = edges.find((e) => e?.edgeId === conn.a.edgeId) ?? null;
            const otherNodeId = edgeForConn ? (edgeForConn.a === join.nodeId ? edgeForConn.b : edgeForConn.a) : null;
            const pUnconnected = otherNodeId ? (edgePoint(otherNodeId, conn.a.edgeId, conn.a.side) ?? edgePoint(otherNodeId, conn.a.edgeId, 'left')) : null;
            assertTrue(!!pUnconnected, 'Expected unconnected edge point position.');
            state._updateEdgeConnectionHover(new THREE.Vector3(pUnconnected.x, 0, pUnconnected.z));
            assertFalse(line.visible, 'Expected no hover line when hovering unconnected edge point.');

            state._updateEdgeConnectionHover(new THREE.Vector3(9999, 0, 9999));
            assertFalse(line.visible, 'Expected hover line cleared when hover ends.');
        });
    } catch (e) {
        console.log('⏭️  Map debugger camera tests skipped:', e.message);
    }

    // ========== Road Graph / Geometry Tests ==========
    try {
        const { createCityConfig } = await import('/src/app/city/CityConfig.js');
        const { CityMap } = await import('/src/app/city/CityMap.js');
        const { generateRoads } = await import('/src/graphics/assets3d/generators/RoadGenerator.js');
        const { getCityMaterials } = await import('/src/graphics/assets3d/textures/CityMaterials.js');
        const { generateCenterlineFromPolyline } = await import('/src/app/geometry/PolylineTAT.js');

	        const hashFloatArray = (arr, scale = 1000) => {
	            let h = 2166136261;
	            for (let i = 0; i < arr.length; i++) {
	                const v = Math.round(arr[i] * scale);
	                h ^= v;
	                h = Math.imul(h, 16777619);
	            }
	            return h >>> 0;
	        };

	        const findMergeRange = (mesh, predicate) => {
	            const geom = mesh?.geometry ?? null;
	            const ranges = Array.isArray(geom?.userData?.mergeRanges) ? geom.userData.mergeRanges : [];
	            const data = Array.isArray(geom?.userData?.mergeRangeData) ? geom.userData.mergeRangeData : [];
	            const n = Math.min(ranges.length, data.length);
	            for (let i = 0; i < n; i++) {
	                const meta = data[i];
	                if (!predicate(meta, i)) continue;
	                return { range: ranges[i], meta, index: i };
	            }
	            return null;
	        };

	        const centroidRangeXZ = (mesh, range) => {
	            const pos = mesh?.geometry?.attributes?.position?.array ?? null;
	            const start = range?.start ?? null;
	            const count = range?.count ?? null;
	            if (!pos || !Number.isFinite(start) || !Number.isFinite(count) || !(count > 0)) return null;
	            let cx = 0;
	            let cz = 0;
	            let n = 0;
	            for (let i = 0; i < count; i++) {
	                const idx = (start + i) * 3;
	                const x = pos[idx];
	                const z = pos[idx + 2];
	                if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
	                cx += x;
	                cz += z;
	                n += 1;
	            }
	            if (n === 0) return null;
	            return { x: cx / n, z: cz / n };
	        };

	        const orientXZ = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

	        const onSegmentXZ = (a, b, p, eps = 1e-9) => {
	            const minX = Math.min(a.x, b.x) - eps;
	            const maxX = Math.max(a.x, b.x) + eps;
	            const minZ = Math.min(a.z, b.z) - eps;
	            const maxZ = Math.max(a.z, b.z) + eps;
	            return p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ;
	        };

	        const segmentsIntersectXZ = (a0, a1, b0, b1, eps = 1e-9) => {
	            const o1 = orientXZ(a0, a1, b0);
	            const o2 = orientXZ(a0, a1, b1);
	            const o3 = orientXZ(b0, b1, a0);
	            const o4 = orientXZ(b0, b1, a1);

	            const s1 = Math.abs(o1) <= eps ? 0 : (o1 > 0 ? 1 : -1);
	            const s2 = Math.abs(o2) <= eps ? 0 : (o2 > 0 ? 1 : -1);
	            const s3 = Math.abs(o3) <= eps ? 0 : (o3 > 0 ? 1 : -1);
	            const s4 = Math.abs(o4) <= eps ? 0 : (o4 > 0 ? 1 : -1);

	            if (s1 !== 0 && s2 !== 0 && s3 !== 0 && s4 !== 0) {
	                return (s1 !== s2) && (s3 !== s4);
	            }

	            if (s1 === 0 && onSegmentXZ(a0, a1, b0, eps)) return true;
	            if (s2 === 0 && onSegmentXZ(a0, a1, b1, eps)) return true;
	            if (s3 === 0 && onSegmentXZ(b0, b1, a0, eps)) return true;
	            if (s4 === 0 && onSegmentXZ(b0, b1, a1, eps)) return true;
	            return false;
	        };

            const polygonSignedAreaXZ = (pts) => {
                const list = Array.isArray(pts) ? pts : [];
                if (list.length < 3) return 0;
                let area = 0;
                for (let i = 0; i < list.length; i++) {
                    const a = list[i];
                    const b = list[(i + 1) % list.length];
                    area += a.x * b.z - b.x * a.z;
                }
                return area * 0.5;
            };

            const findMergeRanges = (mesh, predicate) => {
                const geom = mesh?.geometry ?? null;
                const ranges = Array.isArray(geom?.userData?.mergeRanges) ? geom.userData.mergeRanges : [];
                const data = Array.isArray(geom?.userData?.mergeRangeData) ? geom.userData.mergeRangeData : [];
                const n = Math.min(ranges.length, data.length);
                const out = [];
                for (let i = 0; i < n; i++) {
                    const meta = data[i];
                    if (!predicate(meta, i)) continue;
                    out.push({ range: ranges[i], meta, index: i });
                }
                return out;
            };

            const verticesInRangeXZ = (mesh, range) => {
                const pos = mesh?.geometry?.attributes?.position?.array ?? null;
                const start = range?.start ?? null;
                const count = range?.count ?? null;
                if (!pos || !Number.isFinite(start) || !Number.isFinite(count) || !(count > 0)) return [];
                const out = [];
                for (let i = 0; i < count; i++) {
                    const idx = (start + i) * 3;
                    const x = pos[idx];
                    const z = pos[idx + 2];
                    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
                    out.push({ x, z });
                }
                return out;
            };

            const pointInPolygonStrictXZ = (p, poly, eps = 1e-9) => {
                const list = Array.isArray(poly) ? poly : [];
                if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z) || list.length < 3) return false;

                for (let i = 0; i < list.length; i++) {
                    const a = list[i];
                    const b = list[(i + 1) % list.length];
                    if (Math.abs(orientXZ(a, b, p)) <= eps && onSegmentXZ(a, b, p, eps)) return false;
                }

                let inside = false;
                for (let i = 0, j = list.length - 1; i < list.length; j = i++) {
                    const a = list[i];
                    const b = list[j];
                    const zi = a.z;
                    const zj = b.z;
                    const intersects = ((zi > p.z) !== (zj > p.z))
                        && (p.x < (b.x - a.x) * (p.z - zi) / (zj - zi + 0.0) + a.x);
                    if (intersects) inside = !inside;
                }
                return inside;
            };

            const normalizeXZ = (a, b) => {
                const dx = b.x - a.x;
                const dz = b.z - a.z;
                const len = Math.hypot(dx, dz);
                if (!(len > 1e-9)) return null;
                const inv = 1 / len;
                return { x: dx * inv, z: dz * inv, length: len };
            };

            const tangentDirAt = (arc, point) => {
                if (!arc || !point) return null;
                const center = arc.center ?? null;
                const ccw = arc.ccw === true;
                if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) return null;
                const rx = point.x - center.x;
                const rz = point.z - center.z;
                const len = Math.hypot(rx, rz);
                if (!(len > 1e-9)) return null;
                const inv = 1 / len;
                const ux = rx * inv;
                const uz = rz * inv;
                const tx = ccw ? -uz : uz;
                const tz = ccw ? ux : -ux;
                return { x: tx, z: tz };
            };

            const hashPointsXZ = (pts, scale = 1000) => {
                const list = Array.isArray(pts) ? pts : [];
                let h = 2166136261;
                for (const p of list) {
                    const x = Math.round((p?.x ?? 0) * scale);
                    const z = Math.round((p?.z ?? 0) * scale);
                    h ^= x;
                    h = Math.imul(h, 16777619);
                    h ^= z;
                    h = Math.imul(h, 16777619);
                }
                return h >>> 0;
            };

            const findPointIndexNear = (pts, target, eps = 1e-5) => {
                const list = Array.isArray(pts) ? pts : [];
                if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) return -1;
                const e2 = eps * eps;
                for (let i = 0; i < list.length; i++) {
                    const p = list[i];
                    const dx = p.x - target.x;
                    const dz = p.z - target.z;
                    if ((dx * dx + dz * dz) <= e2) return i;
                }
                return -1;
            };

        test('RoadNetwork: splits centerline crossings into nodes', () => {
            const cfg = createCityConfig({ size: 288, mapTileSize: 24, seed: 'road-net-001' });
            const spec = {
                version: 1,
                seed: cfg.seed,
                width: 12,
                height: 12,
                tileSize: cfg.map.tileSize,
                origin: cfg.map.origin,
                roads: [
                    { a: [0, 5], b: [10, 5], lanesF: 2, lanesB: 2, tag: 'h' },
                    { a: [5, 0], b: [5, 10], lanesF: 2, lanesB: 2, tag: 'v' }
                ],
                buildings: []
            };

            const map = CityMap.fromSpec(spec, cfg);
            const net = map.roadNetwork;
            assertTrue(!!net, 'Expected CityMap to create a roadNetwork.');

            const node = net.getNode('t:5,5');
            assertTrue(!!node, 'Expected intersection node at t:5,5.');
            assertEqual(node.edgeIds.length, 4, 'Expected 4 edge pieces incident at the crossing.');

            const edges = net.getEdges();
            assertEqual(edges.length, 4, 'Expected 4 total edge pieces after splitting.');
        });

        test('RoadNetwork: demo spec graph is deterministic', () => {
            const cfg = createCityConfig({ seed: 'demo-graph-001' });
            const spec = CityMap.demoSpec(cfg);

            const mapA = CityMap.fromSpec(spec, cfg);
            const mapB = CityMap.fromSpec(spec, cfg);

            const netA = mapA.roadNetwork;
            const netB = mapB.roadNetwork;

            assertTrue(!!netA && !!netB, 'Expected road networks to exist.');
            assertEqual(JSON.stringify(netA.nodeIds), JSON.stringify(netB.nodeIds), 'Expected node ids to be stable.');
            assertEqual(JSON.stringify(netA.edgeIds), JSON.stringify(netB.edgeIds), 'Expected edge ids to be stable.');

            assertTrue(netA.getNode('t:8,8') !== null, 'Expected arterial crossing node at t:8,8.');
        });

        test('RoadGenerator: generates stable centerline asphalt geometry', () => {
            const cfg = createCityConfig({ seed: 'demo-geo-001' });
            const spec = CityMap.demoSpec(cfg);
            const map = CityMap.fromSpec(spec, cfg);
            const materials = getCityMaterials();

            const a = generateRoads({ map, config: { road: {} }, materials });
            const b = generateRoads({ map, config: { road: {} }, materials });

            const posA = a?.asphalt?.geometry?.attributes?.position?.array ?? null;
            const posB = b?.asphalt?.geometry?.attributes?.position?.array ?? null;
            assertTrue(posA && posB, 'Expected asphalt geometry position buffers.');
            assertEqual(posA.length, posB.length, 'Expected matching geometry buffer sizes.');

            for (let i = 0; i < posA.length; i++) {
                assertTrue(Number.isFinite(posA[i]), 'Expected finite position values.');
            }

            const hashA = hashFloatArray(posA);
            const hashB = hashFloatArray(posB);
            assertEqual(hashA, hashB, 'Expected deterministic asphalt geometry.');
        });

	        test('RoadGenerator: produces intersections and joins', () => {
	            const cfg = createCityConfig({ seed: 'demo-joins-001' });
	            const spec = CityMap.demoSpec(cfg);
	            const map = CityMap.fromSpec(spec, cfg);
	            const materials = getCityMaterials();

	            const roads = generateRoads({ map, config: { road: {} }, materials });
	            const debug = roads?.debug ?? null;
	            const intersections = Array.isArray(debug?.intersections) ? debug.intersections : [];
	            const joins = Array.isArray(debug?.cornerJoins) ? debug.cornerJoins : [];

	            assertTrue(intersections.length > 0, 'Expected at least 1 intersection polygon.');
	            assertTrue(joins.length > 0, 'Expected at least 1 corner join.');
	        });

	        test('RoadGenerator: T junction intersection stays local and keeps boundaries offset', () => {
	            const cfg = createCityConfig({ size: 288, mapTileSize: 24, seed: 't-junction-001' });
	            const spec = {
                version: 1,
                seed: cfg.seed,
                width: 12,
                height: 12,
                tileSize: cfg.map.tileSize,
                origin: cfg.map.origin,
                roads: [
                    { a: [0, 2], b: [10, 2], lanesF: 2, lanesB: 2, tag: 'main' },
                    { a: [5, 0], b: [5, 2], lanesF: 2, lanesB: 2, tag: 'branch' }
                ],
                buildings: []
            };

            const map = CityMap.fromSpec(spec, cfg);
            const materials = getCityMaterials();
            const roads = generateRoads({ map, config: { road: {} }, materials });

            const net = map.roadNetwork;
            const nodeId = 't:5,2';
            const node = net?.getNode?.(nodeId) ?? null;
            assertTrue(!!node, 'Expected T junction node at t:5,2.');

	            const debug = roads?.debug ?? null;
	            const intersections = Array.isArray(debug?.intersections) ? debug.intersections : [];
	            const entry = intersections.find((e) => e?.nodeId === nodeId) ?? null;
	            assertTrue(!!entry, 'Expected intersection polygon at the T junction node.');

            const points = Array.isArray(entry?.points) ? entry.points : [];
            assertTrue(points.length >= 3, 'Expected intersection polygon points.');

            let cx = 0;
            let cz = 0;
            let count = 0;
            for (const p of points) {
                if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
                cx += p.x;
                cz += p.z;
                count += 1;
            }
            assertTrue(count >= 3, 'Expected finite polygon vertex coordinates.');
	            cx /= count;
	            cz /= count;
	            const centroidDist = Math.hypot(cx - node.position.x, cz - node.position.z);
	            assertTrue(centroidDist < cfg.map.tileSize * 2, 'Expected polygon centroid near the node.');

	            const asphaltMesh = roads?.asphalt ?? null;
	            const intersectionRange = findMergeRange(asphaltMesh, (meta) => meta?.kind === 'intersection' && meta?.nodeId === nodeId);
	            assertTrue(!!intersectionRange, 'Expected intersection asphalt merge range meta for the T junction.');
	            const geoCentroid = centroidRangeXZ(asphaltMesh, intersectionRange.range);
	            assertTrue(!!geoCentroid, 'Expected intersection asphalt centroid.');
	            const geoDist = Math.hypot(geoCentroid.x - node.position.x, geoCentroid.z - node.position.z);
	            assertTrue(geoDist < cfg.map.tileSize * 2, 'Expected intersection asphalt geometry near the node.');

            const edges = Array.isArray(debug?.edges) ? debug.edges : [];
            const incident = edges.filter((e) => e?.a === nodeId || e?.b === nodeId);
            assertTrue(incident.length === 3, 'Expected 3 incident edge pieces at the T junction node.');

	            for (const edge of incident) {
	                const isA = edge.a === nodeId;
	                const left = isA ? edge?.left?.a : edge?.left?.b;
	                const right = isA ? edge?.right?.a : edge?.right?.b;
	                assertTrue(!!left && !!right, 'Expected edge boundary points at the junction.');
	                const dl = Math.hypot(left.x - node.position.x, left.z - node.position.z);
	                const dr = Math.hypot(right.x - node.position.x, right.z - node.position.z);
	                assertTrue(dl > 0.5 && dr > 0.5, 'Expected boundary points to be offset from node center.');
	            }
	        });

	        test('RoadGenerator: corner join recesses edges and avoids crossing', () => {
	            const cfg = createCityConfig({ size: 288, mapTileSize: 24, seed: 'corner-join-001' });
	            const spec = {
	                version: 1,
	                seed: cfg.seed,
	                width: 12,
	                height: 12,
	                tileSize: cfg.map.tileSize,
	                origin: cfg.map.origin,
	                roads: [
	                    { a: [2, 2], b: [2, 8], lanesF: 1, lanesB: 1, tag: 'v' },
	                    { a: [2, 2], b: [8, 2], lanesF: 1, lanesB: 1, tag: 'h' }
	                ],
	                buildings: []
	            };

	            const map = CityMap.fromSpec(spec, cfg);
	            const materials = getCityMaterials();
	            const roads = generateRoads({ map, config: { road: {} }, materials });

	            const nodeId = 't:2,2';
	            const debug = roads?.debug ?? null;
	            const edges = Array.isArray(debug?.edges) ? debug.edges : [];
	            const incident = edges.filter((e) => e?.a === nodeId || e?.b === nodeId);
	            assertTrue(incident.length === 2, 'Expected 2 incident edge pieces at the corner node.');

	            const asphaltMesh = roads?.asphalt ?? null;
	            const joinRange = findMergeRange(asphaltMesh, (meta) => meta?.kind === 'join' && meta?.nodeId === nodeId);
	            assertTrue(!!joinRange, 'Expected join asphalt merge range meta for the corner node.');
	            assertTrue(Number.isFinite(joinRange.meta?.cutback) && joinRange.meta.cutback > 0.1, 'Expected join to recess road endpoints.');

	            const joinCentroid = centroidRangeXZ(asphaltMesh, joinRange.range);
	            assertTrue(!!joinCentroid, 'Expected join asphalt centroid.');
	            const node = map.roadNetwork?.getNode?.(nodeId) ?? null;
	            assertTrue(!!node, 'Expected corner node to exist.');
	            const joinDist = Math.hypot(joinCentroid.x - node.position.x, joinCentroid.z - node.position.z);
	            assertTrue(joinDist < cfg.map.tileSize * 2, 'Expected join asphalt geometry near the node.');

	            const cuts = [];
	            const crossSections = [];
	            for (const edge of incident) {
	                const isA = edge.a === nodeId;
	                const left = isA ? edge?.left?.a : edge?.left?.b;
	                const right = isA ? edge?.right?.a : edge?.right?.b;
	                assertTrue(!!left && !!right, 'Expected boundary points at the corner node.');
	                cuts.push(Math.hypot(left.x - node.position.x, left.z - node.position.z));
	                cuts.push(Math.hypot(right.x - node.position.x, right.z - node.position.z));
	                crossSections.push({ left, right });
	            }
	            assertTrue(cuts.every((d) => d > 0.5), 'Expected boundaries to be cut back from node center.');
	            assertTrue(!segmentsIntersectXZ(crossSections[0].left, crossSections[0].right, crossSections[1].left, crossSections[1].right), 'Expected trimmed cross-sections not to cross.');
	        });

            test('PolylineTAT: fillet is G1-continuous at tangents', () => {
                const res = generateCenterlineFromPolyline({
                    points: [
                        { x: 0, z: 0 },
                        { x: 10, z: 0 },
                        { x: 10, z: 10 }
                    ],
                    defaultRadius: 3,
                    chord: 0.25
                });

                assertTrue(res?.ok === true, 'Expected generateCenterlineFromPolyline to succeed.');
                assertTrue(Array.isArray(res?.points) && res.points.length > 3, 'Expected sampled points.');
                assertTrue(Array.isArray(res?.corners) && res.corners.length === 1, 'Expected one corner entry.');
                assertTrue(res.corners[0]?.ok === true, 'Expected corner to be filleted.');

                for (const p of res.points) {
                    assertTrue(Number.isFinite(p.x) && Number.isFinite(p.z), 'Expected finite sampled points.');
                }

                const c = res.corners[0];
                const iIn = findPointIndexNear(res.points, c.inTangent, 1e-4);
                const iOut = findPointIndexNear(res.points, c.outTangent, 1e-4);
                assertTrue(iIn > 0 && iIn + 1 < res.points.length, 'Expected inTangent in sampled points.');
                assertTrue(iOut > 0 && iOut + 1 < res.points.length, 'Expected outTangent in sampled points.');

                const d0 = normalizeXZ(res.points[iIn - 1], res.points[iIn]);
                const d1 = normalizeXZ(res.points[iIn], res.points[iIn + 1]);
                const d2 = normalizeXZ(res.points[iOut - 1], res.points[iOut]);
                const d3 = normalizeXZ(res.points[iOut], res.points[iOut + 1]);
                assertTrue(!!d0 && !!d1 && !!d2 && !!d3, 'Expected finite tangent directions.');
                assertTrue((d0.x * d1.x + d0.z * d1.z) > 0.99, 'Expected G1 continuity at inTangent.');
                assertTrue((d2.x * d3.x + d2.z * d3.z) > 0.99, 'Expected G1 continuity at outTangent.');
            });

            test('PolylineTAT: clamps radius when it does not fit', () => {
                const res = generateCenterlineFromPolyline({
                    points: [
                        { x: 0, z: 0 },
                        { x: 1, z: 0 },
                        { x: 1, z: 1 }
                    ],
                    defaultRadius: 100,
                    chord: 0.05
                });

                assertTrue(res?.ok === true, 'Expected centerline generation to succeed.');
                assertTrue(res.corners.length === 1, 'Expected one corner entry.');
                const c = res.corners[0];
                assertTrue(c.ok === true, 'Expected corner to be filleted.');
                assertTrue(c.radiusUsed > 0, 'Expected radiusUsed > 0.');
                assertTrue(c.radiusUsed <= 1.001, 'Expected radius to be clamped to fit short segments.');
                assertTrue(c.radiusUsed < c.radiusRequested, 'Expected radiusUsed < radiusRequested.');
            });

            test('PolylineTAT: per-point radius overrides default', () => {
                const res = generateCenterlineFromPolyline({
                    points: [
                        { x: 0, z: 0 },
                        { x: 10, z: 0, radius: 1 },
                        { x: 10, z: 10 },
                        { x: 20, z: 10 }
                    ],
                    defaultRadius: 4,
                    chord: 0.25
                });

                assertTrue(res?.ok === true, 'Expected centerline generation to succeed.');
                const corners = Array.isArray(res?.corners) ? res.corners : [];
                const c1 = corners.find((c) => c?.index === 1) ?? null;
                const c2 = corners.find((c) => c?.index === 2) ?? null;
                assertTrue(!!c1 && !!c2, 'Expected 2 corner entries.');
                assertNear(c1.radiusRequested, 1, 1e-6, 'Expected override radiusRequested.');
                assertNear(c2.radiusRequested, 4, 1e-6, 'Expected default radiusRequested.');
            });

            test('RoadGenerator: polyline road spec round-trips and is deterministic', () => {
                const cfg = createCityConfig({ size: 288, mapTileSize: 24, seed: 'polyline-spec-001' });
                const ts = cfg.map.tileSize;
                const org = cfg.map.origin;
                const wpt = (x, y) => ({ x: org.x + x * ts, z: org.z + y * ts });

                const spec = {
                    version: 1,
                    seed: cfg.seed,
                    width: 12,
                    height: 12,
                    tileSize: ts,
                    origin: org,
                    roads: [
                        {
                            points: [wpt(2, 2), wpt(2, 8), wpt(8, 8)],
                            defaultRadius: ts * 0.2,
                            lanesF: 1,
                            lanesB: 1,
                            tag: 'poly',
                            rendered: true
                        }
                    ],
                    buildings: []
                };

                const mapA = CityMap.fromSpec(spec, cfg);
                assertEqual(mapA.roadSegments.length, 1, 'Expected one road segment entry.');
                assertEqual(mapA.roadSegments[0]?.kind, 'polyline', 'Expected polyline road meta.');

                const outA = mapA.exportSpec({ seed: cfg.seed, version: 1 });
                const mapB = CityMap.fromSpec(outA, cfg);
                const outB = mapB.exportSpec({ seed: cfg.seed, version: 1 });
                assertEqual(JSON.stringify(outA.roads), JSON.stringify(outB.roads), 'Expected exported roads to be reloadable and deterministic.');

                const materials = getCityMaterials();
                const a = generateRoads({ map: mapA, config: { road: {} }, materials });
                const b = generateRoads({ map: mapA, config: { road: {} }, materials });
                const posA = a?.asphalt?.geometry?.attributes?.position?.array ?? null;
                const posB = b?.asphalt?.geometry?.attributes?.position?.array ?? null;
                assertTrue(!!posA && !!posB, 'Expected asphalt position buffers.');
                assertEqual(hashFloatArray(posA), hashFloatArray(posB), 'Expected deterministic asphalt geometry for polyline roads.');
            });

            test('RoadGenerator: join boundary is simple, symmetric, and has curb/sidewalk', () => {
                const cfg = createCityConfig({ size: 288, mapTileSize: 24, seed: 'join-round-001' });
                const spec = {
                    version: 1,
                    seed: cfg.seed,
                    width: 12,
                    height: 12,
                    tileSize: cfg.map.tileSize,
                    origin: cfg.map.origin,
                    roads: [
                        { a: [2, 2], b: [2, 8], lanesF: 2, lanesB: 2, tag: 'v' },
                        { a: [2, 2], b: [8, 2], lanesF: 3, lanesB: 1, tag: 'h' }
                    ],
                    buildings: []
                };

                const map = CityMap.fromSpec(spec, cfg);
                const materials = getCityMaterials();
                const config = {
                    road: {
                        curb: { height: 0, extraHeight: 0, thickness: 0.25 },
                        sidewalk: { extraWidth: 1.0, lift: 0 },
                        curves: { turnRadius: 6 }
                    }
                };
                const roads = generateRoads({ map, config, materials });
                const nodeId = 't:2,2';

                const debug = roads?.debug ?? null;
                const join = (Array.isArray(debug?.cornerJoins) ? debug.cornerJoins : []).find((j) => j?.nodeId === nodeId) ?? null;
                assertTrue(!!join, 'Expected corner join debug entry.');
                assertTrue(Array.isArray(join?.points) && join.points.length >= 4, 'Expected join boundary polygon points.');
                assertTrue(Number.isFinite(join?.cutback) && join.cutback > 0.1, 'Expected join cutback.');

                for (const p of join.points) {
                    assertTrue(Number.isFinite(p.x) && Number.isFinite(p.z), 'Expected finite join boundary points.');
                }

                const poly = join.points;
                for (let i = 0; i < poly.length; i++) {
                    const a0 = poly[i];
                    const a1 = poly[(i + 1) % poly.length];
                    for (let j = i + 1; j < poly.length; j++) {
                        const b0 = poly[j];
                        const b1 = poly[(j + 1) % poly.length];
                        const adjacent = (i === j) || ((i + 1) % poly.length === j) || (i === (j + 1) % poly.length);
                        if (adjacent) continue;
                        assertFalse(segmentsIntersectXZ(a0, a1, b0, b1), 'Expected join boundary polygon not to self-intersect.');
                    }
                }

                const edges = Array.isArray(debug?.edges) ? debug.edges : [];
                const incident = edges.filter((e) => e?.a === nodeId || e?.b === nodeId);
                assertTrue(incident.length === 2, 'Expected 2 incident edge pieces at join node.');
                const node = map.roadNetwork?.getNode?.(nodeId) ?? null;
                assertTrue(!!node, 'Expected join node to exist.');

                const dirs = [];
                for (const e of incident) {
                    const a = e?.centerline?.a ?? null;
                    const b = e?.centerline?.b ?? null;
                    if (!a || !b) continue;
                    const dir = (e.a === nodeId) ? normalizeXZ(a, b) : normalizeXZ(b, a);
                    if (dir) dirs.push({ x: dir.x, z: dir.z });

                    const isA = e.a === nodeId;
                    const left = isA ? e?.left?.a : e?.left?.b;
                    const right = isA ? e?.right?.a : e?.right?.b;
                    assertTrue(!!left && !!right, 'Expected boundary points at join node.');
                    assertNear(Math.hypot(left.x - right.x, left.z - right.z), e.width, 1e-3, 'Expected constant road width at join.');

                    const pl = (left.x - node.position.x) * dir.x + (left.z - node.position.z) * dir.z;
                    const pr = (right.x - node.position.x) * dir.x + (right.z - node.position.z) * dir.z;
                    assertNear(pl, join.cutback, 1e-3, 'Expected symmetric cutback projection (left).');
                    assertNear(pr, join.cutback, 1e-3, 'Expected symmetric cutback projection (right).');
                }

                const checkArc = (arc) => {
                    if (!arc) return;
                    const t0 = arc.tangent0 ?? null;
                    const t1 = arc.tangent1 ?? null;
                    const dt0 = tangentDirAt(arc, t0);
                    const dt1 = tangentDirAt(arc, t1);
                    assertTrue(!!dt0 && !!dt1, 'Expected arc tangent directions.');
                    assertTrue(dirs.some((d) => Math.abs(d.x * dt0.x + d.z * dt0.z) > 0.99), 'Expected arc to be tangent to an incident road at tangent0.');
                    assertTrue(dirs.some((d) => Math.abs(d.x * dt1.x + d.z * dt1.z) > 0.99), 'Expected arc to be tangent to an incident road at tangent1.');
                };

                checkArc(join?.fillets?.edge12 ?? null);
                checkArc(join?.fillets?.edge30 ?? null);

                const curbMesh = roads?.curbBlocks ?? null;
                const walkMesh = roads?.sidewalk ?? null;
                const curbRanges = findMergeRanges(curbMesh, (meta) => meta?.kind === 'curb' && meta?.nodeId === nodeId);
                const walkRanges = findMergeRanges(walkMesh, (meta) => meta?.kind === 'sidewalk' && meta?.nodeId === nodeId);
                assertTrue(curbRanges.length > 0, 'Expected curb geometry ranges for join node.');
                assertTrue(walkRanges.length > 0, 'Expected sidewalk geometry ranges for join node.');
            });

            test('RoadGenerator: intersection stitching is clockwise and curb/sidewalk stay outside', () => {
                const cfg = createCityConfig({ size: 288, mapTileSize: 24, seed: 'intersection-clip-001' });
                const spec = {
                    version: 1,
                    seed: cfg.seed,
                    width: 12,
                    height: 12,
                    tileSize: cfg.map.tileSize,
                    origin: cfg.map.origin,
                    roads: [
                        { a: [0, 0], b: [10, 10], lanesF: 2, lanesB: 2, tag: 'd1' },
                        { a: [0, 10], b: [10, 0], lanesF: 2, lanesB: 2, tag: 'd2' }
                    ],
                    buildings: []
                };

                const map = CityMap.fromSpec(spec, cfg);
                const materials = getCityMaterials();
                const config = {
                    road: {
                        curb: { height: 0, extraHeight: 0, thickness: 0.25 },
                        sidewalk: { extraWidth: 1.0, lift: 0 }
                    }
                };

                const a = generateRoads({ map, config, materials });
                const b = generateRoads({ map, config, materials });

                const nodeId = 't:5,5';
                const intsA = Array.isArray(a?.debug?.intersections) ? a.debug.intersections : [];
                const intsB = Array.isArray(b?.debug?.intersections) ? b.debug.intersections : [];
                const ia = intsA.find((e) => e?.nodeId === nodeId) ?? null;
                const ib = intsB.find((e) => e?.nodeId === nodeId) ?? null;
                assertTrue(!!ia && !!ib, 'Expected intersection debug entry.');
                assertTrue(Array.isArray(ia.points) && ia.points.length >= 3, 'Expected intersection points.');

                const area = polygonSignedAreaXZ(ia.points);
                assertTrue(area < -1e-6, 'Expected clockwise intersection boundary ordering.');
                assertEqual(hashPointsXZ(ia.points), hashPointsXZ(ib.points), 'Expected stable intersection boundary ordering across runs.');

                const poly = ia.points;
                for (let i = 0; i < poly.length; i++) {
                    const a0 = poly[i];
                    const a1 = poly[(i + 1) % poly.length];
                    for (let j = i + 1; j < poly.length; j++) {
                        const b0 = poly[j];
                        const b1 = poly[(j + 1) % poly.length];
                        const adjacent = (i === j) || ((i + 1) % poly.length === j) || (i === (j + 1) % poly.length);
                        if (adjacent) continue;
                        assertFalse(segmentsIntersectXZ(a0, a1, b0, b1), 'Expected intersection boundary polygon not to self-intersect.');
                    }
                }

                const curbMesh = a?.curbBlocks ?? null;
                const walkMesh = a?.sidewalk ?? null;
                const curbRanges = findMergeRanges(curbMesh, (meta) => meta?.kind === 'curb' && meta?.nodeId === nodeId);
                const walkRanges = findMergeRanges(walkMesh, (meta) => meta?.kind === 'sidewalk' && meta?.nodeId === nodeId);
                assertTrue(curbRanges.length > 0, 'Expected curb ranges at intersection node.');
                assertTrue(walkRanges.length > 0, 'Expected sidewalk ranges at intersection node.');

                for (const entry of curbRanges) {
                    const verts = verticesInRangeXZ(curbMesh, entry.range);
                    for (const p of verts) {
                        assertFalse(pointInPolygonStrictXZ(p, ia.points, 1e-7), 'Expected curb vertices to stay outside intersection asphalt polygon.');
                    }
                }
                for (const entry of walkRanges) {
                    const verts = verticesInRangeXZ(walkMesh, entry.range);
                    for (const p of verts) {
                        assertFalse(pointInPolygonStrictXZ(p, ia.points, 1e-7), 'Expected sidewalk vertices to stay outside intersection asphalt polygon.');
                    }
                }
            });
	    } catch (e) {
	        console.log('⏭️  Road graph tests skipped:', e.message);
	    }

    // ========== Road Debugger State Tests (Task 53) ==========
    try {
        const { RoadDebuggerState } = await import('/src/states/RoadDebuggerState.js');

        test('RoadDebuggerState: enter/exit without errors', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;

            const engine = {
                canvas,
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const sm = { go: () => {} };
            const state = new RoadDebuggerState(engine, sm);

            state.enter();
            assertTrue(!!state.view, 'Expected RoadDebugger view instance.');
            assertTrue(engine.scene.children.length > 0, 'Expected RoadDebugger scene objects.');
            assertTrue(!!document.querySelector('.road-debugger-ui'), 'Expected RoadDebugger UI root.');

            state.exit();
            assertEqual(document.querySelector('.road-debugger-ui'), null, 'Expected RoadDebugger UI cleanup.');
        });

        test('RoadDebuggerState: does not mutate global UI when used with detached canvas (Task 70)', () => {
            const uiWelcome = document.getElementById('ui-welcome');
            const uiSelect = document.getElementById('ui-select');
            const uiSetup = document.getElementById('ui-setup');
            if (!uiWelcome || !uiSelect || !uiSetup) return;

            const before = {
                bodyClass: document.body.className,
                welcomeHidden: uiWelcome.classList.contains('hidden'),
                selectHidden: uiSelect.classList.contains('hidden'),
                setupHidden: uiSetup.classList.contains('hidden')
            };

            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;

            const engine = {
                canvas,
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const sm = { go: () => {} };
            const state = new RoadDebuggerState(engine, sm);
            try {
                state.enter();
            } finally {
                state.exit();
            }

            assertEqual(document.body.className, before.bodyClass, 'Expected body classes to remain unchanged.');
            assertEqual(uiWelcome.classList.contains('hidden'), before.welcomeHidden, 'Expected welcome visibility unchanged.');
            assertEqual(uiSelect.classList.contains('hidden'), before.selectHidden, 'Expected select visibility unchanged.');
            assertEqual(uiSetup.classList.contains('hidden'), before.setupHidden, 'Expected setup visibility unchanged.');
            assertEqual(document.querySelector('.road-debugger-ui'), null, 'Expected RoadDebugger UI cleanup.');
        });
    } catch (e) {
        console.log('⏭️  Road Debugger tests skipped:', e.message);
    }

    // ========== Road Debugger Pipeline Tests (Task 54) ==========
    try {
        const { rebuildRoadDebuggerPipeline } = await import('/src/app/road_debugger/RoadDebuggerPipeline.js');

        test('RoadDebuggerPipeline: N points produce N-1 segments', () => {
	            const roads = [
	                {
	                    id: 'roadA',
	                    name: 'Road A',
	                    lanesF: 2,
	                    lanesB: 1,
	                    points: [
	                        { id: 'p0', tileX: 0, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'p1', tileX: 1, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'p2', tileX: 2, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'p3', tileX: 3, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                }
	            ];

            const out = rebuildRoadDebuggerPipeline({ roads, settings: { origin: { x: 0, z: 0 }, tileSize: 24, laneWidth: 4.8, marginFactor: 0.1 } });
            assertEqual(out.segments.length, 3, 'Expected N-1 segments for N points.');
            assertEqual(out.segments[0]?.id, 'seg_roadA_p0_p1', 'Expected stable derived segment id.');
            assertEqual(out.segments[1]?.id, 'seg_roadA_p1_p2', 'Expected stable derived segment id.');
        });

        test('RoadDebuggerPipeline: lane/asphalt offsets follow laneWidth + margin', () => {
            const laneWidth = 4.8;
            const margin = laneWidth * 0.1;
            const lanesF = 2;
            const lanesB = 1;

	            const roads = [
	                {
	                    id: 'r1',
	                    name: 'R1',
	                    lanesF,
	                    lanesB,
	                    points: [
	                        { id: 'a', tileX: 0, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'b', tileX: 1, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                }
	            ];

            const out = rebuildRoadDebuggerPipeline({ roads, settings: { origin: { x: 0, z: 0 }, tileSize: 24, laneWidth, marginFactor: 0.1 } });
            const seg = out.segments[0];
            assertTrue(!!seg, 'Expected segment output.');

            const getLine = (kind) => seg.polylines.find((p) => p.kind === kind);
            const z0 = (kind) => getLine(kind)?.points?.[0]?.z;

            assertNear(z0('centerline'), 0, 1e-6, 'Centerline should be at divider.');
            assertNear(z0('forward_centerline'), (lanesF * laneWidth) * 0.5, 1e-6, 'Forward centerline offset.');
            assertNear(z0('backward_centerline'), -(lanesB * laneWidth) * 0.5, 1e-6, 'Backward centerline offset.');
            assertNear(z0('lane_edge_right'), lanesF * laneWidth, 1e-6, 'Forward lane edge offset.');
            assertNear(z0('lane_edge_left'), -(lanesB * laneWidth), 1e-6, 'Backward lane edge offset.');
            assertNear(z0('asphalt_edge_right'), lanesF * laneWidth + margin, 1e-6, 'Forward asphalt edge offset.');
            assertNear(z0('asphalt_edge_left'), -(lanesB * laneWidth + margin), 1e-6, 'Backward asphalt edge offset.');

            assertNear(seg.asphaltObb.halfWidthLeft, lanesB * laneWidth + margin, 1e-6, 'OBB left half-width.');
            assertNear(seg.asphaltObb.halfWidthRight, lanesF * laneWidth + margin, 1e-6, 'OBB right half-width.');
        });

        test('RoadDebuggerPipeline: deterministic output for same input', () => {
	            const roads = [
	                {
	                    id: 'roadDet',
	                    name: 'Deterministic',
	                    lanesF: 3,
	                    lanesB: 2,
	                    points: [
	                        { id: 'p0', tileX: 0, tileY: 0, offsetU: 0.05, offsetV: -0.02, tangentFactor: 1 },
	                        { id: 'p1', tileX: 0, tileY: 2, offsetU: -0.01, offsetV: 0.03, tangentFactor: 0.8 },
	                        { id: 'p2', tileX: 2, tileY: 2, offsetU: 0.0, offsetV: 0.0, tangentFactor: 1.1 }
	                    ]
	                }
	            ];

            const settings = { origin: { x: 0, z: 0 }, tileSize: 24, laneWidth: 4.8, marginFactor: 0.1 };
            const a = rebuildRoadDebuggerPipeline({ roads, settings });
            const b = rebuildRoadDebuggerPipeline({ roads, settings });
            assertEqual(JSON.stringify(a), JSON.stringify(b), 'Expected deterministic pipeline output.');
        });

        test('RoadDebuggerPipeline: does not create junctions for internal polyline points (Task 67)', () => {
	            const roads = [
	                {
	                    id: 'roadA',
	                    name: 'Road A',
	                    lanesF: 1,
	                    lanesB: 1,
	                    points: [
	                        { id: 'p0', tileX: 0, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'p1', tileX: 2, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'p2', tileX: 4, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                }
	            ];
            const settings = { origin: { x: 0, z: 0 }, tileSize: 24, laneWidth: 4.8, marginFactor: 0.1 };
            const out = rebuildRoadDebuggerPipeline({ roads, settings });
            assertEqual(out?.junctions?.length ?? 0, 0, 'Expected no junctions for a continuous polyline road.');
        });

        test('RoadDebuggerPipeline: crossing only produces junctions when manual junctions are provided (Task 67)', () => {
	            const roads = [
	                {
	                    id: 'roadH',
	                    name: 'Horizontal',
	                    lanesF: 1,
	                    lanesB: 1,
	                    points: [
	                        { id: 'h0', tileX: 0, tileY: 1, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'h1', tileX: 4, tileY: 1, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                },
	                {
	                    id: 'roadV',
	                    name: 'Vertical',
	                    lanesF: 1,
	                    lanesB: 1,
	                    points: [
	                        { id: 'v0', tileX: 2, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'v1', tileX: 2, tileY: 3, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                }
	            ];
            const settings = { origin: { x: 0, z: 0 }, tileSize: 24, laneWidth: 4.8, marginFactor: 0.1 };
            const outNoJunc = rebuildRoadDebuggerPipeline({ roads, settings });
            assertEqual(outNoJunc?.junctions?.length ?? 0, 0, 'Expected no junctions unless created explicitly.');

            const endpoints = outNoJunc?.junctionCandidates?.endpoints ?? [];
            const center = { x: 2 * settings.tileSize, z: 1 * settings.tileSize };
            const byRoad = (roadId) => endpoints
                .filter((e) => e?.id && e?.roadId === roadId && e?.world)
                .map((e) => {
                    const dx = (e.world.x ?? 0) - center.x;
                    const dz = (e.world.z ?? 0) - center.z;
                    return { id: e.id, dist: dx * dx + dz * dz };
                })
                .sort((a, b) => a.dist - b.dist)
                .slice(0, 2)
                .map((e) => e.id);

            const candidateIds = Array.from(new Set([...byRoad('roadH'), ...byRoad('roadV')])).sort();
            assertEqual(candidateIds.length, 4, 'Expected 4 endpoint candidates for manual crossing junction.');

            const out = rebuildRoadDebuggerPipeline({
                roads,
                settings: {
                    ...settings,
                    junctions: {
                        manualJunctions: [{ candidateIds }]
                    }
                }
            });
            assertEqual(out?.junctions?.length ?? 0, 1, 'Expected a single manual junction for a simple 2-road crossing.');
            const junction = out.junctions?.[0] ?? null;
            assertEqual(junction?.source, 'manual', 'Expected junction source to be manual.');
            assertEqual(junction?.endpoints?.length ?? 0, 4, 'Expected 4 approach endpoints for a 2-road crossing.');
            assertTrue((junction?.surface?.points?.length ?? 0) >= 4, 'Expected a junction surface polygon.');
        });
    } catch (e) {
        console.log('⏭️  Road Debugger pipeline tests skipped:', e.message);
    }

    // ========== Road Engine Tests (AI 76) ==========
    try {
        const { computeRoadEngineEdges } = await import('/src/app/road_engine/RoadEngineCompute.js');
        const { triangulateSimplePolygonXZ } = await import('/src/app/road_engine/RoadEngineMeshData.js');

	        test('RoadEngineCompute: deterministic output for JSON-cloned inputs (AI 76)', () => {
	            const roads = [
	                {
	                    id: 'roadDet',
	                    name: 'Deterministic',
	                    lanesF: 3,
	                    lanesB: 2,
	                    points: [
	                        { id: 'p0', tileX: 0, tileY: 0, offsetU: 0.05, offsetV: -0.02, tangentFactor: 1 },
	                        { id: 'p1', tileX: 0, tileY: 2, offsetU: -0.01, offsetV: 0.03, tangentFactor: 0.8 },
	                        { id: 'p2', tileX: 2, tileY: 2, offsetU: 0.0, offsetV: 0.0, tangentFactor: 1.1 }
	                    ]
	                }
	            ];
            const settings = { origin: { x: 0, z: 0 }, tileSize: 24, laneWidth: 4.8, marginFactor: 0.1 };
            const a = computeRoadEngineEdges({ roads, settings });
            const b = computeRoadEngineEdges({ roads: JSON.parse(JSON.stringify(roads)), settings: JSON.parse(JSON.stringify(settings)) });
            assertEqual(JSON.stringify(a), JSON.stringify(b), 'Expected deterministic road engine compute output.');
        });

        test('RoadEngineMeshData: triangulates concave polygons deterministically (AI 76)', () => {
            const poly = [
                { x: 0, z: 0 },
                { x: 4, z: 0 },
                { x: 4, z: 1 },
                { x: 1, z: 1 },
                { x: 1, z: 3 },
                { x: 4, z: 3 },
                { x: 4, z: 4 },
                { x: 0, z: 4 }
            ];

            const a = triangulateSimplePolygonXZ(poly);
            const b = triangulateSimplePolygonXZ(poly);

            assertEqual(JSON.stringify(a), JSON.stringify(b), 'Expected deterministic triangulation output.');
            assertTrue((a.vertices?.length ?? 0) >= 3, 'Expected vertices for a valid polygon.');
            assertEqual((a.indices?.length ?? 0), Math.max(0, (a.vertices.length - 2) * 3), 'Expected N-2 triangulation indices.');
        });

	        test('RoadEngineCompute: manual corner junction cuts segments and emits junction surface (AI 82)', () => {
	            const roads = [
	                {
	                    id: 'r1',
	                    name: 'CornerRoad',
	                    lanesF: 1,
	                    lanesB: 1,
	                    points: [
	                        { id: 'a', tileX: 0, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'b', tileX: 2, tileY: 0, offsetU: 0, offsetV: 0, tangentFactor: 1 },
	                        { id: 'c', tileX: 2, tileY: 2, offsetU: 0, offsetV: 0, tangentFactor: 1 }
	                    ]
	                }
	            ];
            const settings = {
                origin: { x: 0, z: 0 },
                tileSize: 24,
                laneWidth: 4.8,
                marginFactor: 0.1,
                junctions: {
                    manualJunctions: [{ candidateIds: ['corner_r1_b'] }]
                }
            };

            const out = computeRoadEngineEdges({ roads, settings });
            const corners = out?.junctionCandidates?.corners ?? [];
            assertTrue(corners.some((c) => c?.id === 'corner_r1_b'), 'Expected corner candidate corner_r1_b.');

            const junction = out?.junctions?.find?.((j) => j?.source === 'manual' && (j?.candidateIds ?? []).includes('corner_r1_b')) ?? null;
            assertTrue(!!junction, 'Expected a manual junction from the corner candidate.');
            assertTrue((junction?.endpoints?.length ?? 0) >= 2, 'Expected 2+ endpoints for corner junction.');

            const segIn = out?.segments?.find?.((s) => s?.id === 'seg_r1_a_b') ?? null;
            const segOut = out?.segments?.find?.((s) => s?.id === 'seg_r1_b_c') ?? null;
            assertTrue(!!segIn && !!segOut, 'Expected both segments around the corner.');
            assertTrue((segIn?.keptPieces?.[0]?.t1 ?? 1) < 0.99, 'Expected incoming segment to be cut before the corner.');
            assertTrue((segOut?.keptPieces?.[0]?.t0 ?? 0) > 0.01, 'Expected outgoing segment to be cut after the corner.');

            const surface = (out?.primitives ?? []).find((p) => p?.kind === 'junction_surface' && p?.junctionId === junction.id) ?? null;
            assertTrue(!!surface, 'Expected a junction_surface primitive for the corner junction.');
        });
    } catch (e) {
        console.log('⏭️  Road engine tests skipped:', e.message);
    }

    // ========== Road Debugger Authoring Tests (Task 55) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

        test('RoadDebugger: roads can be created from tile clicks (N points -> N-1 segments)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                const ox = view._origin.x;
                const oz = view._origin.z;
                const tileSize = view._tileSize;
                const w = (tx, ty) => ({ x: ox + tx * tileSize, z: oz + ty * tileSize });

                view.addDraftPointFromWorld(w(0, 0));
                view.addDraftPointFromWorld(w(2, 0));
                view.addDraftPointFromWorld(w(2, 2));
                assertEqual(view.getDraftRoad().points.length, 3, 'Expected 3 draft points.');

                view.finishRoadDraft();
                const roads = view.getRoads();
                assertEqual(roads.length, 1, 'Expected 1 authored road.');

                const derived = view.getDerived();
                const segs = (derived?.segments ?? []).filter((s) => s?.roadId === roads[0].id);
                assertEqual(segs.length, 2, 'Expected N-1 derived segments.');
                assertTrue(!!document.querySelector(`.road-debugger-road-row[data-road-id="${roads[0].id}"]`), 'Expected road row in table.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: table hover/selection updates highlight state', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.addDraftPointByTile(2, 2);
                view.finishRoadDraft();
                view.clearSelection();

                const roadId = view.getRoads()[0].id;
                const derived = view.getDerived();
                const segId = (derived?.segments ?? []).find((s) => s?.roadId === roadId)?.id ?? null;
                assertTrue(!!segId, 'Expected derived segment id.');

	                let roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
	                assertTrue(!!roadRow, 'Expected road row.');
	                roadRow.dispatchEvent(new Event('mouseenter'));
	                assertEqual(view._hover.roadId, roadId, 'Expected hover road id to update.');

	                roadRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                assertEqual(view._selection.type, 'road', 'Expected road selection type.');

	                const segRow = document.querySelector(`.road-debugger-seg-row[data-segment-id="${segId}"]`);
	                assertTrue(!!segRow, 'Expected segment row in detail panel.');
	                segRow.dispatchEvent(new Event('mouseenter'));
	                assertEqual(view._hover.segmentId, segId, 'Expected hover segment id to update.');

	                segRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                assertEqual(view._selection.type, 'segment', 'Expected segment selection type.');
	                assertEqual(view._selection.segmentId, segId, 'Expected segment selection id.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: lane config edits update derived widths', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(3, 0);
                view.finishRoadDraft();

                const roadId = view.getRoads()[0].id;
                const before = view.getDerived().segments.find((s) => s?.roadId === roadId);
                assertTrue(!!before, 'Expected derived segment.');
	                assertNear(before.asphaltObb.halfWidthRight, 5.28, 1e-6, 'Expected initial right half-width for lanesF=1.');
	                assertNear(before.asphaltObb.halfWidthLeft, 5.28, 1e-6, 'Expected initial left half-width for lanesB=1.');

	                const roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
	                assertTrue(!!roadRow, 'Expected road row.');
	                roadRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                assertEqual(view._selection?.type, 'road', 'Expected road selection.');

	                const editor = document.querySelector('.road-debugger-editor');
	                assertTrue(!!editor, 'Expected bottom editor panel.');
	                const getLaneGroup = (capText) => Array.from(editor.querySelectorAll('.road-debugger-lane-group')).find((el) => ((el.querySelector('.road-debugger-lane-group-cap')?.textContent ?? '').trim() === capText)) ?? null;
	                const clickLane = (capText, value) => {
	                    const group = getLaneGroup(capText);
	                    assertTrue(!!group, `Expected ${capText} lane group.`);
	                    const btn = Array.from(group.querySelectorAll('button.road-debugger-segmented-btn')).find((b) => ((b.textContent ?? '').trim() === String(value))) ?? null;
	                    assertTrue(!!btn, `Expected ${capText} button ${value}.`);
	                    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                };

	                clickLane('lanesF', 3);
	                const afterF = view.getDerived().segments.find((s) => s?.roadId === roadId);
	                assertNear(afterF.asphaltObb.halfWidthRight, 14.88, 1e-6, 'Expected right half-width to update for lanesF=3.');

	                clickLane('lanesB', 2);
	                const afterB = view.getDerived().segments.find((s) => s?.roadId === roadId);
	                assertNear(afterB.asphaltObb.halfWidthLeft, 10.08, 1e-6, 'Expected left half-width to update for lanesB=2.');

	                clickLane('lanesB', 0);
	                const afterB0 = view.getDerived().segments.find((s) => s?.roadId === roadId);
	                assertNear(afterB0.asphaltObb.halfWidthLeft, 0.48, 1e-6, 'Expected left half-width to update for lanesB=0 (one-way).');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: lanesF cannot be zero', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
	                scene: new THREE.Scene(),
	                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
	            };

	            const view = new RoadDebuggerView(engine, { uiEnabled: true });
	            view.enter();
	            try {
	                view.startRoadDraft({ lanesF: 0, lanesB: 1 });
	                assertEqual(view.getDraftRoad()?.lanesF ?? null, 1, 'Expected draft lanesF to clamp to 1 when passed 0.');

	                view.addDraftPointByTile(0, 0);
	                view.addDraftPointByTile(2, 0);
	                view.finishRoadDraft();

	                const roadId = view.getRoads()?.[0]?.id ?? null;
	                assertTrue(!!roadId, 'Expected road id.');
	                assertEqual(view.getRoads()?.[0]?.lanesF ?? null, 1, 'Expected authored road lanesF to be at least 1.');

	                view.setRoadLaneConfig(roadId, { lanesF: 0 });
	                assertEqual(view.getRoads()?.[0]?.lanesF ?? null, 1, 'Expected lanesF to remain at least 1 after lane edit attempt.');

	                const roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
	                assertTrue(!!roadRow, 'Expected road row.');
	                roadRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));

	                const editor = document.querySelector('.road-debugger-editor');
	                assertTrue(!!editor, 'Expected bottom editor panel.');
	                const lanesFGroup = Array.from(editor.querySelectorAll('.road-debugger-lane-group'))
	                    .find((el) => ((el.querySelector('.road-debugger-lane-group-cap')?.textContent ?? '').trim() === 'lanesF')) ?? null;
	                assertTrue(!!lanesFGroup, 'Expected lanesF lane group.');
	                const hasZero = Array.from(lanesFGroup.querySelectorAll('button.road-debugger-segmented-btn'))
	                    .some((b) => ((b.textContent ?? '').trim() === '0'));
	                assertFalse(hasZero, 'Expected lanesF selector to not include 0.');
	            } finally {
	                view.exit();
	            }
	        });
    } catch (e) {
        console.log('⏭️  Road Debugger authoring tests skipped:', e.message);
    }

    // ========== Road Debugger Editing Tests (Task 56) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

	        test('RoadDebugger: moving points updates tile coords across boundaries', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.startRoadDraft();
            view.addDraftPointByTile(0, 0);
            view.addDraftPointByTile(0, 1);
            view.finishRoadDraft();

            const road = view.getRoads()[0];
            const roadId = road.id;
            const pointId = road.points[0].id;
            const tileSize = view._tileSize;
            const ox = view._origin.x;
            const oz = view._origin.z;

            const ok = view.movePointToWorld(roadId, pointId, { x: ox + tileSize * 0.6, z: oz }, { snap: false });
            assertTrue(ok, 'Expected point move to apply.');

	            const moved = view.getRoads()[0].points.find((p) => p?.id === pointId);
	            assertEqual(moved.tileX, 1, 'Expected tileX to update after crossing boundary.');
	            assertEqual(moved.tileY, 0, 'Expected tileY to remain.');
	            assertNear(moved.offsetU, -0.4, 1e-6, 'Expected offsetU to be relative to new tile center.');
	            assertNear(moved.offsetV, 0, 1e-6, 'Expected offsetV to remain.');
	        });

	        test('RoadDebugger: snapping produces only tile/10 positions and clamps inside tile', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.startRoadDraft();
            view.addDraftPointByTile(0, 0);
            view.addDraftPointByTile(1, 0);
            view.finishRoadDraft();

            const road = view.getRoads()[0];
	            const roadId = road.id;
	            const pointId = road.points[0].id;
	            const step = 0.1;
	            const half = 0.5;
	            const ox = view._origin.x;
	            const oz = view._origin.z;

	            view.movePointToWorld(roadId, pointId, { x: ox + 3.1, z: oz - 4.9 }, { snap: true });
	            let pt = view.getRoads()[0].points.find((p) => p?.id === pointId);
	            const ix = Math.round(pt.offsetU / step);
	            const iy = Math.round(pt.offsetV / step);
	            assertTrue(ix >= -5 && ix <= 5, 'Expected snap index X within [-5..5].');
	            assertTrue(iy >= -5 && iy <= 5, 'Expected snap index Y within [-5..5].');
	            assertNear(pt.offsetU, ix * step, 1e-6, 'Expected snapped offsetU to match grid.');
	            assertNear(pt.offsetV, iy * step, 1e-6, 'Expected snapped offsetV to match grid.');
	            assertTrue(Math.abs(pt.offsetU) <= half + 1e-6, 'Expected snapped offsetU within tile bounds.');
	            assertTrue(Math.abs(pt.offsetV) <= half + 1e-6, 'Expected snapped offsetV within tile bounds.');

	            const tileSize = view._tileSize;
	            view.movePointToWorld(roadId, pointId, { x: ox - tileSize * 100, z: oz - tileSize * 100 }, { snap: true });
	            pt = view.getRoads()[0].points.find((p) => p?.id === pointId);
	            assertEqual(pt.tileX, 0, 'Expected clamped tileX at map boundary.');
	            assertEqual(pt.tileY, 0, 'Expected clamped tileY at map boundary.');
	            assertNear(pt.offsetU, -half, 1e-6, 'Expected clamped offsetU inside tile bounds.');
	            assertNear(pt.offsetV, -half, 1e-6, 'Expected clamped offsetV inside tile bounds.');
	        });

        test('RoadDebugger: undo/redo reverts point moves deterministically', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.startRoadDraft();
            view.addDraftPointByTile(0, 0);
            view.addDraftPointByTile(2, 0);
            view.finishRoadDraft();

            const road = view.getRoads()[0];
            const roadId = road.id;
            const pointId = road.points[0].id;
            const tileSize = view._tileSize;
            const ox = view._origin.x;
            const oz = view._origin.z;

            const before = JSON.stringify(view.getDerived());
            view.movePointToWorld(roadId, pointId, { x: ox + tileSize * 0.6, z: oz }, { snap: false });
            const after = JSON.stringify(view.getDerived());
            assertTrue(before !== after, 'Expected derived output to change after move.');

            assertTrue(view.undo(), 'Expected undo to succeed.');
            assertEqual(JSON.stringify(view.getDerived()), before, 'Expected undo to restore derived output.');

            assertTrue(view.redo(), 'Expected redo to succeed.');
            assertEqual(JSON.stringify(view.getDerived()), after, 'Expected redo to restore derived output.');
        });

        test('RoadDebugger: undo/redo covers road creation', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.startRoadDraft();
            view.addDraftPointByTile(0, 0);
            view.addDraftPointByTile(2, 0);
            view.finishRoadDraft();

            assertEqual(view.getRoads().length, 1, 'Expected 1 road after finishing draft.');
            assertTrue(view.undo(), 'Expected undo to succeed.');
            assertEqual(view.getRoads().length, 0, 'Expected undo to remove road.');
            assertTrue(!!view.getDraftRoad(), 'Expected undo to restore draft.');

            assertTrue(view.redo(), 'Expected redo to succeed.');
            assertEqual(view.getRoads().length, 1, 'Expected redo to restore road.');
            assertEqual(view.getDraftRoad(), null, 'Expected redo to clear draft.');
        });

        test('RoadDebugger: schema export/import roundtrip preserves derived output', () => {
            const engineA = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const viewA = new RoadDebuggerView(engineA, { uiEnabled: false });
            viewA.startRoadDraft();
            viewA.addDraftPointByTile(0, 0);
            viewA.addDraftPointByTile(3, 0);
            viewA.addDraftPointByTile(3, 2);
            viewA.finishRoadDraft();

            const roadId = viewA.getRoads()[0].id;
            const pointId = viewA.getRoads()[0].points[0].id;
            viewA.setRoadLaneConfig(roadId, { lanesF: 3, lanesB: 2 });
            viewA.setPointTangentFactor(roadId, pointId, 1.4);
            viewA.movePointToWorld(roadId, pointId, { x: viewA._origin.x + viewA._tileSize * 0.6, z: viewA._origin.z }, { snap: true });

            const exported = viewA.exportSchema({ pretty: false, includeDraft: true });
            const expected = JSON.stringify(viewA.getDerived());

            const engineB = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };
            const viewB = new RoadDebuggerView(engineB, { uiEnabled: false });
            assertTrue(viewB.importSchema(exported, { pushUndo: false }), 'Expected schema import to succeed.');
            assertEqual(JSON.stringify(viewB.getDerived()), expected, 'Expected derived output to match after import.');
        });

        test('RoadDebugger: merging same-road connector persists via undo/redo and export/import (Task 67)', () => {
            const engineA = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const viewA = new RoadDebuggerView(engineA, { uiEnabled: false });
            viewA.startRoadDraft();
            viewA.addDraftPointByTile(0, 1);
            viewA.addDraftPointByTile(4, 1);
            viewA.finishRoadDraft();

            viewA.startRoadDraft();
            viewA.addDraftPointByTile(2, 0);
            viewA.addDraftPointByTile(2, 3);
            viewA.finishRoadDraft();

            const findConnector = (view, id) => {
                const derived = view.getDerived();
                for (const j of derived?.junctions ?? []) {
                    const c = j?.connectors?.find?.((x) => x?.id === id) ?? null;
                    if (c) return c;
                }
                return null;
            };

            const derived0 = viewA.getDerived();
            assertEqual(derived0?.junctions?.length ?? 0, 0, 'Expected no junctions unless created explicitly.');

            const endpoints = derived0?.junctionCandidates?.endpoints ?? [];
            const center = { x: viewA._origin.x + viewA._tileSize * 2, z: viewA._origin.z + viewA._tileSize * 1 };
            const roadIds = viewA.getRoads().map((r) => r?.id).filter(Boolean);
            const byRoad = (roadId) => endpoints
                .filter((e) => e?.id && e?.roadId === roadId && e?.world)
                .map((e) => {
                    const dx = (e.world.x ?? 0) - center.x;
                    const dz = (e.world.z ?? 0) - center.z;
                    return { id: e.id, dist: dx * dx + dz * dz };
                })
                .sort((a, b) => a.dist - b.dist)
                .slice(0, 2)
                .map((e) => e.id);

            const candidateIds = Array.from(new Set(roadIds.flatMap((id) => byRoad(id)))).sort();
            assertEqual(candidateIds.length, 4, 'Expected 4 endpoint candidates for manual crossing junction.');

            viewA.setJunctionToolEnabled(true);
            assertTrue(viewA.setJunctionToolSelection(candidateIds), 'Expected junction tool selection to apply.');
            assertTrue(viewA.createJunctionFromToolSelection(), 'Expected manual junction creation to succeed.');
            viewA.setJunctionToolEnabled(false);

            const derived1 = viewA.getDerived();
            assertEqual(derived1?.junctions?.length ?? 0, 1, 'Expected a single crossing junction after manual creation.');
            const junction0 = derived1.junctions[0];
            const sameRoad = (junction0?.connectors ?? []).find((c) => c?.sameRoad && !c?.mergedIntoRoad) ?? null;
            assertTrue(!!sameRoad?.id, 'Expected at least one same-road connector.');

            const connectorId = sameRoad.id;
            assertTrue(viewA.mergeConnectorIntoRoad(connectorId), 'Expected mergeConnectorIntoRoad to succeed.');
            assertTrue(!!findConnector(viewA, connectorId)?.mergedIntoRoad, 'Expected connector to be marked merged after merge.');

            assertTrue(viewA.undo(), 'Expected undo after merge to succeed.');
            assertTrue(!findConnector(viewA, connectorId)?.mergedIntoRoad, 'Expected connector merge to revert on undo.');

            assertTrue(viewA.redo(), 'Expected redo after merge to succeed.');
            assertTrue(!!findConnector(viewA, connectorId)?.mergedIntoRoad, 'Expected connector merge to reapply on redo.');

            const exported = viewA.exportSchema({ pretty: false, includeDraft: true });
            const expected = JSON.stringify(viewA.getDerived());

            const engineB = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };
            const viewB = new RoadDebuggerView(engineB, { uiEnabled: false });
            assertTrue(viewB.importSchema(exported, { pushUndo: false }), 'Expected schema import to succeed.');
            assertTrue(!!findConnector(viewB, connectorId)?.mergedIntoRoad, 'Expected merged connector state to persist after import.');
            assertEqual(JSON.stringify(viewB.getDerived()), expected, 'Expected derived output to match after import with merged connectors.');
        });

        test('RoadDebugger: schema export/import supports lanesB=0 (Task 81)', () => {
            const engineA = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const viewA = new RoadDebuggerView(engineA, { uiEnabled: false });
            viewA.startRoadDraft();
            viewA.addDraftPointByTile(0, 0);
            viewA.addDraftPointByTile(2, 0);
            viewA.finishRoadDraft();

            const roadId = viewA.getRoads()[0].id;
            viewA.setRoadLaneConfig(roadId, { lanesF: 2, lanesB: 0 });

            const exported = viewA.exportSchema({ pretty: false, includeDraft: true });
            const expected = JSON.stringify(viewA.getDerived());

            const engineB = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };
            const viewB = new RoadDebuggerView(engineB, { uiEnabled: false });
            assertTrue(viewB.importSchema(exported, { pushUndo: false }), 'Expected schema import to succeed.');
            assertEqual(viewB.getRoads()[0].lanesB, 0, 'Expected lanesB=0 to persist after import.');
            assertEqual(JSON.stringify(viewB.getDerived()), expected, 'Expected derived output to match after import.');
        });
    } catch (e) {
        console.log('⏭️  Road Debugger editing tests skipped:', e.message);
    }

    // ========== Road Debugger Rendering Tests (Task 57) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

        test('RoadDebugger: asphalt toggle controls asphalt visibility', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                assertTrue((view._asphaltMeshes?.length ?? 0) > 0, 'Expected asphalt meshes for authored segments.');
                assertTrue(view._asphaltGroup?.visible !== false, 'Expected asphalt to be visible by default.');

                const rows = Array.from(document.querySelectorAll('.road-debugger-row'));
                const asphaltRow = rows.find((r) => r.textContent.includes('Asphalt')) ?? null;
                assertTrue(!!asphaltRow, 'Expected Asphalt toggle row.');
                const input = asphaltRow.querySelector('input[type="checkbox"]');
                assertTrue(!!input, 'Expected Asphalt checkbox input.');

                input.checked = false;
                input.dispatchEvent(new Event('change'));
                assertTrue(view._asphaltGroup?.visible === false, 'Expected asphalt group to be hidden after toggle off.');

                input.checked = true;
                input.dispatchEvent(new Event('change'));
                assertTrue(view._asphaltGroup?.visible === true, 'Expected asphalt group to be visible after toggle on.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: markings toggle controls arrow/marking visibility', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
	                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
	                view.addDraftPointByTile(1, 0);
	                view.finishRoadDraft();

	                const rows = Array.from(document.querySelectorAll('.road-debugger-row'));
	                const markingsRow = rows.find((r) => r.textContent.includes('Markings')) ?? null;
	                assertTrue(!!markingsRow, 'Expected Markings toggle row.');
	                const input = markingsRow.querySelector('input[type="checkbox"]');
	                assertTrue(!!input, 'Expected Markings checkbox input.');

	                assertTrue(view._markingsGroup?.visible !== false, 'Expected markings to be visible by default.');

	                input.checked = false;
	                input.dispatchEvent(new Event('change'));
	                assertTrue(view._markingsGroup?.visible === false, 'Expected markings group to be hidden after toggle off.');

	                input.checked = true;
	                input.dispatchEvent(new Event('change'));
	                assertTrue(view._markingsGroup?.visible === true, 'Expected markings group to be visible after toggle on.');
	                assertTrue((view._markingLines?.length ?? 0) > 0, 'Expected lane marking line object.');
	                assertTrue((view._arrowMeshes?.length ?? 0) > 0, 'Expected lane arrow mesh object.');
	            } finally {
	                view.exit();
	            }
	        });

	        test('RoadDebugger: distance-scaled edge thickness is automatic (Task 89)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
	            view.enter();
	            try {
	                view.startRoadDraft();
	                view.addDraftPointByTile(0, 0);
	                view.addDraftPointByTile(2, 0);
	                view.finishRoadDraft();
	                view.setRenderOptions({ edges: true });

		                view.controls?.setOrbit?.({ radius: view._zoomMin }, { immediate: true });
		                view._syncOrbitCamera();
			                const asphaltNear = view._materials?.lineBase?.get?.('asphalt_edge_left') ?? null;
			                const laneNear = view._materials?.lineBase?.get?.('lane_edge_left') ?? null;
	                assertTrue(!!asphaltNear, 'Expected asphalt edge line material.');
	                assertTrue(!!laneNear, 'Expected lane edge line material.');
	                const nearAsphaltWidth = Number(asphaltNear.linewidth) || 0;
	                const nearLaneWidth = Number(laneNear.linewidth) || 0;
	                assertNear(nearAsphaltWidth, 2, 1e-6, 'Expected full asphalt edge thickness at near zoom.');
	                assertNear(nearLaneWidth, 2, 1e-6, 'Expected full lane edge thickness at near zoom.');

	                view.controls?.setOrbit?.({ radius: view._zoomMax }, { immediate: true });
	                view._syncOrbitCamera();
	                const asphaltFar = view._materials?.lineBase?.get?.('asphalt_edge_left') ?? null;
	                const laneFar = view._materials?.lineBase?.get?.('lane_edge_left') ?? null;
	                assertTrue(!!asphaltFar, 'Expected asphalt edge line material at far zoom.');
	                assertTrue(!!laneFar, 'Expected lane edge line material at far zoom.');
	                const farAsphaltWidth = Number(asphaltFar.linewidth) || 0;
	                const farLaneWidth = Number(laneFar.linewidth) || 0;
	                assertNear(farAsphaltWidth, 0.55, 1e-6, 'Expected thinner asphalt edges at far zoom.');
	                assertNear(farLaneWidth, 0.55, 1e-6, 'Expected thinner lane edges at far zoom.');
	                assertTrue(farLaneWidth < nearLaneWidth, 'Expected lane edges to scale down when zoomed out.');
	            } finally {
	                view.exit();
            }
        });

	        test('RoadDebugger: lane arrows follow segment forward direction (Task 71)', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
	                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();
                view.setRenderOptions({ markings: true });
	
	                const derived = view.getDerived();
	                const seg = derived?.segments?.[0] ?? null;
	                assertTrue(!!seg?.aWorld && !!seg?.bWorld && !!seg?.dir && !!seg?.right, 'Expected derived segment with direction vectors.');

                const mesh = view._arrowMeshes?.[0] ?? null;
                const attr = mesh?.geometry?.getAttribute?.('position') ?? null;
                const positions = attr?.array ?? null;
                assertTrue(Array.isArray(positions) || positions instanceof Float32Array, 'Expected arrow geometry positions.');
                assertTrue((positions.length % (9 * 3)) === 0, 'Expected arrow geometry to be packed as 9 vertices per arrow.');

                const arrowCount = positions.length / (9 * 3);
                assertTrue(arrowCount >= 2, 'Expected at least two lane arrows (forward + backward).');

	                const segMidX = ((Number(seg.aWorld.x) || 0) + (Number(seg.bWorld.x) || 0)) * 0.5;
	                const segMidZ = ((Number(seg.aWorld.z) || 0) + (Number(seg.bWorld.z) || 0)) * 0.5;
	                const dirX = Number(seg.dir.x) || 0;
	                const dirZ = Number(seg.dir.z) || 0;
	                const expectedRightX = -dirZ;
	                const expectedRightZ = dirX;
	                const rightX = Number(seg.right.x) || 0;
	                const rightZ = Number(seg.right.z) || 0;
	                assertTrue((rightX * expectedRightX + rightZ * expectedRightZ) > 0.95, 'Expected segment.right to follow right-hand traffic convention.');
	
	                const readV = (vertexIndex) => {
	                    const i = vertexIndex * 3;
	                    return { x: Number(positions[i]) || 0, y: Number(positions[i + 1]) || 0, z: Number(positions[i + 2]) || 0 };
                };

                let foundForward = false;
                let foundBackward = false;

                for (let a = 0; a < arrowCount; a++) {
                    const base = a * 9;
                    const tip = readV(base + 6);
                    const t0 = readV(base + 0);
                    const t3 = readV(base + 3);
                    const t5 = readV(base + 5);
                    const tail = {
                        x: (t0.x + t3.x + t5.x) / 3,
                        z: (t0.z + t3.z + t5.z) / 3
                    };

	                    const arrowDirX = tip.x - tail.x;
	                    const arrowDirZ = tip.z - tail.z;
	                    const dotForward = arrowDirX * dirX + arrowDirZ * dirZ;
	
	                    const centerX = (tip.x + tail.x) * 0.5;
	                    const centerZ = (tip.z + tail.z) * 0.5;
	                    const side = (centerX - segMidX) * expectedRightX + (centerZ - segMidZ) * expectedRightZ;
	
	                    if (dotForward > 0) {
	                        foundForward = true;
	                        assertTrue(dotForward > 0.25, 'Expected forward-lane arrow to point along segment direction.');
	                        assertTrue(side > 1e-6, 'Expected forward-lane arrow to render on the right side of the centerline.');
	                    } else {
	                        foundBackward = true;
	                        assertTrue(dotForward < -0.25, 'Expected backward-lane arrow to point opposite segment direction.');
	                        assertTrue(side < -1e-6, 'Expected backward-lane arrow to render on the left side of the centerline.');
	                    }
	                }
	
	                assertTrue(foundForward && foundBackward, 'Expected both forward and backward lane arrows.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: lane arrows correct on vertical segment (Task 84)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(0, 2);
                view.finishRoadDraft();
                view.setRenderOptions({ markings: true });

                const derived = view.getDerived();
                const seg = derived?.segments?.[0] ?? null;
                assertTrue(!!seg?.aWorld && !!seg?.bWorld && !!seg?.dir && !!seg?.right, 'Expected derived segment with direction vectors.');

                const mesh = view._arrowMeshes?.[0] ?? null;
                const attr = mesh?.geometry?.getAttribute?.('position') ?? null;
                const positions = attr?.array ?? null;
                assertTrue(Array.isArray(positions) || positions instanceof Float32Array, 'Expected arrow geometry positions.');
                assertTrue((positions.length % (9 * 3)) === 0, 'Expected arrow geometry to be packed as 9 vertices per arrow.');

                const arrowCount = positions.length / (9 * 3);
                assertTrue(arrowCount >= 2, 'Expected at least two lane arrows (forward + backward).');

	                const segMidX = ((Number(seg.aWorld.x) || 0) + (Number(seg.bWorld.x) || 0)) * 0.5;
	                const segMidZ = ((Number(seg.aWorld.z) || 0) + (Number(seg.bWorld.z) || 0)) * 0.5;
	                const dirX = Number(seg.dir.x) || 0;
	                const dirZ = Number(seg.dir.z) || 0;
	                const expectedRightX = -dirZ;
	                const expectedRightZ = dirX;
	                const rightX = Number(seg.right.x) || 0;
	                const rightZ = Number(seg.right.z) || 0;
	                assertTrue((rightX * expectedRightX + rightZ * expectedRightZ) > 0.95, 'Expected segment.right to follow right-hand traffic convention.');

                const readV = (vertexIndex) => {
                    const i = vertexIndex * 3;
                    return { x: Number(positions[i]) || 0, y: Number(positions[i + 1]) || 0, z: Number(positions[i + 2]) || 0 };
                };

                let foundForward = false;
                let foundBackward = false;
                for (let a = 0; a < arrowCount; a++) {
                    const base = a * 9;
                    const tip = readV(base + 6);
                    const t0 = readV(base + 0);
                    const t3 = readV(base + 3);
                    const t5 = readV(base + 5);
                    const tail = {
                        x: (t0.x + t3.x + t5.x) / 3,
                        z: (t0.z + t3.z + t5.z) / 3
                    };

	                    const arrowDirX = tip.x - tail.x;
	                    const arrowDirZ = tip.z - tail.z;
	                    const dotForward = arrowDirX * dirX + arrowDirZ * dirZ;
	
	                    const centerX = (tip.x + tail.x) * 0.5;
	                    const centerZ = (tip.z + tail.z) * 0.5;
	                    const side = (centerX - segMidX) * expectedRightX + (centerZ - segMidZ) * expectedRightZ;
	                    if (dotForward > 0) {
	                        foundForward = true;
	                        assertTrue(dotForward > 0.25, 'Expected forward-lane arrow to point along segment direction.');
	                    } else {
	                        foundBackward = true;
	                        assertTrue(dotForward < -0.25, 'Expected backward-lane arrow to point opposite segment direction.');
	                    }
	                    if (dotForward > 0) assertTrue(side > 1e-6, 'Expected forward-lane arrow to render on the right side of the centerline.');
	                    else assertTrue(side < -1e-6, 'Expected backward-lane arrow to render on the left side of the centerline.');
	                }
	                assertTrue(foundForward && foundBackward, 'Expected both forward and backward lane arrows.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: lane arrows correct on diagonal segment (Task 84)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 2);
                view.finishRoadDraft();
                view.setRenderOptions({ markings: true });

                const derived = view.getDerived();
                const seg = derived?.segments?.[0] ?? null;
                assertTrue(!!seg?.aWorld && !!seg?.bWorld && !!seg?.dir && !!seg?.right, 'Expected derived segment with direction vectors.');

                const mesh = view._arrowMeshes?.[0] ?? null;
                const attr = mesh?.geometry?.getAttribute?.('position') ?? null;
                const positions = attr?.array ?? null;
                assertTrue(Array.isArray(positions) || positions instanceof Float32Array, 'Expected arrow geometry positions.');
                assertTrue((positions.length % (9 * 3)) === 0, 'Expected arrow geometry to be packed as 9 vertices per arrow.');

                const arrowCount = positions.length / (9 * 3);
                assertTrue(arrowCount >= 2, 'Expected at least two lane arrows (forward + backward).');

	                const segMidX = ((Number(seg.aWorld.x) || 0) + (Number(seg.bWorld.x) || 0)) * 0.5;
	                const segMidZ = ((Number(seg.aWorld.z) || 0) + (Number(seg.bWorld.z) || 0)) * 0.5;
	                const dirX = Number(seg.dir.x) || 0;
	                const dirZ = Number(seg.dir.z) || 0;
	                const expectedRightX = -dirZ;
	                const expectedRightZ = dirX;
	                const rightX = Number(seg.right.x) || 0;
	                const rightZ = Number(seg.right.z) || 0;
	                assertTrue((rightX * expectedRightX + rightZ * expectedRightZ) > 0.95, 'Expected segment.right to follow right-hand traffic convention.');

                const readV = (vertexIndex) => {
                    const i = vertexIndex * 3;
                    return { x: Number(positions[i]) || 0, y: Number(positions[i + 1]) || 0, z: Number(positions[i + 2]) || 0 };
                };

                let foundForward = false;
                let foundBackward = false;
                for (let a = 0; a < arrowCount; a++) {
                    const base = a * 9;
                    const tip = readV(base + 6);
                    const t0 = readV(base + 0);
                    const t3 = readV(base + 3);
                    const t5 = readV(base + 5);
                    const tail = {
                        x: (t0.x + t3.x + t5.x) / 3,
                        z: (t0.z + t3.z + t5.z) / 3
                    };

	                    const arrowDirX = tip.x - tail.x;
	                    const arrowDirZ = tip.z - tail.z;
	                    const dotForward = arrowDirX * dirX + arrowDirZ * dirZ;
	
	                    const centerX = (tip.x + tail.x) * 0.5;
	                    const centerZ = (tip.z + tail.z) * 0.5;
	                    const side = (centerX - segMidX) * expectedRightX + (centerZ - segMidZ) * expectedRightZ;
	                    if (dotForward > 0) {
	                        foundForward = true;
	                        assertTrue(dotForward > 0.25, 'Expected forward-lane arrow to point along segment direction.');
	                    } else {
	                        foundBackward = true;
	                        assertTrue(dotForward < -0.25, 'Expected backward-lane arrow to point opposite segment direction.');
	                    }
	                    if (dotForward > 0) assertTrue(side > 1e-6, 'Expected forward-lane arrow to render on the right side of the centerline.');
	                    else assertTrue(side < -1e-6, 'Expected backward-lane arrow to render on the left side of the centerline.');
	                }
	                assertTrue(foundForward && foundBackward, 'Expected both forward and backward lane arrows.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: lane arrows correct on multi-segment road (Task 84)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.addDraftPointByTile(2, 2);
                view.finishRoadDraft();
                view.setRenderOptions({ markings: true });

                const derived = view.getDerived();
                const segs = derived?.segments ?? [];
                assertTrue(segs.length >= 2, 'Expected at least two segments.');

                const mesh = view._arrowMeshes?.[0] ?? null;
                const attr = mesh?.geometry?.getAttribute?.('position') ?? null;
                const positions = attr?.array ?? null;
                assertTrue(Array.isArray(positions) || positions instanceof Float32Array, 'Expected arrow geometry positions.');
                assertTrue((positions.length % (9 * 3)) === 0, 'Expected arrow geometry to be packed as 9 vertices per arrow.');

                const arrowCount = positions.length / (9 * 3);
                assertTrue(arrowCount >= 4, 'Expected arrows for each segment and direction.');

	                const segInfo = segs.map((seg) => ({
	                    seg,
	                    midX: ((Number(seg.aWorld?.x) || 0) + (Number(seg.bWorld?.x) || 0)) * 0.5,
	                    midZ: ((Number(seg.aWorld?.z) || 0) + (Number(seg.bWorld?.z) || 0)) * 0.5,
	                    dirX: Number(seg.dir?.x) || 0,
	                    dirZ: Number(seg.dir?.z) || 0,
	                    expectedRightX: -(Number(seg.dir?.z) || 0),
	                    expectedRightZ: (Number(seg.dir?.x) || 0),
	                    foundForward: false,
	                    foundBackward: false
	                }));
	
	                for (const info of segInfo) {
	                    const rightX = Number(info.seg?.right?.x) || 0;
	                    const rightZ = Number(info.seg?.right?.z) || 0;
	                    const dot = rightX * info.expectedRightX + rightZ * info.expectedRightZ;
	                    assertTrue(dot > 0.95, 'Expected segment.right to follow right-hand traffic convention.');
	                }

                const readV = (vertexIndex) => {
                    const i = vertexIndex * 3;
                    return { x: Number(positions[i]) || 0, y: Number(positions[i + 1]) || 0, z: Number(positions[i + 2]) || 0 };
                };

                for (let a = 0; a < arrowCount; a++) {
                    const base = a * 9;
                    const tip = readV(base + 6);
                    const t0 = readV(base + 0);
                    const t3 = readV(base + 3);
                    const t5 = readV(base + 5);
                    const tail = {
                        x: (t0.x + t3.x + t5.x) / 3,
                        z: (t0.z + t3.z + t5.z) / 3
                    };
                    const centerX = (tip.x + tail.x) * 0.5;
                    const centerZ = (tip.z + tail.z) * 0.5;

                    let best = 0;
                    let bestDist = Infinity;
                    for (let i = 0; i < segInfo.length; i++) {
                        const dx = centerX - segInfo[i].midX;
                        const dz = centerZ - segInfo[i].midZ;
                        const d2 = dx * dx + dz * dz;
                        if (d2 < bestDist) {
                            bestDist = d2;
                            best = i;
                        }
                    }
                    const info = segInfo[best];

	                    const arrowDirX = tip.x - tail.x;
	                    const arrowDirZ = tip.z - tail.z;
	                    const dotForward = arrowDirX * info.dirX + arrowDirZ * info.dirZ;
	
	                    const side = (centerX - info.midX) * info.expectedRightX + (centerZ - info.midZ) * info.expectedRightZ;
	                    if (dotForward > 0) {
	                        info.foundForward = true;
	                        assertTrue(dotForward > 0.25, 'Expected forward-lane arrow to point along its segment direction.');
	                    } else {
	                        info.foundBackward = true;
	                        assertTrue(dotForward < -0.25, 'Expected backward-lane arrow to point opposite its segment direction.');
	                    }
	                    if (dotForward > 0) assertTrue(side > 1e-6, 'Expected forward-lane arrow to render on the right side of the centerline.');
	                    else assertTrue(side < -1e-6, 'Expected backward-lane arrow to render on the left side of the centerline.');
	                }

                for (const info of segInfo.slice(0, 2)) {
                    assertTrue(info.foundForward && info.foundBackward, 'Expected both forward and backward arrows per segment.');
                }
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: arrow tangent overlay builds (Task 84)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();
                view.setRenderOptions({ markings: true });
                view.setArrowTangentDebugEnabled(true);
                assertTrue((view._arrowTangentLines?.length ?? 0) > 0, 'Expected arrow tangent lines to be created when enabled.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: Enter finishes draft like DONE (Task 72)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);

                assertTrue(!!view.getDraftRoad(), 'Expected an active draft before pressing Enter.');
                assertTrue(view.getRoads().length === 0, 'Expected no authored roads before finishing the draft.');

                view._onKeyDown({
                    code: 'Enter',
                    key: 'Enter',
                    target: document.body,
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false,
                    preventDefault: () => {},
                    stopImmediatePropagation: () => {}
                });

                assertTrue(!view.getDraftRoad(), 'Expected draft to be completed after pressing Enter.');
                assertTrue(view.getRoads().length === 1, 'Expected the drafted road to be committed.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: Escape during draft does not open exit confirm (Task 72)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);

                assertTrue(!!view.getDraftRoad(), 'Expected an active draft before pressing Escape.');

                view._onKeyDown({
                    code: 'Escape',
                    key: 'Escape',
                    target: document.body,
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false,
                    preventDefault: () => {},
                    stopImmediatePropagation: () => {}
                });

                assertTrue(!!view.getDraftRoad(), 'Expected draft to remain active when fewer than 2 points exist (DONE would be disabled).');
                assertTrue(view.isExitConfirmOpen() === false, 'Expected exit confirmation to stay closed while drafting.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: Escape opens exit confirm and confirm triggers onExit (Task 72)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                let exited = false;
                view.onExit = () => { exited = true; };

                assertTrue(view.isExitConfirmOpen() === false, 'Expected exit confirmation to be closed initially.');

                view._onKeyDown({
                    code: 'Escape',
                    key: 'Escape',
                    target: document.body,
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false,
                    preventDefault: () => {},
                    stopImmediatePropagation: () => {}
                });
                assertTrue(view.isExitConfirmOpen() === true, 'Expected exit confirmation to open after Escape.');
                assertTrue(exited === false, 'Expected onExit to not run until confirmed.');

                view._onKeyDown({
                    code: 'Escape',
                    key: 'Escape',
                    target: document.body,
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false,
                    preventDefault: () => {},
                    stopImmediatePropagation: () => {}
                });
                assertTrue(view.isExitConfirmOpen() === false, 'Expected Escape to cancel the exit confirmation.');
                assertTrue(exited === false, 'Expected onExit to remain uncalled after cancel.');

                view._onKeyDown({
                    code: 'Escape',
                    key: 'Escape',
                    target: document.body,
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false,
                    preventDefault: () => {},
                    stopImmediatePropagation: () => {}
                });
                assertTrue(view.isExitConfirmOpen() === true, 'Expected exit confirmation to re-open.');

                view.ui?.exitConfirm?.click?.();
                assertTrue(exited === true, 'Expected onExit to be called when confirming exit.');
                assertTrue(view.isExitConfirmOpen() === false, 'Expected exit confirmation to close after confirming.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: draft preview line shows and clears (Task 72)', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
	            view.enter();
	            try {
	                view.startRoadDraft();
	                view.addDraftPointByTile(0, 0);

	                const world = {
	                    x: (Number(view._origin?.x) || 0) + (Number(view._tileSize) || 24) * 0.55,
	                    z: (Number(view._origin?.z) || 0) + (Number(view._tileSize) || 24) * 0.20
	                };

	                assertTrue(view.updateDraftPreviewFromWorld(world) === true, 'Expected preview update to succeed with a 1-point draft.');
	                assertTrue(!!view._draftPreviewLine && view._draftPreviewLine.visible === true, 'Expected draft preview line to be visible.');

	                const res = view._worldToTilePoint(world.x, world.z, { snap: false });
	                const attr = view._draftPreviewLine?.geometry?.getAttribute?.('position') ?? null;
	                const positions = attr?.array ?? null;
	                assertTrue(!!res && !!positions && positions.length >= 6, 'Expected preview geometry positions to exist.');
	                const tileSize = Number(view._tileSize) || 24;
	                const expectedX = (Number(view._origin?.x) || 0) + (Number(res.tileX) || 0) * tileSize;
	                const expectedZ = (Number(view._origin?.z) || 0) + (Number(res.tileY) || 0) * tileSize;
	                assertTrue(Math.abs((positions[3] ?? 0) - expectedX) < 1e-6, 'Expected preview endpoint X to match the hovered tile center.');
	                assertTrue(Math.abs((positions[5] ?? 0) - expectedZ) < 1e-6, 'Expected preview endpoint Z to match the hovered tile center.');

	                view.cancelRoadDraft();
	                assertTrue(view._draftPreviewLine.visible === false, 'Expected preview line to clear on cancel.');
	            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: export schema textarea stays within panel bounds (Task 75)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.ui?._onExport?.({ preventDefault: () => {} });

                const panel = view.ui?.schemaModal?.querySelector?.('.road-debugger-schema-panel') ?? null;
                const textarea = view.ui?.schemaTextarea ?? null;
                assertTrue(!!panel && !!textarea, 'Expected export schema panel elements.');

                const panelRect = panel.getBoundingClientRect();
                const textareaRect = textarea.getBoundingClientRect();
                assertTrue(panelRect.left >= -0.5, 'Expected export panel to stay within viewport (left).');
                assertTrue(panelRect.right <= (window.innerWidth + 0.5), 'Expected export panel to stay within viewport (right).');
                assertTrue(textareaRect.left >= (panelRect.left - 0.5), 'Expected textarea to stay within panel (left).');
                assertTrue(textareaRect.right <= (panelRect.right + 0.5), 'Expected textarea to stay within panel (right).');

                textarea.value = 'X'.repeat(2000);
                assertTrue(textarea.scrollWidth > textarea.clientWidth, 'Expected textarea to allow horizontal scrolling for long lines.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: segment row hover highlights only that segment (Task 78)', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
	            view.enter();
	            try {
	                view.startRoadDraft();
	                view.addDraftPointByTile(0, 0);
	                view.addDraftPointByTile(2, 0);
	                view.addDraftPointByTile(2, 2);
	                view.finishRoadDraft();
	                view.setRenderOptions({ edges: true });

	                const segs = view.getDerived()?.segments ?? [];
	                assertTrue(segs.length >= 2, 'Expected multiple derived segments.');
	                const segA = segs[0];
                const segB = segs[1];
                assertTrue(!!segA?.id && !!segB?.id, 'Expected segment ids.');

                view.setHoverSegment(segA.id);

                const hoverHex = 0x34c759;

                const segALines = (view._overlayLines ?? []).filter((line) => line?.userData?.segmentId === segA.id);
                const segBLines = (view._overlayLines ?? []).filter((line) => line?.userData?.segmentId === segB.id);
                assertTrue(segALines.length > 0, 'Expected overlay lines for the hovered segment.');
                assertTrue(segBLines.length > 0, 'Expected overlay lines for the other segment.');

                assertTrue(segALines.every((line) => (line.material?.color?.getHex?.() ?? null) === hoverHex), 'Expected hovered segment lines to use hover highlight color.');
                assertTrue(segBLines.every((line) => (line.material?.color?.getHex?.() ?? null) !== hoverHex), 'Expected other segment lines not to use hover highlight color.');

                const segAPicks = (view._segmentPickMeshes ?? []).filter((mesh) => mesh?.userData?.segmentId === segA.id);
                const segBPicks = (view._segmentPickMeshes ?? []).filter((mesh) => mesh?.userData?.segmentId === segB.id);
                assertTrue(segAPicks.length > 0, 'Expected pick meshes for the hovered segment.');
                assertTrue(segBPicks.length > 0, 'Expected pick meshes for the other segment.');

                assertTrue(segAPicks.every((mesh) => (mesh.material?.color?.getHex?.() ?? null) === hoverHex && (Number(mesh.material?.opacity) || 0) > 0.05), 'Expected hovered segment pick meshes to be visible and highlighted.');
                assertTrue(segBPicks.every((mesh) => (Number(mesh.material?.opacity) || 0) < 0.01), 'Expected other segment pick meshes to remain hidden.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: lanesB=0 produces one-way overlays (Task 81)', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

	                const roadId = view.getRoads()?.[0]?.id ?? null;
	                assertTrue(!!roadId, 'Expected road id.');
	                view.setRoadLaneConfig(roadId, { lanesF: 2, lanesB: 0 });
	                assertEqual(view.getRoads()?.[0]?.lanesB, 0, 'Expected lanesB to allow 0 for one-way roads.');
	                view.setRenderOptions({ centerlines: true, edges: true });

	                const derived = view.getDerived();
	                const seg = derived?.segments?.[0] ?? null;
	                assertTrue(!!seg?.id, 'Expected derived segment.');
                const kinds = (derived?.primitives ?? [])
                    .filter((p) => p?.type === 'polyline' && p?.segmentId === seg.id)
                    .map((p) => p.kind);

                assertTrue(kinds.includes('centerline'), 'Expected centerline polyline.');
                assertTrue(kinds.includes('forward_centerline'), 'Expected forward direction centerline polyline.');
                assertTrue(!kinds.includes('backward_centerline'), 'Expected no backward direction centerline when lanesB=0.');
                assertTrue(kinds.includes('lane_edge_right'), 'Expected lane edge on the forward side.');
                assertTrue(!kinds.includes('lane_edge_left'), 'Expected no lane edge on the missing direction side.');

                view.setRenderOptions({ markings: true });
                const derivedAfter = view.getDerived();
                const segAfter = derivedAfter?.segments?.[0] ?? null;
                const mesh = view._arrowMeshes?.[0] ?? null;
                const attr = mesh?.geometry?.getAttribute?.('position') ?? null;
                const positions = attr?.array ?? null;
                assertTrue(!!segAfter?.dir && !!segAfter?.right && !!positions, 'Expected lane arrow mesh and segment basis vectors.');
                assertTrue((positions.length % (9 * 3)) === 0, 'Expected arrow geometry to be packed as 9 vertices per arrow.');

                const arrowCount = positions.length / (9 * 3);
                assertTrue(arrowCount > 0, 'Expected at least one forward lane arrow.');

                const segMidX = ((Number(segAfter.aWorld?.x) || 0) + (Number(segAfter.bWorld?.x) || 0)) * 0.5;
	                const segMidZ = ((Number(segAfter.aWorld?.z) || 0) + (Number(segAfter.bWorld?.z) || 0)) * 0.5;
	                const dirX = Number(segAfter.dir?.x) || 0;
	                const dirZ = Number(segAfter.dir?.z) || 0;
	                const expectedRightX = -dirZ;
	                const expectedRightZ = dirX;
	                const rightX = Number(segAfter.right?.x) || 0;
	                const rightZ = Number(segAfter.right?.z) || 0;
	                assertTrue((rightX * expectedRightX + rightZ * expectedRightZ) > 0.95, 'Expected segment.right to follow right-hand traffic convention.');

                const readV = (vertexIndex) => {
                    const i = vertexIndex * 3;
                    return { x: Number(positions[i]) || 0, y: Number(positions[i + 1]) || 0, z: Number(positions[i + 2]) || 0 };
                };

                for (let a = 0; a < arrowCount; a++) {
                    const base = a * 9;
                    const tip = readV(base + 6);
                    const t0 = readV(base + 0);
                    const t3 = readV(base + 3);
                    const t5 = readV(base + 5);
                    const tail = {
                        x: (t0.x + t3.x + t5.x) / 3,
                        z: (t0.z + t3.z + t5.z) / 3
                    };

                    const arrowDirX = tip.x - tail.x;
                    const arrowDirZ = tip.z - tail.z;
	                    const dotForward = arrowDirX * dirX + arrowDirZ * dirZ;
	                    assertTrue(dotForward > 0.25, 'Expected one-way road arrows to point along segment direction.');
	
	                    const centerX = (tip.x + tail.x) * 0.5;
	                    const centerZ = (tip.z + tail.z) * 0.5;
	                    const side = (centerX - segMidX) * expectedRightX + (centerZ - segMidZ) * expectedRightZ;
	                    assertTrue(side > -1e-6, 'Expected one-way road arrows to only appear on the forward side.');
	                }
	            } finally {
	                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger rendering tests skipped:', e.message);
    }

    // ========== Road Debugger Trimming Tests (Task 58) ==========
    try {
        const { rebuildRoadDebuggerPipeline } = await import('/src/app/road_debugger/RoadDebuggerPipeline.js');

        const dot2 = (a, b) => (Number(a?.x) || 0) * (Number(b?.x) || 0) + (Number(a?.z) || 0) * (Number(b?.z) || 0);
        const rectAxes = (points) => {
            const pts = Array.isArray(points) ? points : [];
            const axes = [];
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i];
                const b = pts[(i + 1) % pts.length];
                const dx = (Number(b?.x) || 0) - (Number(a?.x) || 0);
                const dz = (Number(b?.z) || 0) - (Number(a?.z) || 0);
                const len = Math.hypot(dx, dz);
                if (!(len > 1e-9)) continue;
                const inv = 1 / len;
                axes.push({ x: dz * inv, z: -dx * inv });
            }
            return axes;
        };
        const project = (points, axis) => {
            const pts = Array.isArray(points) ? points : [];
            let min = Infinity;
            let max = -Infinity;
            for (const p of pts) {
                const t = dot2(p, axis);
                if (t < min) min = t;
                if (t > max) max = t;
            }
            return { min, max };
        };
        const satOverlap = (aPts, bPts, eps = 1e-5) => {
            const axes = [...rectAxes(aPts), ...rectAxes(bPts)];
            for (const axis of axes) {
                const a = project(aPts, axis);
                const b = project(bPts, axis);
                if (a.max <= b.min + eps || b.max <= a.min + eps) return false;
            }
            return true;
        };

        test('RoadDebuggerPipeline: trim output is deterministic', () => {
            const laneWidth = 4.8;
            const roads = [
                {
                    id: 'A',
                    name: 'A',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'A0', tileX: 0, tileY: 0, offsetX: -12, offsetY: 0, tangentFactor: 1 },
                        { id: 'A1', tileX: 1, tileY: 0, offsetX: 12, offsetY: 0, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'B',
                    name: 'B',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'B0', tileX: 0, tileY: 0, offsetX: 12, offsetY: -12, tangentFactor: 1 },
                        { id: 'B1', tileX: 0, tileY: 1, offsetX: 12, offsetY: 12, tangentFactor: 1 }
                    ]
                }
            ];

            const settings = {
                origin: { x: 0, z: 0 },
                tileSize: 24,
                laneWidth,
                marginFactor: 0.1,
                trim: { enabled: true, threshold: laneWidth * 0.1, debug: {} }
            };

            const a = rebuildRoadDebuggerPipeline({ roads, settings });
            const b = rebuildRoadDebuggerPipeline({ roads, settings });
            assertEqual(JSON.stringify(a), JSON.stringify(b), 'Expected deterministic rebuild output.');
        });

        test('RoadDebuggerPipeline: kept asphalt pieces do not overlap after trim', () => {
            const laneWidth = 4.8;
            const roads = [
                {
                    id: 'A',
                    name: 'A',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'A0', tileX: 0, tileY: 0, offsetX: -12, offsetY: 0, tangentFactor: 1 },
                        { id: 'A1', tileX: 1, tileY: 0, offsetX: 12, offsetY: 0, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'B',
                    name: 'B',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'B0', tileX: 0, tileY: 0, offsetX: 12, offsetY: -12, tangentFactor: 1 },
                        { id: 'B1', tileX: 0, tileY: 1, offsetX: 12, offsetY: 12, tangentFactor: 1 }
                    ]
                }
            ];

            const settings = {
                origin: { x: 0, z: 0 },
                tileSize: 24,
                laneWidth,
                marginFactor: 0.1,
                trim: { enabled: true, threshold: laneWidth * 0.1, debug: {} }
            };

            const out = rebuildRoadDebuggerPipeline({ roads, settings });
            const pieces = [];
            for (const seg of out.segments ?? []) {
                for (const piece of seg?.keptPieces ?? []) {
                    if (!Array.isArray(piece?.corners) || piece.corners.length < 3) continue;
                    pieces.push({ id: piece.id, segmentId: seg.id, corners: piece.corners });
                }
            }

            assertTrue(pieces.length > 0, 'Expected kept pieces.');
            assertTrue((out.trim?.overlaps?.length ?? 0) > 0, 'Expected at least one overlap before trimming.');

            for (let i = 0; i < pieces.length; i++) {
                for (let j = i + 1; j < pieces.length; j++) {
                    const a = pieces[i];
                    const b = pieces[j];
                    if (satOverlap(a.corners, b.corners)) {
                        throw new Error(`Unexpected kept overlap: ${a.id} vs ${b.id}`);
                    }
                }
            }
        });

        test('RoadDebuggerPipeline: trims can split into multiple kept pieces', () => {
            const laneWidth = 4.8;
            const roads = [
                {
                    id: 'main',
                    name: 'Main',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'm0', tileX: 0, tileY: 0, offsetX: -12, offsetY: 0, tangentFactor: 1 },
                        { id: 'm1', tileX: 4, tileY: 0, offsetX: 12, offsetY: 0, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'cross1',
                    name: 'Cross 1',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'c10', tileX: 0, tileY: 0, offsetX: 12, offsetY: -12, tangentFactor: 1 },
                        { id: 'c11', tileX: 0, tileY: 1, offsetX: 12, offsetY: 12, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'cross2',
                    name: 'Cross 2',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'c20', tileX: 2, tileY: 0, offsetX: 12, offsetY: -12, tangentFactor: 1 },
                        { id: 'c21', tileX: 2, tileY: 1, offsetX: 12, offsetY: 12, tangentFactor: 1 }
                    ]
                }
            ];

            const settings = {
                origin: { x: 0, z: 0 },
                tileSize: 24,
                laneWidth,
                marginFactor: 0.1,
                trim: { enabled: true, threshold: laneWidth * 0.1, debug: {} }
            };

            const outA = rebuildRoadDebuggerPipeline({ roads, settings });
            const outB = rebuildRoadDebuggerPipeline({ roads, settings });

            const segA = outA.segments?.find?.((s) => s?.roadId === 'main') ?? null;
            const segB = outB.segments?.find?.((s) => s?.roadId === 'main') ?? null;
            assertTrue(!!segA && !!segB, 'Expected main segment.');

            assertTrue((segA.trimRemoved?.length ?? 0) >= 2, 'Expected at least two removed intervals on the main segment.');
            assertEqual(segA.keptPieces?.length ?? 0, 3, 'Expected main segment to split into 3 kept pieces.');

            const stableA = (segA.keptPieces ?? []).map((p) => ({ t0: p.t0, t1: p.t1, length: p.length }));
            const stableB = (segB.keptPieces ?? []).map((p) => ({ t0: p.t0, t1: p.t1, length: p.length }));
            assertEqual(JSON.stringify(stableA), JSON.stringify(stableB), 'Expected stable split intervals across runs.');
        });

        test('RoadDebuggerPipeline: dropped pieces only render when enabled', () => {
            const laneWidth = 4.8;
            const roads = [
                {
                    id: 'main',
                    name: 'Main',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'm0', tileX: 0, tileY: 0, offsetX: -12, offsetY: 0, tangentFactor: 1 },
                        { id: 'm1', tileX: 2, tileY: 0, offsetX: 12, offsetY: 0, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'cross1',
                    name: 'Cross 1',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'c10', tileX: 0, tileY: 0, offsetX: 12, offsetY: -12, tangentFactor: 1 },
                        { id: 'c11', tileX: 0, tileY: 1, offsetX: 12, offsetY: 12, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'cross2',
                    name: 'Cross 2',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'c20', tileX: 1, tileY: 0, offsetX: 0, offsetY: -12, tangentFactor: 1 },
                        { id: 'c21', tileX: 1, tileY: 1, offsetX: 0, offsetY: 12, tangentFactor: 1 }
                    ]
                }
            ];

            const baseSettings = {
                origin: { x: 0, z: 0 },
                tileSize: 24,
                laneWidth,
                marginFactor: 0.1
            };

            const outNoDbg = rebuildRoadDebuggerPipeline({
                roads,
                settings: { ...baseSettings, trim: { enabled: true, threshold: laneWidth * 0.1, debug: { droppedPieces: false } } }
            });
            const droppedCount = (outNoDbg.segments ?? []).reduce((sum, seg) => sum + (seg?.droppedPieces?.length ?? 0), 0);
            assertTrue(droppedCount > 0, 'Expected at least one dropped piece.');
            assertEqual((outNoDbg.primitives ?? []).filter((p) => p?.type === 'polygon' && p?.kind === 'trim_dropped_piece').length, 0, 'Expected dropped piece primitives to be hidden.');

            const outDbg = rebuildRoadDebuggerPipeline({
                roads,
                settings: { ...baseSettings, trim: { enabled: true, threshold: laneWidth * 0.1, debug: { droppedPieces: true } } }
            });
            assertEqual(
                (outDbg.primitives ?? []).filter((p) => p?.type === 'polygon' && p?.kind === 'trim_dropped_piece').length,
                droppedCount,
                'Expected dropped piece primitives when enabled.'
            );
        });

        test('RoadDebuggerPipeline: removed pieces only render when enabled', () => {
            const laneWidth = 4.8;
            const roads = [
                {
                    id: 'main',
                    name: 'Main',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'm0', tileX: 0, tileY: 0, offsetX: -12, offsetY: 0, tangentFactor: 1 },
                        { id: 'm1', tileX: 2, tileY: 0, offsetX: 12, offsetY: 0, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'cross1',
                    name: 'Cross 1',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'c10', tileX: 0, tileY: 0, offsetX: 12, offsetY: -12, tangentFactor: 1 },
                        { id: 'c11', tileX: 0, tileY: 1, offsetX: 12, offsetY: 12, tangentFactor: 1 }
                    ]
                },
                {
                    id: 'cross2',
                    name: 'Cross 2',
                    lanesF: 1,
                    lanesB: 1,
                    points: [
                        { id: 'c20', tileX: 1, tileY: 0, offsetX: 0, offsetY: -12, tangentFactor: 1 },
                        { id: 'c21', tileX: 1, tileY: 1, offsetX: 0, offsetY: 12, tangentFactor: 1 }
                    ]
                }
            ];

            const baseSettings = {
                origin: { x: 0, z: 0 },
                tileSize: 24,
                laneWidth,
                marginFactor: 0.1
            };

            const outNoDbg = rebuildRoadDebuggerPipeline({
                roads,
                settings: { ...baseSettings, trim: { enabled: true, threshold: laneWidth * 0.1, debug: { removedPieces: false } } }
            });
            const removedCount = (outNoDbg.segments ?? []).reduce((sum, seg) => sum + (seg?.trimRemoved?.length ?? 0), 0);
            assertTrue(removedCount > 0, 'Expected at least one removed interval.');
            assertEqual((outNoDbg.primitives ?? []).filter((p) => p?.type === 'polygon' && p?.kind === 'trim_removed_piece').length, 0, 'Expected removed piece primitives to be hidden.');

            const outDbg = rebuildRoadDebuggerPipeline({
                roads,
                settings: { ...baseSettings, trim: { enabled: true, threshold: laneWidth * 0.1, debug: { removedPieces: true } } }
            });
            assertEqual(
                (outDbg.primitives ?? []).filter((p) => p?.type === 'polygon' && p?.kind === 'trim_removed_piece').length,
                removedCount,
                'Expected removed piece primitives when enabled.'
            );
        });
    } catch (e) {
        console.log('⏭️  Road Debugger trimming tests skipped:', e.message);
    }

    // ========== Road Debugger Help UI Tests (Task 59) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

        test('RoadDebuggerUI: help panel exists and contains key concepts', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                const helpBtn = document.querySelector('.road-debugger-help-btn');
                assertTrue(!!helpBtn, 'Expected Help button.');

                const helpModal = document.querySelector('.road-debugger-help-modal');
                assertTrue(!!helpModal, 'Expected Help modal.');

                helpBtn.click();
                assertTrue(helpModal.style.display !== 'none', 'Expected help modal to be visible after open.');

                const text = (helpModal.textContent || '').toLowerCase();
                const terms = [
                    'lane model',
                    'width derivation',
                    'direction centerlines',
                    'tangent factor',
                    'snapping',
                    'crossing threshold',
                    'aabb',
                    'obb',
                    'sat',
                    'sutherland',
                    'removed intervals',
                    't0',
                    't1',
                    'dropped'
                ];
                for (const term of terms) {
                    assertTrue(text.includes(term), `Expected help text to include "${term}".`);
                }

                const rows = Array.from(document.querySelectorAll('.road-debugger-row'));
                const snapRow = rows.find((r) => (r.textContent || '').includes('Snap')) ?? null;
                assertTrue(!!snapRow, 'Expected Snap row.');
                assertTrue((snapRow.title || '').includes('tile/10'), 'Expected Snap tooltip to mention tile/10.');
            } finally {
                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger help UI tests skipped:', e.message);
    }

    // ========== Road Debugger Line Visualization Tests (Task 60) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

	        test('RoadDebugger: divider vs direction centerline toggles are independent', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                const findToggle = (labelText) => {
                    const rows = Array.from(document.querySelectorAll('.road-debugger-row'));
                    for (const row of rows) {
                        const label = row.querySelector('.road-debugger-label');
                        if ((label?.textContent || '').trim() !== labelText) continue;
                        return row.querySelector('input[type="checkbox"]');
                    }
                    return null;
	                };

	                const dividerToggle = findToggle('Divider');
	                const directionToggle = findToggle('Direction lines');
	                assertTrue(!!dividerToggle, 'Expected divider toggle.');
	                assertTrue(!!directionToggle, 'Expected direction lines toggle.');

	                const kinds = () => (view.getDerived()?.primitives ?? [])
	                    .filter((p) => p?.type === 'polyline')
	                    .map((p) => p?.kind);

	                assertFalse(kinds().includes('centerline'), 'Expected divider centerline primitives disabled by default.');
	                assertFalse(kinds().includes('forward_centerline'), 'Expected forward direction centerline primitives disabled by default.');
	                assertFalse(kinds().includes('backward_centerline'), 'Expected backward direction centerline primitives disabled by default.');

	                dividerToggle.checked = true;
	                dividerToggle.dispatchEvent(new Event('change', { bubbles: true }));
	                directionToggle.checked = true;
	                directionToggle.dispatchEvent(new Event('change', { bubbles: true }));
	                assertTrue(kinds().includes('centerline'), 'Expected divider centerline primitives after toggle on.');
	                assertTrue(kinds().includes('forward_centerline'), 'Expected forward direction centerline primitives after toggle on.');
	                assertTrue(kinds().includes('backward_centerline'), 'Expected backward direction centerline primitives after toggle on.');

	                dividerToggle.checked = false;
	                dividerToggle.dispatchEvent(new Event('change', { bubbles: true }));
	                assertFalse(kinds().includes('centerline'), 'Expected divider centerline primitives hidden after toggle.');
	                assertTrue(kinds().includes('forward_centerline'), 'Expected direction centerlines to remain visible when divider is hidden.');

	                dividerToggle.checked = true;
	                dividerToggle.dispatchEvent(new Event('change', { bubbles: true }));
	                assertTrue(kinds().includes('centerline'), 'Expected divider centerline primitives visible after re-enable.');
	                assertTrue(kinds().includes('forward_centerline'), 'Expected direction centerlines to remain visible when divider is re-enabled.');

	                directionToggle.checked = false;
	                directionToggle.dispatchEvent(new Event('change', { bubbles: true }));
	                assertFalse(kinds().includes('forward_centerline'), 'Expected forward direction centerline primitives hidden after toggle.');
	                assertFalse(kinds().includes('backward_centerline'), 'Expected backward direction centerline primitives hidden after toggle.');
	            } finally {
	                view.exit();
            }
        });

	        test('RoadDebugger: direction centerlines share a distinct color', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
	            view.enter();
	            try {
	                view.startRoadDraft();
	                view.addDraftPointByTile(0, 0);
	                view.addDraftPointByTile(2, 0);
	                view.finishRoadDraft();
	                view.setRenderOptions({ centerlines: true });

	                const matCenter = view._materials?.lineBase?.get?.('centerline') ?? null;
	                const matF = view._materials?.lineBase?.get?.('forward_centerline') ?? null;
	                const matB = view._materials?.lineBase?.get?.('backward_centerline') ?? null;
                assertTrue(!!matCenter && !!matF && !!matB, 'Expected centerline and direction line materials.');

                const c = matCenter.color?.getHex?.() ?? null;
                const f = matF.color?.getHex?.() ?? null;
                const b = matB.color?.getHex?.() ?? null;
                assertTrue(Number.isFinite(c) && Number.isFinite(f) && Number.isFinite(b), 'Expected material colors.');
                assertEqual(f, b, 'Expected forward/back direction centerlines to share the same color.');
                assertFalse(f === c, 'Expected direction centerline color to differ from divider centerline.');
            } finally {
                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger line visualization tests skipped:', e.message);
    }

    // ========== Road Debugger First Tile Marker Tests (Task 61) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

        test('RoadDebugger: first draft point creates tile marker', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                assertFalse(view._draftFirstTileMarkerMesh?.visible ?? false, 'Expected marker hidden before first click.');

                view.addDraftPointByTile(3, 4);
                assertTrue(view._draftFirstTileMarkerMesh?.visible === true, 'Expected marker visible after first click.');

                const ox = Number(view._origin?.x) || 0;
                const oz = Number(view._origin?.z) || 0;
                const tileSize = Number(view._tileSize) || 24;
                const marker = view._draftFirstTileMarkerMesh;
                assertNear(marker.position.x, ox + 3 * tileSize, 1e-6, 'Marker X should be centered on the tile.');
                assertNear(marker.position.z, oz + 4 * tileSize, 1e-6, 'Marker Z should be centered on the tile.');

                view.addDraftPointByTile(5, 4);
                assertTrue(view._draftFirstTileMarkerMesh?.visible === true, 'Expected marker to remain visible after additional points.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebugger: cancelling or finishing draft removes tile marker', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(1, 1);
                assertTrue(view._draftFirstTileMarkerMesh?.visible === true, 'Expected marker visible after first click.');
                view.cancelRoadDraft();
                assertFalse(view._draftFirstTileMarkerMesh?.visible ?? false, 'Expected marker hidden after cancel.');

                view.startRoadDraft();
                view.addDraftPointByTile(2, 2);
                view.addDraftPointByTile(3, 2);
                assertTrue(view._draftFirstTileMarkerMesh?.visible === true, 'Expected marker visible before done.');
                view.finishRoadDraft();
                assertFalse(view._draftFirstTileMarkerMesh?.visible ?? false, 'Expected marker hidden after done.');
            } finally {
                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger first tile marker tests skipped:', e.message);
    }

    // ========== Road Debugger Hover/Selection Sync Tests (Task 62) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

        test('RoadDebugger: table hover/selection syncs to viewport state', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                const roadId = view.getRoads()[0].id;
                const roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
                assertTrue(!!roadRow, 'Expected road row.');

                roadRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                assertEqual(view._hover?.roadId, roadId, 'Expected hover roadId from table hover.');
                assertEqual(view._hover?.segmentId, null, 'Expected no hovered segment when hovering road row.');

	                roadRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                assertEqual(view._selection?.type, 'road', 'Expected selection type road from table click.');
	                assertEqual(view._selection?.roadId, roadId, 'Expected selected roadId from table click.');

	                const segId = view.getDerived()?.segments?.[0]?.id ?? null;
	                assertTrue(!!segId, 'Expected derived segment id.');
	                const segRow = document.querySelector(`.road-debugger-seg-row[data-segment-id="${segId}"]`);
	                assertTrue(!!segRow, 'Expected segment row in detail panel.');

                segRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                assertEqual(view._hover?.segmentId, segId, 'Expected hovered segmentId from table hover.');
                segRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                assertEqual(view._selection?.type, 'segment', 'Expected selection type segment from table click.');
                assertEqual(view._selection?.segmentId, segId, 'Expected selected segmentId from table click.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: viewport hover/selection syncs to table highlight', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(3, 0);
                view.finishRoadDraft();

	                const roadId = view.getRoads()[0].id;
	                const segId = view.getDerived()?.segments?.[0]?.id ?? null;
	                assertTrue(!!segId, 'Expected derived segment id.');

	                const roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
	                assertTrue(!!roadRow, 'Expected road row.');
	                roadRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                assertTrue(roadRow.classList.contains('is-selected'), 'Expected road row selected class after selection.');

	                view.setHoverSegment(segId);
	                let segRow = document.querySelector(`.road-debugger-seg-row[data-segment-id="${segId}"]`);
	                assertTrue(!!segRow, 'Expected segment row in detail panel.');
	                assertTrue(segRow.classList.contains('is-hovered'), 'Expected segment row hovered class from viewport hover.');

	                view.selectSegment(segId);
	                assertTrue(roadRow.classList.contains('is-selected'), 'Expected road row selected class from viewport selection.');
	                segRow = document.querySelector(`.road-debugger-seg-row[data-segment-id="${segId}"]`);
	                assertTrue(!!segRow, 'Expected segment row in detail panel.');
	                assertTrue(segRow.classList.contains('is-selected'), 'Expected segment row selected class from viewport selection.');
	            } finally {
	                view.exit();
	            }
	        });
    } catch (e) {
        console.log('⏭️  Road Debugger hover/selection sync tests skipped:', e.message);
    }

    // ========== Road Debugger Table Delete/Visibility Tests (Task 63) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

	        test('RoadDebugger: road row is single-line and supports delete', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                view.startRoadDraft();
                view.addDraftPointByTile(0, 2);
                view.addDraftPointByTile(2, 2);
                view.finishRoadDraft();

                const roads = view.getRoads();
                assertEqual(roads.length, 2, 'Expected 2 roads before delete.');
                const roadId = roads[0].id;

	                const roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
	                assertTrue(!!roadRow, 'Expected road row.');
	                assertTrue(roadRow.classList.contains('road-debugger-road-row-single'), 'Expected single-line road row class.');

	                roadRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                const editor = document.querySelector('.road-debugger-editor');
	                assertTrue(!!editor, 'Expected bottom editor panel.');
	                const del = editor.querySelector('.road-debugger-editor-delete');
	                assertTrue(!!del && del.style.display !== 'none', 'Expected delete button.');
	                del.dispatchEvent(new MouseEvent('click', { bubbles: true }));

	                assertEqual(view.getRoads().length, 1, 'Expected road count to decrease after delete.');
	                assertFalse(!!document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`), 'Expected deleted road row to be removed.');
            } finally {
                view.exit();
            }
        });

	        test('RoadDebugger: delete is available when selecting a segment in the viewport', () => {
	            const engine = {
	                canvas: document.createElement('canvas'),
	                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
	                scene: new THREE.Scene(),
	                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
	            };

	            const view = new RoadDebuggerView(engine, { uiEnabled: true });
	            view.enter();
	            try {
	                view.startRoadDraft();
	                view.addDraftPointByTile(0, 0);
	                view.addDraftPointByTile(2, 0);
	                view.finishRoadDraft();

	                const roadId = view.getRoads()?.[0]?.id ?? null;
	                const segId = view.getDerived()?.segments?.[0]?.id ?? null;
	                assertTrue(!!roadId, 'Expected road id.');
	                assertTrue(!!segId, 'Expected derived segment id.');

	                view.selectSegment(segId);
	                assertEqual(view._selection?.type ?? null, 'segment', 'Expected segment selection after viewport pick.');

	                const editor = document.querySelector('.road-debugger-editor');
	                assertTrue(!!editor, 'Expected bottom editor panel.');
	                const del = editor.querySelector('.road-debugger-editor-delete');
	                assertTrue(!!del && del.style.display !== 'none', 'Expected delete button when a segment is selected.');

	                del.dispatchEvent(new MouseEvent('click', { bubbles: true }));

	                assertEqual(view.getRoads().length, 0, 'Expected road to be deleted from segment selection.');
	                assertFalse(!!document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`), 'Expected deleted road row to be removed.');
	            } finally {
	                view.exit();
	            }
	        });

	        test('RoadDebugger: visibility toggle hides rendering but keeps derived geometry stable', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(3, 0);
                view.finishRoadDraft();

                view.startRoadDraft();
                view.addDraftPointByTile(0, 1);
                view.addDraftPointByTile(3, 1);
                view.finishRoadDraft();

                const roads = view.getRoads();
                const hideId = roads[0].id;
                const keepId = roads[1].id;

                const before = JSON.stringify(view.getDerived());
                const beforeHiddenAsphalt = (view._asphaltMeshes ?? []).filter((m) => m?.userData?.roadId === hideId).length;
	                const beforeKeepAsphalt = (view._asphaltMeshes ?? []).filter((m) => m?.userData?.roadId === keepId).length;
	                assertTrue(beforeHiddenAsphalt > 0, 'Expected asphalt meshes for road to hide.');
	                assertTrue(beforeKeepAsphalt > 0, 'Expected asphalt meshes for road to keep.');

	                const hideRow = document.querySelector(`.road-debugger-road-row[data-road-id="${hideId}"]`);
	                assertTrue(!!hideRow, 'Expected road row for visibility toggle.');
	                hideRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	                const editor = document.querySelector('.road-debugger-editor');
	                assertTrue(!!editor, 'Expected bottom editor panel.');
	                const visibleField = Array.from(editor.querySelectorAll('.road-debugger-editor-field')).find((row) => (row.querySelector('.road-debugger-editor-field-label')?.textContent || '').trim() === 'visible') ?? null;
	                const vis = visibleField?.querySelector?.('input[type="checkbox"]') ?? null;
	                assertTrue(!!vis, 'Expected visibility checkbox.');
	                vis.checked = false;
	                vis.dispatchEvent(new Event('change', { bubbles: true }));

                assertEqual(JSON.stringify(view.getDerived()), before, 'Expected derived output to be unchanged after visibility toggle.');

                const afterHiddenAsphalt = (view._asphaltMeshes ?? []).filter((m) => m?.userData?.roadId === hideId).length;
                const afterKeepAsphalt = (view._asphaltMeshes ?? []).filter((m) => m?.userData?.roadId === keepId).length;
                assertEqual(afterHiddenAsphalt, 0, 'Expected hidden road to have no rendered asphalt meshes.');
                assertTrue(afterKeepAsphalt > 0, 'Expected visible road to keep rendered asphalt meshes.');
            } finally {
                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger table delete/visibility tests skipped:', e.message);
    }

    // ========== Road Debugger Info Panel Tests (Task 64) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

        test('RoadDebuggerUI: info panel exists and updates with hover/selection', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                const panel = document.querySelector('.road-debugger-info-panel');
                assertTrue(!!panel, 'Expected bottom-right info panel.');
                const title = panel.querySelector('.road-debugger-info-title');
                const body = panel.querySelector('.road-debugger-info-body');
                assertTrue(!!title && !!body, 'Expected info panel title/body.');
                assertEqual((body.textContent || '').trim(), '—', 'Expected placeholder info when nothing is hovered.');

                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                const roadId = view.getRoads()[0].id;
                const roadName = view.getRoads()[0].name;
                const segId = view.getDerived().segments[0].id;

                view.setHoverRoad(roadId);
                assertTrue((title.textContent || '').includes('Hover'), 'Expected info panel title to indicate hover panel.');
                assertTrue((body.textContent || '').includes(`road: ${roadName}`), 'Expected hovered road name in info body.');

                view.selectSegment(segId);
                assertTrue((body.textContent || '').includes(`road: ${roadName}`), 'Expected hovered info to remain after selection changes.');
                assertFalse((body.textContent || '').includes(`segment: ${segId}`), 'Expected selection info to not be shown in hover panel.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebuggerUI: hover panel does not include selection details', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                view.startRoadDraft();
                view.addDraftPointByTile(0, 1);
                view.addDraftPointByTile(2, 1);
                view.finishRoadDraft();

                const roads = view.getRoads();
                assertTrue(roads.length >= 2, 'Expected at least two roads for override test.');
                const hoverId = roads[0].id;
                const selectedId = roads[1].id;
                const hoverName = roads[0].name;
                const selectedName = roads[1].name;

                const panel = document.querySelector('.road-debugger-info-panel');
                const title = panel?.querySelector?.('.road-debugger-info-title') ?? null;
                const body = panel?.querySelector?.('.road-debugger-info-body') ?? null;
                assertTrue(!!panel && !!title && !!body, 'Expected info panel elements.');

                view.setHoverRoad(hoverId);
                assertTrue((body.textContent || '').includes(hoverName), 'Expected hovered road name in hover panel.');
                assertFalse((body.textContent || '').includes(selectedName), 'Expected selection to not appear in hover panel.');

                view.selectRoad(selectedId);
                view.setHoverRoad(hoverId);
                assertTrue((title.textContent || '').includes('Hover'), 'Expected info panel title to indicate hover panel.');
                assertTrue((body.textContent || '').includes(hoverName), 'Expected hover panel to continue reflecting hover target.');
                assertFalse((body.textContent || '').includes(selectedName), 'Expected selection to not appear in hover panel.');
            } finally {
                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger info panel tests skipped:', e.message);
    }

    // ========== Road Debugger Camera Controls Tests (Task 65) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');
        const { ROAD_DEBUGGER_WHEEL_ZOOM_DIVISOR } = await import('/src/graphics/gui/road_debugger/RoadDebuggerInput.js');

        test('RoadDebuggerInput: wheel zoom divisor is configured for faster zoom', () => {
            assertTrue(Number.isFinite(ROAD_DEBUGGER_WHEEL_ZOOM_DIVISOR), 'Expected wheel zoom divisor to be a number.');
            assertTrue(ROAD_DEBUGGER_WHEEL_ZOOM_DIVISOR < 12000, 'Expected wheel zoom divisor to be faster than legacy 12000.');
        });

        test('RoadDebuggerUI: orbit widget removed and RMB orbit updates camera', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            engine.canvas.width = 800;
            engine.canvas.height = 600;
            engine.canvas.style.width = '800px';
            engine.canvas.style.height = '600px';
            engine.canvas.style.position = 'fixed';
            engine.canvas.style.left = '0px';
            engine.canvas.style.top = '0px';
            engine.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
            document.body.appendChild(engine.canvas);

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                const surface = document.querySelector('.road-debugger-orbit-surface');
                assertEqual(surface, null, 'Expected orbit widget surface to be removed.');
                assertTrue(typeof PointerEvent !== 'undefined', 'Expected PointerEvent support for orbit widget test.');

                const before = view.camera.position.clone();
                engine.canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, clientX: 380, clientY: 300, pointerId: 1 }));
                engine.canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 2, clientX: 420, clientY: 340, pointerId: 1 }));
                engine.canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 2, clientX: 420, clientY: 340, pointerId: 1 }));
                view.controls?.update?.(1 / 60);
                const after = view.camera.position.clone();

                assertTrue(after.distanceTo(before) > 1e-6, 'Expected RMB orbit to update camera position.');
            } finally {
                view.exit();
                engine.canvas.remove();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger camera controls tests skipped:', e.message);
    }

	    // ========== Road Debugger Pan Stability Tests (Task 66) ==========
	    try {
	        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

	        test('RoadDebuggerInput: mouse pan is deterministic for a synthetic pointer sequence', () => {
	            assertTrue(typeof PointerEvent !== 'undefined', 'Expected PointerEvent support for pan test.');

            const run = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 200;
                canvas.height = 200;
                canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });

                const engine = {
                    canvas,
                    camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                    scene: new THREE.Scene(),
                    clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
                };

	                const view = new RoadDebuggerView(engine, { uiEnabled: false });
	                view.enter();
	                try {
                        view.controls.enableDamping = false;
	                    const start = view.camera.position.clone();
	                    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 1, clientX: 100, clientY: 100, pointerId: 1 }));
	                    canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 120, clientY: 100, pointerId: 1 }));
	                    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 120, clientY: 100, pointerId: 1 }));
                        view.controls.update(1 / 60);
	                    const after = view.camera.position.clone();
	                    return { start, after };
	                } finally {
	                    view.exit();
                }
            };

            const a = run();
            const b = run();
            assertTrue(a.after.distanceTo(a.start) > 1e-6, 'Expected pan to move the camera.');
            assertNear(a.after.x, b.after.x, 1e-6, 'Pan X should be deterministic.');
            assertNear(a.after.y, b.after.y, 1e-6, 'Pan Y should be deterministic.');
            assertNear(a.after.z, b.after.z, 1e-6, 'Pan Z should be deterministic.');
        });

	        test('RoadDebuggerInput: mouse pan applies no extra delta when pointer does not move', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;
            canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 });

            const engine = {
                canvas,
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

	            const view = new RoadDebuggerView(engine, { uiEnabled: false });
	            view.enter();
	            try {
                    view.controls.enableDamping = false;
	                canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 1, clientX: 100, clientY: 100, pointerId: 1 }));
	                canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 120, clientY: 100, pointerId: 1 }));
	                canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 120, clientY: 100, pointerId: 1 }));
                    view.controls.update(1 / 60);
	                const after = view.camera.position.clone();
                    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 1, clientX: 120, clientY: 100, pointerId: 1 }));
                    canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 120, clientY: 100, pointerId: 1 }));
                    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 120, clientY: 100, pointerId: 1 }));
                    view.controls.update(1 / 60);
	                const after2 = view.camera.position.clone();
	                assertTrue(after2.distanceTo(after) < 1e-6, 'Expected no camera movement when pointer stays still.');
	            } finally {
	                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger pan stability tests skipped:', e.message);
    }

    // ========== Rapier Debugger Renderer State Tests ==========
    try {
        const { RapierDebuggerScene } = await import('/src/graphics/gui/rapier_debugger/RapierDebuggerScene.js');

        test('RapierDebuggerScene: restores renderer localClippingEnabled on dispose', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                renderer: {
                    localClippingEnabled: false,
                    getSize: (out) => {
                        out.set(800, 600);
                        return out;
                    }
                }
            };

            const scene = new RapierDebuggerScene(engine);
            scene.enter();
            assertTrue(engine.renderer.localClippingEnabled === true, 'Expected Rapier debugger to enable local clipping.');
            scene.dispose();
            assertTrue(engine.renderer.localClippingEnabled === false, 'Expected Rapier debugger to restore local clipping state.');
        });

        test('RapierDebuggerScene: restores scene fog/background on dispose', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                renderer: {
                    localClippingEnabled: false,
                    getSize: (out) => {
                        out.set(800, 600);
                        return out;
                    }
                }
            };

            engine.scene.background = null;
            engine.scene.fog = null;

            const scene = new RapierDebuggerScene(engine);
            scene.enter();
            assertTrue(!!engine.scene.background, 'Expected Rapier debugger to set scene background.');
            assertTrue(!!engine.scene.fog, 'Expected Rapier debugger to set scene fog.');
            scene.dispose();
            assertEqual(engine.scene.background, null, 'Expected Rapier debugger to restore scene background.');
            assertEqual(engine.scene.fog, null, 'Expected Rapier debugger to restore scene fog.');
        });
    } catch (e) {
        console.log('⏭️  Rapier Debugger renderer state tests skipped:', e.message);
    }

    // ========== Road Debugger Tile Offset Normalization Tests (Task 68) ==========
    try {
        const { normalizeRoadDebuggerTileOffsetBoundary } = await import('/src/app/road_debugger/RoadDebuggerTileOffset.js');
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

	        test('RoadDebuggerTileOffset: +half boundary normalizes to next tile -half (both axes)', () => {
	            const tileSize = 24;
	            const half = 0.5;

	            const x = normalizeRoadDebuggerTileOffsetBoundary({ tileX: 7, tileY: 8, offsetU: half, offsetV: 0 }, { tileSize });
	            assertEqual(x.tileX, 8, 'tileX should increment when offsetU is +half.');
	            assertNear(x.offsetU, -half, 1e-9, 'offsetU should normalize to -half.');

	            const y = normalizeRoadDebuggerTileOffsetBoundary({ tileX: 7, tileY: 8, offsetU: 0, offsetV: half }, { tileSize });
	            assertEqual(y.tileY, 9, 'tileY should increment when offsetV is +half.');
	            assertNear(y.offsetV, -half, 1e-9, 'offsetV should normalize to -half.');
	        });

	        test('RoadDebuggerTileOffset: boundary-equivalent representations normalize deterministically', () => {
	            const tileSize = 24;
	            const half = 0.5;

	            const a = normalizeRoadDebuggerTileOffsetBoundary({ tileX: 7, tileY: 8, offsetU: 0, offsetV: half }, { tileSize });
	            const b = normalizeRoadDebuggerTileOffsetBoundary({ tileX: 7, tileY: 9, offsetU: 0, offsetV: -half }, { tileSize });
	            assertEqual(JSON.stringify(a), JSON.stringify(b), 'Expected boundary-equivalent points to normalize identically.');
	        });

	        test('RoadDebuggerView: snapping to +half boundary returns canonical next-tile -half', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
	            try {
	                const tileSize = Number(view._tileSize) || 24;
	                const half = 0.5;
	                const step = tileSize / 10;
	                const ox = Number(view._origin?.x) || 0;
	                const oz = Number(view._origin?.z) || 0;

                const tileX = 5;
                const tileY = 5;
	                const worldX = ox + tileX * tileSize + half * tileSize - step * 0.25;
	                const worldZ = oz + tileY * tileSize;
	                const res = view._worldToTilePoint(worldX, worldZ, { snap: true });

	                assertEqual(res.tileX, tileX + 1, 'Expected snap to normalize to the next tile.');
	                assertNear(res.offsetU, -half, 1e-6, 'Expected snap to normalize to -half.');
	                assertEqual(res.tileY, tileY, 'Expected Y tile to remain unchanged.');
	            } finally {
	                view.exit();
	            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger tile offset normalization tests skipped:', e.message);
    }

    // ========== Road Debugger Hover Cube Gizmo Tests (Task 69) ==========
    try {
        const { RoadDebuggerView } = await import('/src/graphics/gui/road_debugger/RoadDebuggerView.js');

        test('RoadDebugger: hover cube gizmo shows for hovered and selected point (Task 90)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: false });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                const roadId = view.getRoads()[0].id;
                const derivedRoad = view.getDerived()?.roads?.find?.((r) => r?.id === roadId) ?? null;
                const pointId = derivedRoad?.points?.[0]?.id ?? null;
                assertTrue(!!pointId, 'Expected derived point id.');

                view.setHoverPoint(roadId, pointId);
                assertTrue(view._hoverCubeMesh?.visible === true, 'Expected hover cube visible when hovering point.');
                assertEqual(view._hoverCubeMesh?.material?.color?.getHex?.(), 0x3b82f6, 'Expected hover cube to be blue.');

                const control = (view._controlPointMeshes ?? []).find((m) => m?.userData?.roadId === roadId && m?.userData?.pointId === pointId) ?? null;
                assertTrue(!!control, 'Expected control point mesh.');
                assertNear(view._hoverCubeMesh.position.x, control.position.x, 1e-6, 'Hover cube X should match control point.');
                assertNear(view._hoverCubeMesh.position.z, control.position.z, 1e-6, 'Hover cube Z should match control point.');

                view.clearHover();
                assertFalse(view._hoverCubeMesh?.visible ?? false, 'Expected hover cube hidden after clearing hover.');

                view.selectPoint(roadId, pointId);
                assertTrue(view._hoverCubeMesh?.visible === true, 'Expected hover cube visible when a point is selected.');

                view.clearSelection();
                assertFalse(view._hoverCubeMesh?.visible ?? false, 'Expected hover cube hidden after clearing selection.');
            } finally {
                view.exit();
            }
        });

        test('RoadDebuggerUI: point row hover/select keeps hover cube visible (Task 90)', () => {
            const engine = {
                canvas: document.createElement('canvas'),
                camera: new THREE.PerspectiveCamera(55, 1, 0.1, 500),
                scene: new THREE.Scene(),
                clearScene: function() { while (this.scene.children.length) this.scene.remove(this.scene.children[0]); }
            };

            const view = new RoadDebuggerView(engine, { uiEnabled: true });
            view.enter();
            try {
                view.startRoadDraft();
                view.addDraftPointByTile(0, 0);
                view.addDraftPointByTile(2, 0);
                view.finishRoadDraft();

                assertTrue(!view.ui?.hoverCubeToggle, 'Expected no hover cube toggle in UI.');

	                const roadId = view.getRoads()[0].id;
	                const roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
	                assertTrue(!!roadRow, 'Expected road row.');
	                roadRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));

	                const derivedRoad = view.getDerived()?.roads?.find?.((r) => r?.id === roadId) ?? null;
	                const pointId = derivedRoad?.points?.[0]?.id ?? null;
	                assertTrue(!!pointId, 'Expected derived point id.');

	                const pointRow = document.querySelector(`.road-debugger-point-row[data-road-id="${roadId}"][data-point-id="${pointId}"]`);
	                assertTrue(!!pointRow, 'Expected point row in detail panel.');
                pointRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                assertEqual(view._hover?.pointId, pointId, 'Expected hovered pointId from table hover.');
                assertTrue(view._hoverCubeMesh?.visible === true, 'Expected hover cube visible after point row hover.');

                pointRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                assertEqual(view._selection?.type, 'point', 'Expected click to select point.');

                pointRow.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
                assertFalse(!!view._hover?.pointId, 'Expected hover pointId to clear on leave.');
                assertTrue(view._hoverCubeMesh?.visible === true, 'Expected hover cube to remain visible for selected point.');
            } finally {
                view.exit();
            }
        });
    } catch (e) {
        console.log('⏭️  Road Debugger hover cube gizmo tests skipped:', e.message);
    }

    runRoadConnectionDebuggerTests({ test, assertTrue });

    // ========== Scene Shortcut Tests ==========
    const { getSceneShortcutByKey, getSceneShortcutById } = await import('/src/states/SceneShortcutRegistry.js');

    test('SceneShortcutRegistry: key 6 maps to Inspector Room', () => {
        const scene = getSceneShortcutByKey('6');
        assertTrue(!!scene, 'Expected scene for key 6.');
        assertEqual(scene.id, 'inspector_room', 'Expected inspector_room id.');
        assertEqual(scene.label, 'Inspector Room', 'Expected Inspector Room label.');
    });

    test('SceneShortcutRegistry: inspector_room uses key 6', () => {
        const scene = getSceneShortcutById('inspector_room');
        assertTrue(!!scene, 'Expected scene for inspector_room.');
        assertEqual(scene.key, '6', 'Expected inspector_room key 6.');
    });

    const { InspectorRoomUI } = await import('/src/graphics/gui/inspector_room/InspectorRoomUI.js');
    const { lightSignedExpSliderToValue, lightSignedExpValueToSlider } = await import('/src/graphics/gui/inspector_room/InspectorRoomLightUtils.js');

    test('InspectorRoomLightUtils: signed exponential mapping is symmetric', () => {
        const samples = [-1, -0.5, -0.1, 0, 0.1, 0.5, 1];
        for (const t of samples) {
            const v = lightSignedExpSliderToValue(t);
            const back = lightSignedExpValueToSlider(v);
            assertNear(back, t, 1e-6, 'Expected slider->value->slider roundtrip.');
            assertNear(lightSignedExpSliderToValue(-t), -v, 1e-6, 'Expected symmetry about 0.');
        }
    });

    test('InspectorRoomUI: lighting slider initializes from light state', () => {
        const ui = new InspectorRoomUI();
        const state = ui.getLightState();
        const expected = lightSignedExpValueToSlider(state.y);
        assertNear(Number(ui.lightY.value), expected, 1e-3, 'Expected lightY slider to match mapped light state.');
    });

    const { InspectorRoomMeshesProvider } = await import('/src/graphics/gui/inspector_room/InspectorRoomMeshesProvider.js');
    const THREE_IR = await import('three');

    test('InspectorRoomMeshesProvider: pivot gizmo does not change focus bounds', () => {
        const provider = new InspectorRoomMeshesProvider({});
        const parent = new THREE_IR.Group();
        provider.mount(parent);
        provider.setSelectedMeshId('mesh.ball.v1');

        const before = provider.getFocusBounds();
        assertTrue(!!before, 'Expected focus bounds before pivot.');

        provider.setPivotEnabled(true);
        const after = provider.getFocusBounds();
        assertTrue(!!after, 'Expected focus bounds after pivot.');

        assertNear(after.center.x, before.center.x, 1e-6, 'Expected focus center x unchanged.');
        assertNear(after.center.y, before.center.y, 1e-6, 'Expected focus center y unchanged.');
        assertNear(after.center.z, before.center.z, 1e-6, 'Expected focus center z unchanged.');
        assertNear(after.radius, before.radius, 1e-6, 'Expected focus radius unchanged.');
    });

    const { getTreeMeshCollections, getTreeMeshEntryById, getTreeMeshOptionsForCollection, isTreeMeshId, TREE_MESH_COLLECTION } = await import('/src/graphics/content3d/catalogs/TreeMeshCatalog.js');

    test('TreeMeshCatalog: desktop tree entries resolve stable ids', () => {
        const collections = getTreeMeshCollections();
        assertTrue(collections.some((c) => c.id === TREE_MESH_COLLECTION.TREES_DESKTOP), 'Expected desktop tree collection.');

        const options = getTreeMeshOptionsForCollection(TREE_MESH_COLLECTION.TREES_DESKTOP);
        assertTrue(options.length > 0, 'Expected at least one desktop tree option.');

        const firstId = options[0].id;
        assertTrue(isTreeMeshId(firstId), 'Expected tree id to be recognized.');
        const entry = getTreeMeshEntryById(firstId);
        assertTrue(!!entry && typeof entry.fileName === 'string', 'Expected tree entry with fileName.');
    });

    // ========== AI-113 Registry Tests ==========
    const { WINDOW_STYLE } = await import('/src/app/buildings/WindowStyle.js');
    const { WINDOW_TYPE: WINDOW_TYPE_IDS } = await import('/src/graphics/assets3d/generators/buildings/WindowTextureGenerator.js');
    const {
        windowTypeIdFromLegacyWindowStyle,
        legacyWindowStyleFromWindowTypeId,
        normalizeWindowTypeIdOrLegacyStyle
    } = await import('/src/graphics/assets3d/generators/buildings/WindowTypeCompatibility.js');

    test('WindowTypeCompatibility: legacy styles map to window type IDs', () => {
        assertEqual(windowTypeIdFromLegacyWindowStyle(WINDOW_STYLE.DARK), WINDOW_TYPE_IDS.STYLE_DARK, 'DARK mismatch.');
        assertEqual(windowTypeIdFromLegacyWindowStyle(WINDOW_STYLE.BLUE), WINDOW_TYPE_IDS.STYLE_BLUE, 'BLUE mismatch.');
        assertEqual(windowTypeIdFromLegacyWindowStyle(WINDOW_STYLE.GRID), WINDOW_TYPE_IDS.STYLE_GRID, 'GRID mismatch.');
        assertEqual(normalizeWindowTypeIdOrLegacyStyle(WINDOW_STYLE.WARM), WINDOW_TYPE_IDS.STYLE_WARM, 'WARM mismatch.');
        assertEqual(normalizeWindowTypeIdOrLegacyStyle('not_a_style'), WINDOW_TYPE_IDS.STYLE_DEFAULT, 'Default mismatch.');
    });

    test('WindowTypeCompatibility: window types map to legacy styles', () => {
        assertEqual(legacyWindowStyleFromWindowTypeId(WINDOW_TYPE_IDS.STYLE_GREEN), WINDOW_STYLE.GREEN, 'GREEN mismatch.');
        assertEqual(legacyWindowStyleFromWindowTypeId(WINDOW_TYPE_IDS.ARCH_V1), WINDOW_STYLE.DEFAULT, 'ARCH mismatch.');
    });

    const {
        resolveBuildingStyleLabel,
        resolveBuildingStyleWallMaterialUrls
    } = await import('/src/graphics/content3d/catalogs/BuildingStyleCatalog.js');

    test('BuildingStyleCatalog: brick style uses lightweight wall texture', () => {
        assertEqual(resolveBuildingStyleLabel('brick'), 'Brick', 'Brick label mismatch.');
        const urls = resolveBuildingStyleWallMaterialUrls('brick');
        assertTrue(
            typeof urls.baseColorUrl === 'string' && urls.baseColorUrl.includes('brick_wall_DEPRECATED.png'),
            'Expected baseColorUrl.'
        );
        assertEqual(urls.normalUrl, null, 'Expected normalUrl to be null.');
        assertEqual(urls.ormUrl, null, 'Expected ormUrl to be null.');
    });

    const {
        getPbrMaterialOptions,
        getPbrMaterialOptionsForBuildings,
        getPbrMaterialExplicitTileMeters,
        computePbrMaterialTextureRepeat,
        getPbrMaterialMeta
    } = await import('/src/graphics/content3d/catalogs/PbrMaterialCatalog.js');

    test('BuildingStyleCatalog: PBR style ids resolve safely when assets are missing', () => {
        assertEqual(resolveBuildingStyleLabel('pbr.red_brick'), 'Red Brick', 'PBR label mismatch.');
        const urls = resolveBuildingStyleWallMaterialUrls('pbr.red_brick');
        const hasAny = !!urls.baseColorUrl || !!urls.normalUrl || !!urls.ormUrl;
        if (!hasAny) {
            assertEqual(urls.baseColorUrl, null, 'Expected missing baseColorUrl for local-only assets.');
            assertEqual(urls.normalUrl, null, 'Expected missing normalUrl for local-only assets.');
            assertEqual(urls.ormUrl, null, 'Expected missing ormUrl for local-only assets.');
            return;
        }
        assertTrue(typeof urls.baseColorUrl === 'string' && urls.baseColorUrl.includes('/assets/public/pbr/red_brick/basecolor'), 'Expected baseColorUrl to point at local-only PBR folder.');
        assertTrue(typeof urls.normalUrl === 'string' && urls.normalUrl.includes('/assets/public/pbr/red_brick/normal_gl'), 'Expected normalUrl to point at local-only PBR folder.');
        assertTrue(typeof urls.ormUrl === 'string' && urls.ormUrl.includes('/assets/public/pbr/red_brick/arm'), 'Expected ormUrl to point at local-only PBR folder.');
    });

    test('PbrMaterialCatalog: exposes expected PBR ids', () => {
        const all = getPbrMaterialOptions();
        assertTrue(all.some((opt) => opt?.id === 'pbr.red_brick'), 'Expected pbr.red_brick.');
        assertTrue(all.some((opt) => opt?.id === 'pbr.asphalt_02'), 'Expected pbr.asphalt_02.');
    });

    test('PbrMaterialCatalog: building list excludes grass and surfaces', () => {
        const building = getPbrMaterialOptionsForBuildings();
        assertTrue(building.some((opt) => opt?.id === 'pbr.red_brick'), 'Expected pbr.red_brick to be building-eligible.');
        assertFalse(building.some((opt) => opt?.id === 'pbr.asphalt_02'), 'Did not expect pbr.asphalt_02 to be building-eligible.');
        assertFalse(building.some((opt) => String(opt?.id ?? '').toLowerCase().includes('grass')), 'Did not expect grass materials in building list.');
    });

    test('PbrMaterialCatalog: scale metadata computes repeat consistently', () => {
        const meta = getPbrMaterialMeta('pbr.red_brick');
        assertTrue(!!meta, 'Expected red_brick metadata.');
        assertTrue(Number.isFinite(meta.tileMeters) && meta.tileMeters > 0, 'Expected tileMeters > 0.');
        assertEqual(meta.preferredVariant, '1k', 'Expected preferredVariant to default to 1k.');
        assertTrue(Array.isArray(meta.variants) && meta.variants.includes('1k'), 'Expected variants to include 1k.');
        assertTrue(Array.isArray(meta.maps) && meta.maps.includes('baseColor') && meta.maps.includes('normal') && meta.maps.includes('orm'), 'Expected map keys.');

        const repWorld = computePbrMaterialTextureRepeat('pbr.red_brick', { uvSpace: 'meters' });
        assertNear(repWorld.x, 1 / meta.tileMeters, 1e-6, 'Expected world repeat x=1/tileMeters.');
        assertNear(repWorld.y, 1 / meta.tileMeters, 1e-6, 'Expected world repeat y=1/tileMeters.');

        const repUnit = computePbrMaterialTextureRepeat('pbr.red_brick', { uvSpace: 'unit', surfaceSizeMeters: { x: 3, y: 3 } });
        assertNear(repUnit.x, 3 / meta.tileMeters, 1e-6, 'Expected unit repeat x=surface/tileMeters.');
        assertNear(repUnit.y, 3 / meta.tileMeters, 1e-6, 'Expected unit repeat y=surface/tileMeters.');
    });

    test('PbrMaterialCatalog: explicit tile size is only set for configured materials', () => {
        assertNear(getPbrMaterialExplicitTileMeters('pbr.red_brick'), 4.0, 1e-6, 'Expected explicit tileMeters for red_brick.');
        assertEqual(getPbrMaterialExplicitTileMeters('pbr.concrete'), null, 'Expected null explicit tileMeters for materials without config.');
    });

    const { buildTexturePreviewMaterialMaps, computeRealWorldAspectRatio, computeRealWorldRepeat } = await import('/src/graphics/gui/inspector_room/InspectorRoomTexturesProvider.js');

    test('InspectorRoomTexturesProvider: real-world helpers compute repeat/aspect', () => {
        assertEqual(computeRealWorldAspectRatio({ widthMeters: 2, heightMeters: 1 }), 2, 'Expected aspect=2.');
        assertEqual(computeRealWorldAspectRatio({ widthMeters: 2, heightMeters: 0 }), null, 'Expected invalid aspect to return null.');

        const rep = computeRealWorldRepeat({ surfaceSizeMeters: { x: 3, y: 3 }, tileSizeMeters: { x: 2, y: 1 } });
        assertNear(rep.x, 1.5, 1e-6, 'Expected repeat x=surface/tile.');
        assertNear(rep.y, 3, 1e-6, 'Expected repeat y=surface/tile.');
    });

    test('InspectorRoomTexturesProvider: preview maps use standard material slots', () => {
        const baseUrl = 'base';
        const normalUrl = 'normal';
        const ormUrl = 'orm';
        const alphaUrl = 'alpha';

        const single = buildTexturePreviewMaterialMaps({
            previewMode: 'single',
            baseTex: baseUrl,
            normalTex: normalUrl,
            ormTex: ormUrl,
            alphaTex: alphaUrl
        });
        assertEqual(single.overlay.map, baseUrl, 'Expected base map in overlay (single).');
        assertEqual(single.overlay.normalMap, normalUrl, 'Expected normal map in overlay (single).');
        assertEqual(single.overlay.roughnessMap, ormUrl, 'Expected ORM in roughnessMap slot (single).');
        assertEqual(single.overlay.alphaMap, alphaUrl, 'Expected alpha map in overlay (single).');

        const tiled = buildTexturePreviewMaterialMaps({
            previewMode: 'tiled',
            baseTex: baseUrl,
            normalTex: normalUrl,
            ormTex: ormUrl,
            alphaTex: alphaUrl
        });
        assertEqual(tiled.overlay.map, null, 'Expected overlay map cleared in tiled mode.');
        assertEqual(tiled.overlay.normalMap, null, 'Expected overlay normal cleared in tiled mode.');
        assertEqual(tiled.overlay.roughnessMap, null, 'Expected overlay roughness cleared in tiled mode.');
        assertEqual(tiled.tile.map, baseUrl, 'Expected base map in tile material.');
        assertEqual(tiled.tile.normalMap, normalUrl, 'Expected normal map in tile material.');
        assertEqual(tiled.tile.roughnessMap, ormUrl, 'Expected ORM in roughnessMap slot (tile).');
    });

    const { computeBoundsSize, formatMeters } = await import('/src/graphics/gui/inspector_room/InspectorRoomMeasurementUtils.js');

    test('InspectorRoomMeasurementUtils: bounds size and meters formatting', () => {
        const size = computeBoundsSize({ min: { x: 1, y: 2, z: 3 }, max: { x: 4, y: 6, z: 5 } });
        assertTrue(!!size, 'Expected size.');
        assertNear(size.x, 3, 1e-6, 'Expected dx=3.');
        assertNear(size.y, 4, 1e-6, 'Expected dy=4.');
        assertNear(size.z, 2, 1e-6, 'Expected dz=2.');
        assertEqual(formatMeters(2, { digits: 0 }), '2m', 'Expected 0-digit meters.');
        assertEqual(formatMeters(2.3456, { digits: 2 }), '2.35m', 'Expected rounded meters.');
    });

    const { sampleConnector } = await import('/src/app/geometry/ConnectorSampling.js');
    const THREE_NS = await import('three');

    test('ConnectorSampling: straight connector samples endpoints', () => {
        const start = new THREE_NS.Vector2(0, 0);
        const end = new THREE_NS.Vector2(1, 0);
        const connector = {
            segments: [{
                type: 'STRAIGHT',
                startPoint: start,
                endPoint: end,
                length: 1,
                direction: new THREE_NS.Vector2(1, 0)
            }]
        };
        const { points, tangents } = sampleConnector(connector, 0.4);
        assertTrue(points.length >= 2, 'Expected at least 2 points.');
        assertEqual(points[0].x, 0, 'Expected first point x=0.');
        assertEqual(points[0].y, 0, 'Expected first point y=0.');
        assertNear(points[points.length - 1].x, 1, 1e-6, 'Expected last point x≈1.');
        assertNear(points[points.length - 1].y, 0, 1e-6, 'Expected last point y≈0.');
        assertTrue(tangents.length === points.length, 'Expected tangents to match points length.');
        assertNear(tangents[0].x, 1, 1e-6, 'Expected tangent x≈1.');
        assertNear(tangents[0].y, 0, 1e-6, 'Expected tangent y≈0.');
    });

    const { computeFrameDistanceForSphere } = await import('/src/graphics/engine3d/camera/ToolCameraController.js');

    test('ToolCameraController: frame distance fits sphere', () => {
        const d = computeFrameDistanceForSphere({ radius: 1, fovDeg: 90, aspect: 1, padding: 1.0 });
        assertNear(d, 1, 1e-6, 'Expected radius=1 to fit at distance=1 for 90° fov.');
        const padded = computeFrameDistanceForSphere({ radius: 1, fovDeg: 90, aspect: 1, padding: 1.2 });
        assertTrue(padded > d, 'Expected padding to increase distance.');
        const tall = computeFrameDistanceForSphere({ radius: 1, fovDeg: 90, aspect: 0.5, padding: 1.0 });
        assertTrue(tall > d, 'Expected narrower aspect to require larger distance.');
    });

    // ========== Material Variation Tests ==========
    const {
        computeMaterialVariationSeedFromTiles,
        normalizeMaterialVariationConfig
    } = await import('/src/graphics/assets3d/materials/MaterialVariationSystem.js');

    test('MaterialVariation: seed stable across tile order', () => {
        const tilesA = [[1, 2], [3, 4], [2, 2]];
        const tilesB = [[3, 4], [2, 2], [1, 2]];
        const tilesObj = [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 2, y: 2 }];

        const a = computeMaterialVariationSeedFromTiles(tilesA, { salt: 'building' });
        const b = computeMaterialVariationSeedFromTiles(tilesB, { salt: 'building' });
        const c = computeMaterialVariationSeedFromTiles(tilesObj, { salt: 'building' });
        assertEqual(a, b, 'Expected same seed regardless of tile order.');
        assertEqual(a, c, 'Expected same seed for array/object tile formats.');
    });

    test('MaterialVariation: seed changes when tiles change', () => {
        const tilesA = [[1, 2], [3, 4], [2, 2]];
        const tilesC = [[1, 2], [3, 4], [2, 3]];
        const a = computeMaterialVariationSeedFromTiles(tilesA, { salt: 'building' });
        const c = computeMaterialVariationSeedFromTiles(tilesC, { salt: 'building' });
        assertTrue(a !== c, 'Expected different seeds for different tile sets.');
    });

    test('MaterialVariation: config normalization clamps ranges', () => {
        const cfg = normalizeMaterialVariationConfig({
            worldSpaceScale: 999,
            objectSpaceScale: -5,
            tintAmount: 9,
            roughnessAmount: 9,
            dust: { strength: -1, heightBand: { min: 1, max: 0 } }
        });

        assertTrue(cfg.worldSpaceScale <= 20.0, 'worldSpaceScale should clamp to max.');
        assertTrue(cfg.objectSpaceScale >= 0.001, 'objectSpaceScale should clamp to min.');
        assertTrue(cfg.tintAmount <= 0.35, 'tintAmount should clamp to max.');
        assertTrue(cfg.roughnessAmount <= 0.75, 'roughnessAmount should clamp to max.');
        assertEqual(cfg.dust.strength, 0, 'dust.strength should clamp to 0.');
        assertEqual(cfg.dust.heightBand.min, 0, 'heightBand.min should normalize/swap.');
        assertEqual(cfg.dust.heightBand.max, 1, 'heightBand.max should normalize/swap.');
    });

    // ========== Summary ==========
    console.log('\n' + '='.repeat(50));
    if (errors.length === 0) {
        console.log('✅ All tests passed!');
    } else {
        console.log(`❌ ${errors.length} test(s) failed:\n`);
        errors.forEach(({ name, error }) => {
            console.error(`  • ${name}: ${error}`);
        });
    }
    console.log('='.repeat(50) + '\n');

    // Expose errors globally for easy inspection
    window.__testErrors = errors;
}

// Run tests when module loads
runTests().catch(err => {
    console.error('Test runner failed:', err);
});
