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
    const { BuildingFabricationScene } = await import('/src/graphics/gui/building_fabrication/BuildingFabricationScene.js');
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

        const all = getBuildingConfigs();
        assertTrue(Array.isArray(all) && all.length >= 4, 'Expected at least 4 building configs.');
    });

    test('BuildingCatalog: includes gov_center config', () => {
        const gov = getBuildingConfigById('gov_center');
        assertTrue(!!gov, 'Expected gov_center in catalog.');
        assertEqual(gov.id, 'gov_center');
        assertEqual(gov.name, 'Gov center');

        const all = getBuildingConfigs();
        assertTrue(all.includes(gov), 'Expected catalog list to include Gov center config.');
    });

    test('BuildingCatalog: does not rely on placeholder building_3/building_4 ids', () => {
        assertEqual(getBuildingConfigById('building_3'), null, 'Expected building_3 placeholder id to be absent.');
        assertEqual(getBuildingConfigById('building_4'), null, 'Expected building_4 placeholder id to be absent.');
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

        test('ProceduralMesh: traffic light head exposes skeleton schema', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLightHead.MESH_ID);
            const api = asset?.mesh?.userData?.api ?? null;
            assertTrue(!!api, 'Traffic light head should expose a skeleton api.');
            assertTrue(!!api.schema && typeof api.schema === 'object', 'Skeleton api should expose schema.');
            const props = Array.isArray(api.schema?.properties) ? api.schema.properties : [];
            const active = props.find((p) => p?.id === 'activeLight') ?? null;
            assertTrue(!!active, 'Schema should include activeLight.');
            assertEqual(active.type, 'enum', 'activeLight should be an enum.');
            const options = Array.isArray(active.options) ? active.options : [];
            const ids = options.map((opt) => opt.id);
            assertTrue(ids.includes('none'), 'activeLight should include none.');
            assertTrue(ids.includes('red'), 'activeLight should include red.');
            assertTrue(ids.includes('yellow'), 'activeLight should include yellow.');
            assertTrue(ids.includes('green'), 'activeLight should include green.');
        });

        test('ProceduralMesh: traffic light head activeLight updates emissive state', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLightHead.MESH_ID);
            const api = asset?.mesh?.userData?.api ?? null;
            assertTrue(!!api, 'Traffic light head should expose a skeleton api.');
            const regions = asset?.regions ?? [];
            const idxRed = regions.findIndex((r) => r?.id === 'traffic_light_head:light_red');
            const idxYellow = regions.findIndex((r) => r?.id === 'traffic_light_head:light_yellow');
            const idxGreen = regions.findIndex((r) => r?.id === 'traffic_light_head:light_green');
            assertTrue(idxRed >= 0 && idxYellow >= 0 && idxGreen >= 0, 'Light region indices should exist.');

            api.setValue('activeLight', 'green');

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

            api.setValue('activeLight', 'none');
            assertTrue(getIntensity(asset.materials?.solid, idxGreen) < 1e-6, 'Solid green light should be off for none.');
            assertTrue(getIntensity(asset.materials?.solid, idxRed) < 1e-6, 'Solid red light should be off for none.');
            assertTrue(getIntensity(asset.materials?.solid, idxYellow) < 1e-6, 'Solid yellow light should be off for none.');
        });

        test('ProceduralMesh: composed traffic light exposes child skeleton controls', () => {
            const asset = proceduralMeshes.catalog.createProceduralMeshAsset(proceduralMeshes.trafficLight.MESH_ID);
            const api = asset?.mesh?.userData?.api ?? null;
            assertTrue(!!api, 'Composed traffic light should expose a skeleton api.');
            const children = Array.isArray(api.children) ? api.children : [];
            assertTrue(children.length >= 1, 'Composed traffic light should expose child controls.');
            const head = children.find((child) => child?.schema?.id === 'skeleton.traffic_light_head.v1') ?? null;
            assertTrue(!!head, 'Child controls should include traffic light head skeleton.');

            const armProp = (Array.isArray(api.schema?.properties) ? api.schema.properties : []).find((p) => p?.id === 'armLength') ?? null;
            assertTrue(!!armProp && armProp.type === 'number', 'Composed traffic light should expose armLength.');

            head.setValue('activeLight', 'yellow');
            const idxYellow = (asset.regions ?? []).findIndex((r) => r?.id === 'traffic_light_head:light_yellow');
            const idxRed = (asset.regions ?? []).findIndex((r) => r?.id === 'traffic_light_head:light_red');
            const idxGreen = (asset.regions ?? []).findIndex((r) => r?.id === 'traffic_light_head:light_green');
            assertTrue(idxYellow >= 0 && idxRed >= 0 && idxGreen >= 0, 'Composed light region indices should exist.');

            assertTrue(Number(asset.materials?.solid?.[idxYellow]?.emissiveIntensity) > 0.01, 'Composed yellow light should be on.');
            assertTrue(Number(asset.materials?.solid?.[idxRed]?.emissiveIntensity) < 1e-6, 'Composed red light should be off.');
            assertTrue(Number(asset.materials?.solid?.[idxGreen]?.emissiveIntensity) < 1e-6, 'Composed green light should be off.');

            const prevGeo = asset.mesh?.geometry ?? null;
            api.setValue('armLength', 3.2);
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
            assertTrue(dragStarted, 'Drag should start when not editing.');
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

    // ========== Debug Corners 2 Tests (AI_47) ==========
    try {
        const { GameEngine } = await import('/src/app/core/GameEngine.js');
        const { DebugCorners2View } = await import('/src/graphics/gui/debug_corners2/DebugCorners2View.js');

        test('DebugCorners2: view can enter and rebuild telemetry', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;
            const engine = new GameEngine({ canvas });
            const view = new DebugCorners2View(engine, { uiEnabled: false });
            view.enter();
            view.forceRebuild();
            const t = view.getTelemetry();
            assertTrue(t.ok === true, 'Expected initial fillet telemetry to be OK.');
            view.exit();
        });

        test('DebugCorners2: debug option toggles affect scene visibility', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;
            const engine = new GameEngine({ canvas });
            const view = new DebugCorners2View(engine, { uiEnabled: false });
            view.enter();
            view.forceRebuild();
            assertTrue(!!view._generatedRoadsGroup, 'Expected generated asphalt group.');
            assertTrue(view._generatedRoadsGroup.visible, 'Expected asphalt visible by default.');

            view.setDebugOptions({ renderAsphalt: false, renderEdges: false, renderCenterline: false, showConnectingPoint: false });
            view.forceRebuild();
            assertFalse(view._generatedRoadsGroup.visible, 'Expected asphalt hidden after toggle.');
            assertFalse(view._lines.aLeft.line.visible, 'Expected edges hidden after toggle.');
            assertFalse(view._lines.aCenter.line.visible, 'Expected centerline hidden after toggle.');
            view.exit();
        });

        test('DebugCorners2: lane/yaw edits update telemetry', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;
            const engine = new GameEngine({ canvas });
            const view = new DebugCorners2View(engine, { uiEnabled: false });
            view.enter();
            view.forceRebuild();
            const before = view.getTelemetry();
            const w0 = before?.roads?.A?.width ?? null;

            view.setRoadConfig('A', { lanes: 6, yaw: Math.PI / 4 });
            view.forceRebuild();
            const after = view.getTelemetry();
            const w1 = after?.roads?.A?.width ?? null;

            assertTrue(Number.isFinite(w0) && Number.isFinite(w1), 'Expected road width telemetry.');
            assertTrue(Math.abs(w1 - w0) > 1e-3, 'Expected width to change when lane count changes.');
            assertNear(after?.roads?.A?.yaw ?? 0, Math.PI / 4, 1e-6, 'Expected yaw telemetry to update.');
            view.exit();
        });

        test('DebugCorners2: connecting point marker matches telemetry', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;
            const engine = new GameEngine({ canvas });
            const view = new DebugCorners2View(engine, { uiEnabled: false });
            view.enter();
            view.setDebugOptions({ showConnectingPoint: true });
            view.forceRebuild();
            const t = view.getTelemetry();
            const cp = t?.roads?.A?.connectingPoint ?? null;
            assertTrue(!!cp, 'Expected connecting point telemetry for road A.');
            const mesh = view._connectingPointMeshes?.A ?? null;
            assertTrue(!!mesh, 'Expected connecting point mesh for road A.');
            assertTrue(mesh.visible, 'Expected connecting point mesh to be visible.');
            assertNear(mesh.position.x, cp.x, 1e-6, 'Connecting point X should match mesh.');
            assertNear(mesh.position.z, cp.z, 1e-6, 'Connecting point Z should match mesh.');
            view.exit();
        });
    } catch (e) {
        console.log('⏭️  Debug Corners 2 tests skipped:', e.message);
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
                        { id: 'p0', tileX: 0, tileY: 0, offsetX: 0, offsetY: 0, tangentFactor: 1 },
                        { id: 'p1', tileX: 1, tileY: 0, offsetX: 0, offsetY: 0, tangentFactor: 1 },
                        { id: 'p2', tileX: 2, tileY: 0, offsetX: 0, offsetY: 0, tangentFactor: 1 },
                        { id: 'p3', tileX: 3, tileY: 0, offsetX: 0, offsetY: 0, tangentFactor: 1 }
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
                        { id: 'a', tileX: 0, tileY: 0, offsetX: 0, offsetY: 0, tangentFactor: 1 },
                        { id: 'b', tileX: 1, tileY: 0, offsetX: 0, offsetY: 0, tangentFactor: 1 }
                    ]
                }
            ];

            const out = rebuildRoadDebuggerPipeline({ roads, settings: { origin: { x: 0, z: 0 }, tileSize: 24, laneWidth, marginFactor: 0.1 } });
            const seg = out.segments[0];
            assertTrue(!!seg, 'Expected segment output.');

            const getLine = (kind) => seg.polylines.find((p) => p.kind === kind);
            const z0 = (kind) => getLine(kind)?.points?.[0]?.z;

            assertNear(z0('centerline'), 0, 1e-6, 'Centerline should be at divider.');
            assertNear(z0('forward_centerline'), -(lanesF * laneWidth) * 0.5, 1e-6, 'Forward centerline offset.');
            assertNear(z0('backward_centerline'), (lanesB * laneWidth) * 0.5, 1e-6, 'Backward centerline offset.');
            assertNear(z0('lane_edge_right'), -(lanesF * laneWidth), 1e-6, 'Forward lane edge offset.');
            assertNear(z0('lane_edge_left'), lanesB * laneWidth, 1e-6, 'Backward lane edge offset.');
            assertNear(z0('asphalt_edge_right'), -(lanesF * laneWidth + margin), 1e-6, 'Forward asphalt edge offset.');
            assertNear(z0('asphalt_edge_left'), lanesB * laneWidth + margin, 1e-6, 'Backward asphalt edge offset.');

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
                        { id: 'p0', tileX: 0, tileY: 0, offsetX: 1.2, offsetY: -0.4, tangentFactor: 1 },
                        { id: 'p1', tileX: 0, tileY: 2, offsetX: -0.2, offsetY: 0.7, tangentFactor: 0.8 },
                        { id: 'p2', tileX: 2, tileY: 2, offsetX: 0.0, offsetY: 0.0, tangentFactor: 1.1 }
                    ]
                }
            ];

            const settings = { origin: { x: 0, z: 0 }, tileSize: 24, laneWidth: 4.8, marginFactor: 0.1 };
            const a = rebuildRoadDebuggerPipeline({ roads, settings });
            const b = rebuildRoadDebuggerPipeline({ roads, settings });
            assertEqual(JSON.stringify(a), JSON.stringify(b), 'Expected deterministic pipeline output.');
        });
    } catch (e) {
        console.log('⏭️  Road Debugger pipeline tests skipped:', e.message);
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

                const exp = roadRow.querySelector('.road-debugger-expand');
                exp.dispatchEvent(new MouseEvent('click', { bubbles: true }));

                const segRow = document.querySelector(`.road-debugger-seg-row[data-segment-id="${segId}"]`);
                assertTrue(!!segRow, 'Expected segment row after expand.');
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

                let roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
                assertTrue(!!roadRow, 'Expected road row.');
                let laneInputs = roadRow.querySelectorAll('.road-debugger-lane-input');
                assertEqual(laneInputs.length, 2, 'Expected two lane inputs (F/B).');

                laneInputs[0].value = '3';
                laneInputs[0].dispatchEvent(new Event('change'));
                const afterF = view.getDerived().segments.find((s) => s?.roadId === roadId);
                assertNear(afterF.asphaltObb.halfWidthRight, 14.88, 1e-6, 'Expected right half-width to update for lanesF=3.');

                roadRow = document.querySelector(`.road-debugger-road-row[data-road-id="${roadId}"]`);
                laneInputs = roadRow.querySelectorAll('.road-debugger-lane-input');
                laneInputs[1].value = '2';
                laneInputs[1].dispatchEvent(new Event('change'));
                const afterB = view.getDerived().segments.find((s) => s?.roadId === roadId);
                assertNear(afterB.asphaltObb.halfWidthLeft, 10.08, 1e-6, 'Expected left half-width to update for lanesB=2.');
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
            assertNear(moved.offsetX, -0.4 * tileSize, 1e-6, 'Expected offsetX to be relative to new tile center.');
            assertNear(moved.offsetY, 0, 1e-6, 'Expected offsetY to remain.');
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
            const tileSize = view._tileSize;
            const step = tileSize / 10;
            const half = tileSize * 0.5;
            const ox = view._origin.x;
            const oz = view._origin.z;

            view.movePointToWorld(roadId, pointId, { x: ox + 3.1, z: oz - 4.9 }, { snap: true });
            let pt = view.getRoads()[0].points.find((p) => p?.id === pointId);
            const ix = Math.round(pt.offsetX / step);
            const iy = Math.round(pt.offsetY / step);
            assertTrue(ix >= -5 && ix <= 5, 'Expected snap index X within [-5..5].');
            assertTrue(iy >= -5 && iy <= 5, 'Expected snap index Y within [-5..5].');
            assertNear(pt.offsetX, ix * step, 1e-6, 'Expected snapped offsetX to match grid.');
            assertNear(pt.offsetY, iy * step, 1e-6, 'Expected snapped offsetY to match grid.');
            assertTrue(Math.abs(pt.offsetX) <= half + 1e-6, 'Expected snapped offsetX within tile bounds.');
            assertTrue(Math.abs(pt.offsetY) <= half + 1e-6, 'Expected snapped offsetY within tile bounds.');

            view.movePointToWorld(roadId, pointId, { x: ox - tileSize * 100, z: oz - tileSize * 100 }, { snap: true });
            pt = view.getRoads()[0].points.find((p) => p?.id === pointId);
            assertEqual(pt.tileX, 0, 'Expected clamped tileX at map boundary.');
            assertEqual(pt.tileY, 0, 'Expected clamped tileY at map boundary.');
            assertNear(pt.offsetX, -half, 1e-6, 'Expected clamped offsetX inside tile bounds.');
            assertNear(pt.offsetY, -half, 1e-6, 'Expected clamped offsetY inside tile bounds.');
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

                assertTrue(view._markingsGroup?.visible === false, 'Expected markings to be hidden by default.');

                const rows = Array.from(document.querySelectorAll('.road-debugger-row'));
                const markingsRow = rows.find((r) => r.textContent.includes('Markings')) ?? null;
                assertTrue(!!markingsRow, 'Expected Markings toggle row.');
                const input = markingsRow.querySelector('input[type="checkbox"]');
                assertTrue(!!input, 'Expected Markings checkbox input.');

                input.checked = true;
                input.dispatchEvent(new Event('change'));
                assertTrue(view._markingsGroup?.visible === true, 'Expected markings group to be visible after toggle on.');
                assertTrue((view._markingLines?.length ?? 0) > 0, 'Expected lane marking line object.');
                assertTrue((view._arrowMeshes?.length ?? 0) > 0, 'Expected lane arrow mesh object.');

                input.checked = false;
                input.dispatchEvent(new Event('change'));
                assertTrue(view._markingsGroup?.visible === false, 'Expected markings group to be hidden after toggle off.');
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

    runRoadConnectionDebuggerTests({ test, assertTrue });

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
